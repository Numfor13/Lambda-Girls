import boto3, hmac, json, logging, os, time, uuid
from session_engine import step
from health_track_common import params
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_SESSION_TTL_SECONDS = 300  # USSD: 5-minute sessions


def _gateway_authorized(event) -> bool:
    """The telco gateway must present the shared token (X-Gateway-Token header or ?token=)."""
    expected = params.get_param(os.environ["GATEWAY_TOKEN_PARAM"])
    if not params.is_set(expected):
        return False
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    supplied = headers.get("x-gateway-token") or (event.get("queryStringParameters") or {}).get("token") or ""
    return hmac.compare_digest(supplied.encode(), expected.encode())


def handler(event, context):
    try:
        if not _gateway_authorized(event):
            return err(401, "Unauthorized")

        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON")

        phone        = body.get("phoneNumber", "").strip()
        ussd_session = body.get("sessionId", "").strip()
        message_body = body.get("text", "").strip()

        if not phone:
            return err(400, "phoneNumber is required")

        session_id = f"{phone}#ussd"
        ddb = boto3.resource("dynamodb")
        session_table = ddb.Table(os.environ["SESSION_TABLE"])
        callback_table = ddb.Table(os.environ["CALLBACK_TABLE"])

        resp = session_table.get_item(Key={"session_id": session_id})
        item = resp.get("Item", {})
        state = item.get("state", "INIT")
        ctx   = item.get("context", {})
        ctx.pop("callback_requested", None)  # sessions saved before SYS-39 may still carry it

        new_state, new_ctx, response_text = step(state, ctx, message_body)

        # Write the callback record, then drop the one-shot flag so the saved session
        # does not suppress a later callback request in the same session (SYS-39).
        now = int(time.time())
        if new_ctx.pop("callback_requested", False):
            callback_table.put_item(Item={
                "request_id":     str(uuid.uuid4()),
                "phone":          phone,
                "channel":        "ussd",
                "triage_summary": str(new_ctx.get("symptom", "")),
                "urgency":        "AMBER",
                "status":         "pending",
                "created_at":     now * 1000,
            })

        logger.info("ussd session: %s -> %s", state, new_state)

        session_table.put_item(Item={
            "session_id":   session_id,
            "channel":      "ussd",
            "phone_number": phone,
            "state":        new_state,
            "context":      new_ctx,
            "ttl":          now + _SESSION_TTL_SECONDS,
            "updated_at":   now * 1000,
        })

        is_final = new_state in ("TRIAGE_DONE", "CALLBACK_DONE", "FIRST_AID")
        return ok({
            "response":  response_text,
            "state":     new_state,
            "is_final":  is_final,
        })

    except Exception as e:
        logger.error("Unhandled error in post_ussd: %s", str(e))
        return err(500, "Internal server error")
