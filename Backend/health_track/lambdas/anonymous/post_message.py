import logging, time, uuid

from boto3.dynamodb.conditions import Key
from health_track_common.response import ok, err
from anon_util import (
    MAX_MESSAGE_CHARS, get_own_consultation, optional_id, parse_body, path_param,
    response_headers, start, table,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """POST /anonymous/consultations/{consultation_id}/messages -- mirrors consultation/post_message.py.

    Text only; idempotent on client_message_id; sender is the hashed anon id. Like the
    registered-user handler, no event is published.
    """
    headers = response_headers(event)
    try:
        anon_id, error = start(event, headers)
        if error:
            return error

        consultation_id = path_param(event, "consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required", headers=headers)

        body, error = parse_body(event, headers)
        if error:
            return error

        if body.get("content_type", "text") != "text":
            return err(400, "content_type must be 'text' for anonymous messages", headers=headers)
        text_body = body.get("text_body")
        if not isinstance(text_body, str) or not text_body.strip():
            return err(400, "text_body is required for text messages", headers=headers)
        if len(text_body) > MAX_MESSAGE_CHARS:
            return err(400, f"text_body must be at most {MAX_MESSAGE_CHARS} characters", headers=headers)
        client_message_id = body.get("client_message_id")
        if not optional_id(client_message_id):
            return err(400, "client_message_id must be a string", headers=headers)
        client_message_id = client_message_id or str(uuid.uuid4())

        if not get_own_consultation(table("CONSULTATION_TABLE"), consultation_id, anon_id):
            return err(404, "Consultation not found", headers=headers)

        message_table = table("MESSAGE_TABLE")

        # Idempotency: a retry of the same client_message_id returns the stored message.
        existing = message_table.query(
            IndexName="IdempotencyIndex",
            KeyConditionExpression=Key("client_message_id").eq(client_message_id),
            Limit=1,
        ).get("Items", [])
        if existing:
            prior = existing[0]
            if prior.get("consultation_id") != consultation_id or prior.get("sender_id") != anon_id:
                # Never echo another conversation's message back
                return err(409, "client_message_id already used", headers=headers)
            return ok(prior, headers=headers)

        message = {
            "consultation_id":   consultation_id,
            "message_id":        str(uuid.uuid4()),
            "sender_id":         anon_id,
            "sender_role":       "patient",
            "content_type":      "text",
            "text_body":         text_body,
            "voice_note_key":    None,
            "duration_seconds":  None,
            "client_message_id": client_message_id,
            "created_at":        int(time.time() * 1000),
        }
        message_table.put_item(Item=message)
        return ok(message, status_code=201, headers=headers)

    except Exception:
        logger.exception("Unhandled error in anonymous post_message")
        return err(500, "Internal server error", headers=headers)
