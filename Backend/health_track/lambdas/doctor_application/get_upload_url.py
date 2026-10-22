import boto3, logging, os, uuid
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        content_type = params.get("content_type", "application/pdf")

        if content_type not in ALLOWED_TYPES:
            return err(400, f"Allowed types: {', '.join(ALLOWED_TYPES)}")

        key = f"recommendations/{uuid.uuid4().hex}"
        s3 = boto3.client("s3")
        presigned = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": os.environ["DOCS_BUCKET"],
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=900,  # 15 minutes
        )

        return ok({"upload_url": presigned, "key": key})

    except Exception as e:
        logger.error("Error in get_upload_url: %s", e)
        return err(500, "Internal server error")
