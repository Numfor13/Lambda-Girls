import boto3, hmac, json, logging, os, time, uuid
from session_engine import step
from health_track_common import params
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_SESSION_TTL_SECONDS = 3600  # 1 hour


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

        phone = body.get("from", "").strip()
        message_body = body.get("text", "").strip()
        if not phone or not message_body:
            return err(400, "from and text are required")

        session_id = f"{phone}#sms"
        ddb = boto3.resource("dynamodb")
        session_table = ddb.Table(os.environ["SESSION_TABLE"])
        callback_table = ddb.Table(os.environ["CALLBACK_TABLE"])

        # Load or init session
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
                "channel":        "sms",
                "triage_summary": str(new_ctx.get("symptom", "")),
                "urgency":        "AMBER",
                "status":         "pending",
                "created_at":     now * 1000,
            })

        logger.info("sms session: %s -> %s", state, new_state)

        # Save session
        session_table.put_item(Item={
            "session_id":   session_id,
            "channel":      "sms",
            "phone_number": phone,
            "state":        new_state,
            "context":      new_ctx,
            "ttl":          now + _SESSION_TTL_SECONDS,
            "updated_at":   now * 1000,
        })

        return ok({"response": response_text, "state": new_state})

    except Exception as e:
        logger.error("Unhandled error in post_sms: %s", str(e))
        return err(500, "Internal server error")
