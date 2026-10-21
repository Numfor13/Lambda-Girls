import boto3, json, logging, os
from decimal import Decimal
from botocore.exceptions import ClientError
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _to_decimal(v):
    """Convert float to Decimal for DynamoDB storage."""
    if isinstance(v, float):
        return Decimal(str(v))
    return v

ALLOWED_FIELDS = [
    "name", "region", "quarter", "address", "phone",
    "latitude", "longitude", "capabilities", "opening_hours",
    "has_backup_power", "accepts_csu_card", "consultation_fee_xaf", "is_active",
]


def handler(event, context):
    try:
        table = boto3.resource("dynamodb").Table(os.environ["FACILITY_TABLE"])

        # Admin check
        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        groups = claims.get("cognito:groups", "")
        if "Admin" not in (groups if isinstance(groups, list) else groups.split(",")):
            return err(403, "Admin group required")

        facility_id = (event.get("pathParameters") or {}).get("facility_id")
        if not facility_id:
            return err(400, "facility_id is required")

        # Parse body
        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, TypeError):
            return err(400, "Invalid JSON body")

        updates = {k: _to_decimal(v) for k, v in body.items() if k in ALLOWED_FIELDS}
        if not updates:
            return err(400, "No valid fields to update")

        # Convert capabilities list to StringSet
        if "capabilities" in updates and isinstance(updates["capabilities"], list):
            caps = updates["capabilities"]
            if caps:
                updates["capabilities"] = set(caps)
                # Update primary_capability too
                updates["primary_capability"] = next(iter(updates["capabilities"]))
            else:
                del updates["capabilities"]

        # Build UpdateExpression
        set_parts = []
        expr_names = {}
        expr_values = {}

        for i, (key, value) in enumerate(updates.items()):
            name_alias = f"#f{i}"
            value_alias = f":v{i}"
            set_parts.append(f"{name_alias} = {value_alias}")
            expr_names[name_alias] = key
            expr_values[value_alias] = value

        update_expr = "SET " + ", ".join(set_parts)

        response = table.update_item(
            Key={"facility_id": facility_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ConditionExpression="attribute_exists(facility_id)",
            ReturnValues="ALL_NEW",
        )

        updated_item = response.get("Attributes", {})
        # Convert sets to lists for JSON serialization
        for k, v in list(updated_item.items()):
            if isinstance(v, set):
                updated_item[k] = list(v)

        return ok(updated_item)

    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return err(404, "Facility not found")
        logger.error("DynamoDB error in update_facility: %s", e, exc_info=True)
        return err(500, "Internal server error")
    except Exception as e:
        logger.error("Unexpected error in update_facility: %s", e, exc_info=True)
        return err(500, "Internal server error")
