import boto3, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
        user_id = claims.get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        table = boto3.resource("dynamodb").Table(os.environ["PUSH_SUBSCRIPTION_TABLE"])
        table.delete_item(Key={"user_id": user_id})

        return ok({"unsubscribed": True, "ok": True})

    except Exception as e:
        logger.error("Unhandled error in delete_subscribe: %s", str(e))
        return err(500, "Internal server error")
