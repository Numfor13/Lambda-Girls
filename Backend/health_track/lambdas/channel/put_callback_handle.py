import boto3, json, logging, os, time
from botocore.exceptions import ClientError
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

        request_id = (event.get("pathParameters") or {}).get("request_id")
        if not request_id:
            return err(400, "request_id is required")

        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON")

        note = body.get("note", "")
        now = int(time.time() * 1000)

        callback_table = boto3.resource("dynamodb").Table(os.environ["CALLBACK_TABLE"])
        try:
            callback_table.update_item(
                Key={"request_id": request_id},
                UpdateExpression="SET #s = :handled, handler_note = :note, handled_at = :ts, handled_by = :uid",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":handled": "handled",
                    ":note":    note,
                    ":ts":      now,
                    ":uid":     user_id,
                    ":pending": "pending",
                },
                ConditionExpression="#s = :pending AND attribute_exists(request_id)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "Callback not found or already handled")
            raise

        return ok({"request_id": request_id, "status": "handled"})

    except Exception as e:
        logger.error("Unhandled error in put_callback_handle: %s", str(e))
        return err(500, "Internal server error")
