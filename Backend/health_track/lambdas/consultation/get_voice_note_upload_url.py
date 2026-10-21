import boto3, json, logging, os, uuid
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_VOICE_NOTE_BYTES = 500 * 1024  # 500 KB


def handler(event, context):
    try:
        s3 = boto3.client("s3")
        consultation_table = boto3.resource("dynamodb").Table(os.environ["CONSULTATION_TABLE"])

        user_id = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {}).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        # Verify consultation exists
        c_resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        if not c_resp.get("Item"):
            return err(404, "Consultation not found")

        key = f"voice-notes/{consultation_id}/{uuid.uuid4()}.opus"
        bucket = os.environ["VOICE_NOTES_BUCKET"]

        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": "audio/opus",
                "ContentLength": MAX_VOICE_NOTE_BYTES,
            },
            ExpiresIn=300,  # 5 minutes
        )

        return ok({"upload_url": url, "voice_note_key": key})

    except Exception as e:
        logger.error("Unhandled error in get_voice_note_upload_url: %s", str(e))
        return err(500, "Internal server error")
