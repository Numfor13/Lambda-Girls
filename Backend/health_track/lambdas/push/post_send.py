import boto3, json, logging, os
from health_track_common import params

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_GONE = (404, 410)  # the push service says the subscription no longer exists


def _send_push(subscription_json: dict, payload: dict, vapid_private_key: str, subject: str) -> bool:
    """Send one web push. Returns True on success, False if the subscription is gone; raises otherwise."""
    import pywebpush  # provided by the pywebpush Lambda layer
    try:
        pywebpush.webpush(
            subscription_info=subscription_json,
            data=json.dumps(payload),
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": subject},
            ttl=24 * 3600,
            timeout=10,
        )
        return True
    except pywebpush.WebPushException as e:
        if getattr(e.response, "status_code", None) in _GONE:
            return False
        raise


def handler(event, context):
    """
    Invoked by EventBridge: { "detail": { "user_id": "...", "payload": {...} } }
    (a bare { "user_id", "payload" } direct invoke is also accepted).

    Failures other than a gone subscription are raised so Lambda's async retries
    and the on-failure destination capture them. Never log user_id or endpoints.
    """
    detail = event.get("detail") or event
    user_id = detail.get("user_id")
    payload = detail.get("payload", {})

    if not user_id:
        logger.error("post_send: missing_user_id")
        return {"sent": False, "reason": "missing_user_id"}

    table = boto3.resource("dynamodb").Table(os.environ["PUSH_SUBSCRIPTION_TABLE"])
    item = table.get_item(Key={"user_id": user_id}).get("Item")
    if not item:
        logger.info("post_send: no_subscription")
        return {"sent": False, "reason": "no_subscription"}

    vapid_private_key = params.get_param(os.environ["VAPID_PRIVATE_KEY_PARAM"])
    if not params.is_set(vapid_private_key):
        raise RuntimeError("VAPID private key not configured")

    if not _send_push(item["subscription_json"], payload, vapid_private_key, os.environ["VAPID_SUBJECT"]):
        table.delete_item(Key={"user_id": user_id})
        logger.info("post_send: subscription_expired_deleted")
        return {"sent": False, "reason": "subscription_expired"}

    logger.info("post_send: sent")
    return {"sent": True}
