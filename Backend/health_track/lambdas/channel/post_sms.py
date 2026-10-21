import boto3, json, logging, os, time, uuid
from session_engine import step
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_SESSION_TTL_SECONDS = 3600  # 1 hour


def handler(event, context):
    try:
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

        new_state, new_ctx, response_text = step(state, ctx, message_body)

        # Save session
        now = int(time.time())
        session_table.put_item(Item={
            "session_id":   session_id,
            "channel":      "sms",
            "phone_number": phone,
            "state":        new_state,
            "context":      new_ctx,
            "ttl":          now + _SESSION_TTL_SECONDS,
            "updated_at":   now * 1000,
        })

        # If callback requested, write callback record
        if new_ctx.get("callback_requested") and not ctx.get("callback_requested"):
            callback_table.put_item(Item={
                "request_id":     str(uuid.uuid4()),
                "phone":          phone,
                "channel":        "sms",
                "triage_summary": str(new_ctx.get("symptom", "")),
                "urgency":        "AMBER",
                "status":         "pending",
                "created_at":     now * 1000,
            })

        # Sandbox: log the outbound SMS response instead of calling telco
        logger.info("SMS response to %s: %s", phone, response_text)

        return ok({"response": response_text, "state": new_state})

    except Exception as e:
        logger.error("Unhandled error in post_sms: %s", str(e))
        return err(500, "Internal server error")
