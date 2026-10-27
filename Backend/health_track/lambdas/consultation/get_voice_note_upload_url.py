import boto3, logging, os, uuid
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
        consultation_table = boto3.resource("dynamodb").Table(os.environ["CONSULTATION_TABLE"])

        user_id = access.claims_of(event).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        c_resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        consultation = c_resp.get("Item")
        if not consultation:
            return err(404, "Consultation not found")
        if not access.writer_role(event, consultation, user_id):
            return err(403, "Access denied")

        key = f"voice-notes/{consultation_id}/{uuid.uuid4()}.opus"
        bucket = os.environ["VOICE_NOTES_BUCKET"]

        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": "audio/opus",
            },
            ExpiresIn=300,  # 5 minutes
        )

        return ok({"upload_url": url, "voice_note_key": key})

    except Exception as e:
        logger.error("Unhandled error in get_voice_note_upload_url: %s", str(e))
        return err(500, "Internal server error")
