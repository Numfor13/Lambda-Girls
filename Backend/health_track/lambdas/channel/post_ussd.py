import boto3, json, logging, os, time, uuid
from session_engine import step
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_SESSION_TTL_SECONDS = 300  # USSD: 5-minute sessions


def handler(event, context):
    try:
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

        new_state, new_ctx, response_text = step(state, ctx, message_body)

        now = int(time.time())
        session_table.put_item(Item={
            "session_id":   session_id,
            "channel":      "ussd",
            "phone_number": phone,
            "state":        new_state,
            "context":      new_ctx,
            "ttl":          now + _SESSION_TTL_SECONDS,
            "updated_at":   now * 1000,
        })

        if new_ctx.get("callback_requested") and not ctx.get("callback_requested"):
            callback_table.put_item(Item={
                "request_id":     str(uuid.uuid4()),
                "phone":          phone,
                "channel":        "ussd",
                "triage_summary": str(new_ctx.get("symptom", "")),
                "urgency":        "AMBER",
                "status":         "pending",
                "created_at":     now * 1000,
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
