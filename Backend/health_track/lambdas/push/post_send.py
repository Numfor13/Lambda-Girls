import boto3, json, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _send_push(subscription_json: dict, payload: dict, vapid_private_key: str) -> bool:
    """Send a web push notification. Returns True on success, False on 410 (expired)."""
    # Stub: in real deployment, use pywebpush here.
    # In tests this function is monkeypatched.
    try:
        import pywebpush
        pywebpush.webpush(
            subscription_info=subscription_json,
            data=json.dumps(payload),
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": "mailto:admin@healthtrack.cm"},
        )
        return True
    except Exception as e:
        if "410" in str(e) or "Gone" in str(e):
            return False  # subscription expired
        raise


def handler(event, context):
    """
    Invoked directly by EventBridge or internal Lambda invoke.
    Expected event shape:
      { "user_id": "...", "payload": { "title": "...", "body": "..." } }
    Also handles EventBridge envelope:
      { "detail": { "user_id": "...", "payload": {...} } }
    """
    try:
        # Support both direct invocation and EventBridge envelope
        detail = event.get("detail") or event
        user_id = detail.get("user_id")
        payload = detail.get("payload", {})

        if not user_id:
            logger.error("post_send: missing user_id in event")
            return err(400, "user_id is required")

        table = boto3.resource("dynamodb").Table(os.environ["PUSH_SUBSCRIPTION_TABLE"])
        resp = table.get_item(Key={"user_id": user_id})
        item = resp.get("Item")
        if not item:
            logger.info("post_send: no subscription for user_id=%s", user_id)
            return ok({"sent": False, "reason": "no_subscription"})

        subscription_json = item["subscription_json"]
        vapid_private_key = os.environ.get("VAPID_PRIVATE_KEY", "")

        success = _send_push(subscription_json, payload, vapid_private_key)
        if not success:
            # 410 Gone -- subscription expired; delete it
            table.delete_item(Key={"user_id": user_id})
            logger.info("post_send: subscription expired for user_id=%s, deleted", user_id)
            return ok({"sent": False, "reason": "subscription_expired"})

        return ok({"sent": True})

    except Exception as e:
        logger.error("Unhandled error in post_send: %s", str(e))
        return err(500, "Internal server error")
