import logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        vapid_public_key = os.environ.get("VAPID_PUBLIC_KEY", "")
        if not vapid_public_key:
            return err(503, "VAPID public key not configured")
        return ok({"vapid_public_key": vapid_public_key})
    except Exception as e:
        logger.error("Unhandled error in get_vapid_public_key: %s", str(e))
        return err(500, "Internal server error")
