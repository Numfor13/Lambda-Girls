import boto3, json, logging, os, time, uuid
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from health_track_common import access, events
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_TEXT_CHARS = 4000


def handler(event, context):
    try:
        ddb = boto3.resource("dynamodb")
        message_table = ddb.Table(os.environ["MESSAGE_TABLE"])
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])

        user_id = access.claims_of(event).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        try:
            body = json.loads(event.get("body") or "{}", parse_float=Decimal)  # DynamoDB rejects floats
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        content_type = body.get("content_type", "text")
        if content_type not in ("text", "voice_note"):
            return err(400, "content_type must be 'text' or 'voice_note'")

        text_body = body.get("text_body")
        if text_body is not None and (not isinstance(text_body, str) or len(text_body) > MAX_TEXT_CHARS):
            return err(400, f"text_body must be a string of at most {MAX_TEXT_CHARS} characters")
        if content_type == "text" and not (text_body or "").strip():
            return err(400, "text_body is required for text messages")

        if not access.voice_note_key_ok(consultation_id, body.get("voice_note_key")):
            return err(400, "voice_note_key does not belong to this consultation")

        c_resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        consultation = c_resp.get("Item")
        if not consultation:
            return err(404, "Consultation not found")

        # Role is derived from who the caller is to this consultation, never from the body.
        sender_role = access.writer_role(event, consultation, user_id)
        if not sender_role:
            return err(403, "Access denied")
        if sender_role == "doctor" and consultation.get("status") != "open":
            return err(409, "Consultation is not in 'open' status")

        client_message_id = body.get("client_message_id") or str(uuid.uuid4())

        # Idempotency check: if client_message_id already exists, return existing message
        existing = message_table.query(
            IndexName="IdempotencyIndex",
            KeyConditionExpression=Key("client_message_id").eq(client_message_id),
            Limit=1,
        )
        if existing.get("Items"):
            prior = existing["Items"][0]
            # Never hand back someone else's message for a guessed client_message_id.
            if prior.get("consultation_id") != consultation_id or prior.get("sender_id") != user_id:
                return err(409, "client_message_id already used")
            return ok(prior)

        message_id = str(uuid.uuid4())
        now = int(time.time() * 1000)

        message = {
            "consultation_id":   consultation_id,
            "message_id":        message_id,
            "sender_id":         user_id,
            "sender_role":       sender_role,
            "content_type":      content_type,
            "text_body":         text_body,
            "voice_note_key":    body.get("voice_note_key"),
            "duration_seconds":  body.get("duration_seconds"),
            "client_message_id": client_message_id,
            "created_at":        now,
        }

        message_table.put_item(Item=message)

        if sender_role == "doctor":
            events.publish("message.sent", {
                "user_id": consultation["phone_owner_id"],
                "payload": {"title": "CareBridge", "body": "Your doctor replied."},
            })

        return ok(message, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_message: %s", str(e))
        return err(500, "Internal server error")
