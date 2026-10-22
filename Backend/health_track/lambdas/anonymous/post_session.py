import logging, time, uuid

from health_track_common.anonymous import SESSION_TTL_SECONDS
from health_track_common.response import ok, err
from anon_util import response_headers, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """POST /anonymous/session -- mint a 7-day anonymous session token (returned once, never logged)."""
    headers = response_headers(event)
    try:
        token = str(uuid.uuid4())
        now = int(time.time())
        expires_at = now + SESSION_TTL_SECONDS
        table("ANON_SESSION_TABLE").put_item(
            Item={"session_token": token, "created_at": now, "ttl": expires_at},
            ConditionExpression="attribute_not_exists(session_token)",
        )
        return ok({"session_token": token, "expires_at": expires_at}, status_code=201, headers=headers)
    except Exception:
        logger.exception("Unhandled error in anonymous post_session")
        return err(500, "Internal server error", headers=headers)
