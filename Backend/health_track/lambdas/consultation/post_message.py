import boto3, json, logging, os, time, uuid
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        ddb = boto3.resource("dynamodb")
        message_table = ddb.Table(os.environ["MESSAGE_TABLE"])
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])

        claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
        user_id = claims.get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        content_type = body.get("content_type", "text")
        if content_type not in ("text", "voice_note"):
            return err(400, "content_type must be 'text' or 'voice_note'")

        if content_type == "text" and not body.get("text_body", "").strip():
            return err(400, "text_body is required for text messages")

        client_message_id = body.get("client_message_id") or str(uuid.uuid4())

        # Idempotency check: if client_message_id already exists, return existing message
        existing = message_table.query(
            IndexName="IdempotencyIndex",
            KeyConditionExpression=Key("client_message_id").eq(client_message_id),
            Limit=1,
        )
        if existing.get("Items"):
            return ok(existing["Items"][0])

        # Verify consultation exists
        c_resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        if not c_resp.get("Item"):
            return err(404, "Consultation not found")

        groups = claims.get("cognito:groups", "")
        is_doctor = "Doctor" in (groups if isinstance(groups, list) else groups.split(","))
        sender_role = "doctor" if is_doctor else "patient"

        message_id = str(uuid.uuid4())
        now = int(time.time() * 1000)

        message = {
            "consultation_id":   consultation_id,
            "message_id":        message_id,
            "sender_id":         user_id,
            "sender_role":       sender_role,
            "content_type":      content_type,
            "text_body":         body.get("text_body"),
            "voice_note_key":    body.get("voice_note_key"),
            "duration_seconds":  body.get("duration_seconds"),
            "client_message_id": client_message_id,
            "created_at":        now,
        }

        message_table.put_item(Item=message)
        return ok(message, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_message: %s", str(e))
        return err(500, "Internal server error")
