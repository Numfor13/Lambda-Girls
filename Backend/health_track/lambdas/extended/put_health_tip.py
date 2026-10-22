import boto3, logging, os, time
from botocore.exceptions import ClientError
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, path_param, validate_tip_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event, "Admin")
        if error:
            return error

        tip_id = path_param(event, "tip_id")
        if not tip_id:
            return err(400, "tip_id is required")

        body, error = parse_body(event)
        if error:
            return error

        fields, message = validate_tip_fields(body, partial=True)
        if message:
            return err(400, message)
        if not fields:
            return err(400, "No updatable fields supplied")

        fields["updated_at"] = int(time.time() * 1000)
        fields["updated_by"] = user_id
        names = {f"#f{i}": k for i, k in enumerate(fields)}
        values = {f":v{i}": v for i, v in enumerate(fields.values())}
        update_expr = "SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(fields)))

        table = boto3.resource("dynamodb").Table(os.environ["HEALTH_TIP_TABLE"])
        try:
            updated = table.update_item(
                Key={"tip_id": tip_id},
                UpdateExpression=update_expr,
                ConditionExpression="attribute_exists(tip_id)",
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ReturnValues="ALL_NEW",
            )["Attributes"]
        except ClientError as ce:
            if ce.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(404, "Health tip not found")
            raise

        return ok(updated)

    except Exception as e:
        logger.error("Unhandled error in put_health_tip: %s", str(e))
        return err(500, "Internal server error")
