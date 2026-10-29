import boto3, logging, os, uuid
from botocore.config import Config
from health_track_common.response import ok, err
import app_util
from app_util import DOC_TYPES, QUEUE_FULL, UPLOAD_EXPIRES, draft_key, parse_body

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """Reserve an application ID and return one presigned POST per required document."""
    try:
        body, error = parse_body(event)
        if error:
            return error
        documents = body.get("documents")
        if not isinstance(documents, dict):
            return err(400, "documents must be an object of {document type: content type}")
        for doc_type, allowed in DOC_TYPES.items():
            if not isinstance(documents.get(doc_type), str) or documents[doc_type] not in allowed:
                return err(400, f"{doc_type} must be one of: {', '.join(sorted(allowed))}")
        if set(documents) - set(DOC_TYPES):
            return err(400, f"Unknown document types: {', '.join(sorted(set(documents) - set(DOC_TYPES)))}")

        if app_util.review_queue_full():
            return err(503, QUEUE_FULL)

        # SSE-KMS bucket: presigned requests must be SigV4.
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION"), config=Config(signature_version="s3v4"))
        application_id = str(uuid.uuid4())
        uploads = {}
        for doc_type in DOC_TYPES:
            content_type = documents[doc_type]
            # S3 enforces the key, the exact content type and the size: the form cannot be repurposed.
            uploads[doc_type] = s3.generate_presigned_post(
                Bucket=os.environ["DOCUMENTS_BUCKET"],
                Key=draft_key(application_id, doc_type),
                Fields={"Content-Type": content_type},
                Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, app_util.MAX_BYTES]],
                ExpiresIn=UPLOAD_EXPIRES,
            )
        return ok({"application_id": application_id, "expires_in": UPLOAD_EXPIRES, "uploads": uploads},
                  status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_uploads: %s", str(e))
        return err(500, "Internal server error")
