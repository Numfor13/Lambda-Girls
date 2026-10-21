import boto3, json, logging, os, time, uuid
from decimal import Decimal, ROUND_HALF_UP
from botocore.exceptions import ClientError
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _to_decimal(v):
    """Convert a float or int to Decimal for DynamoDB storage."""
    if isinstance(v, float):
        return Decimal(str(v))
    return v

REQUIRED_FIELDS = ["name", "region", "quarter", "address", "phone", "latitude", "longitude"]
OPTIONAL_FIELDS = [
    "capabilities", "opening_hours", "has_backup_power",
    "accepts_csu_card", "consultation_fee_xaf",
]


def make_facility_id():
    ts = int(time.time() * 1000)
    return f"{ts:013x}-{uuid.uuid4().hex[:12]}"


def handler(event, context):
    try:
        table = boto3.resource("dynamodb").Table(os.environ["FACILITY_TABLE"])

        # Admin check
        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        groups = claims.get("cognito:groups", "")
        if "Admin" not in (groups if isinstance(groups, list) else groups.split(",")):
            return err(403, "Admin group required")

        # Parse body
        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, TypeError):
            return err(400, "Invalid JSON body")

        # Validate required fields
        missing = [f for f in REQUIRED_FIELDS if body.get(f) is None]
        if missing:
            return err(400, f"Missing required fields: {', '.join(missing)}")

        facility_id = make_facility_id()
        now = int(time.time() * 1000)

        item = {
            "facility_id": facility_id,
            "is_active": True,
            "created_at": now,
        }
        for field in REQUIRED_FIELDS:
            item[field] = _to_decimal(body[field])

        for field in OPTIONAL_FIELDS:
            if body.get(field) is not None:
                item[field] = _to_decimal(body[field])

        # Convert capabilities list to StringSet
        if "capabilities" in item and isinstance(item["capabilities"], list):
            caps = item["capabilities"]
            if caps:
                item["capabilities"] = set(caps)
            else:
                del item["capabilities"]

        # Set primary_capability from capabilities (for GSI)
        if "capabilities" in item and item["capabilities"]:
            item["primary_capability"] = next(iter(item["capabilities"]))
        else:
            item["primary_capability"] = "general"

        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(facility_id)",
        )

        # Convert set back to list for JSON serialization
        response_item = dict(item)
        if isinstance(response_item.get("capabilities"), set):
            response_item["capabilities"] = list(response_item["capabilities"])

        return ok(response_item, status_code=201)

    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return err(409, "Facility already exists")
        logger.error("DynamoDB error in create_facility: %s", e, exc_info=True)
        return err(500, "Internal server error")
    except Exception as e:
        logger.error("Unexpected error in create_facility: %s", e, exc_info=True)
        return err(500, "Internal server error")
