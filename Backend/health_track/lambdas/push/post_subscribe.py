import boto3, json, logging, os, time
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
        user_id = claims.get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        endpoint = body.get("endpoint", "").strip()
        keys = body.get("keys")
        if not endpoint or not keys:
            return err(400, "endpoint and keys are required")
        if not isinstance(keys, dict) or not keys.get("p256dh") or not keys.get("auth"):
            return err(400, "keys.p256dh and keys.auth are required")

        subscription_json = {
            "endpoint": endpoint,
            "keys": {
                "p256dh": keys["p256dh"],
                "auth": keys["auth"],
            },
        }

        table = boto3.resource("dynamodb").Table(os.environ["PUSH_SUBSCRIPTION_TABLE"])
        table.put_item(Item={
            "user_id":           user_id,
            "subscription_json": subscription_json,
            "updated_at":        int(time.time() * 1000),
        })

        return ok({"subscribed": True})

    except Exception as e:
        logger.error("Unhandled error in post_subscribe: %s", str(e))
        return err(500, "Internal server error")
