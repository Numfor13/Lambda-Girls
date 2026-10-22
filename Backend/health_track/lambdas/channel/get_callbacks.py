import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _require_operator(event):
    claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub")
    if not user_id:
        return None, err(401, "Unauthorized")
    groups = claims.get("cognito:groups", "")
    if "Operator" not in (groups if isinstance(groups, list) else groups.split(",")):
        return None, err(403, "Operator group required")
    return user_id, None


def handler(event, context):
    try:
        user_id, error = _require_operator(event)
        if error:
            return error

        callback_table = boto3.resource("dynamodb").Table(os.environ["CALLBACK_TABLE"])
        items = callback_table.query(
            IndexName="UrgencyIndex",
            KeyConditionExpression=Key("status").eq("pending"),
            ScanIndexForward=True,
        ).get("Items", [])

        return ok({"callbacks": items, "count": len(items)})

    except Exception as e:
        logger.error("Unhandled error in get_callbacks: %s", str(e))
        return err(500, "Internal server error")
