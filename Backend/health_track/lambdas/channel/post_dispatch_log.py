import boto3, json, logging, os, time, uuid
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

        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON")

        facility_id = body.get("facility_id", "").strip()
        if not facility_id:
            return err(400, "facility_id is required")

        dispatch_table = boto3.resource("dynamodb").Table(os.environ["DISPATCH_LOG_TABLE"])
        log_id = str(uuid.uuid4())
        now = int(time.time() * 1000)
        dispatch_table.put_item(Item={
            "log_id":      log_id,
            "facility_id": facility_id,
            "operator_id": user_id,
            "note":        body.get("note", ""),
            "urgency":     body.get("urgency", ""),
            "created_at":  now,
        })

        return ok({"log_id": log_id}, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_dispatch_log: %s", str(e))
        return err(500, "Internal server error")
