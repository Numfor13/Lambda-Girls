import boto3, logging, os
from boto3.dynamodb.conditions import Key
from botocore.config import Config
from health_track_common import access
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        # The bucket is SSE-KMS encrypted, so presigned URLs must be SigV4.
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION"),
                          config=Config(signature_version="s3v4"))
        ddb = boto3.resource("dynamodb")
        message_table = ddb.Table(os.environ["MESSAGE_TABLE"])
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])

        user_id = access.claims_of(event).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        path = event.get("pathParameters") or {}
        consultation_id = path.get("consultation_id")
        message_id = path.get("message_id")
        if not consultation_id or not message_id:
            return err(400, "consultation_id and message_id are required")

        # Verify access to consultation
        c_resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        consultation = c_resp.get("Item")
        if not consultation:
            return err(404, "Consultation not found")
        if not access.can_read(event, consultation, user_id):
            return err(403, "Access denied")

        # Fetch message
        msg_resp = message_table.query(
            KeyConditionExpression=Key("consultation_id").eq(consultation_id) & Key("message_id").eq(message_id),
            Limit=1,
        )
        messages = msg_resp.get("Items", [])
        if not messages:
            return err(404, "Message not found")
        message = messages[0]

        voice_note_key = message.get("voice_note_key")
        if not voice_note_key:
            return err(400, "Message has no voice note")
        if not access.voice_note_key_ok(consultation_id, voice_note_key):
            return err(400, "Invalid voice note key")

        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": os.environ["VOICE_NOTES_BUCKET"], "Key": voice_note_key},
            ExpiresIn=300,
        )

        return ok({"download_url": url, "expires_in": 300})

    except Exception as e:
        logger.error("Unhandled error in get_voice_note_download_url: %s", str(e))
        return err(500, "Internal server error")
