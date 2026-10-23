import boto3, json, logging, os, time
from urllib.parse import urlsplit
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_MAX_ENDPOINT_LEN = 1024


def _valid_endpoint(endpoint: str) -> bool:
    """SSRF guard: post_send POSTs to this URL, so only public https hostnames are allowed."""
    if len(endpoint) > _MAX_ENDPOINT_LEN:
        return False
    try:
        parts = urlsplit(endpoint)
        host = (parts.hostname or "").rstrip(".")
    except ValueError:
        return False
    if parts.scheme != "https" or "." not in host or host == "localhost" or host.endswith(".localhost"):
        return False
    # An alphabetic TLD rules out IPv4/IPv6 literals and numeric forms like https://2130706433/
    return host.rsplit(".", 1)[1].isalpha()


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

        # The frontend sends {"subscription": PushSubscription.toJSON()}; bare {endpoint, keys} also accepted.
        sub = body.get("subscription", body)
        if not isinstance(sub, dict):
            return err(400, "subscription must be an object")
        endpoint = sub.get("endpoint")
        keys = sub.get("keys")
        if not isinstance(endpoint, str) or not endpoint.strip() or not keys:
            return err(400, "endpoint and keys are required")
        endpoint = endpoint.strip()
        if not _valid_endpoint(endpoint):
            return err(400, "endpoint must be a public https URL")
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

        return ok({"subscribed": True, "ok": True})

    except Exception as e:
        logger.error("Unhandled error in post_subscribe: %s", str(e))
        return err(500, "Internal server error")
