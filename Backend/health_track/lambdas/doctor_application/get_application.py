import boto3, logging, os
from botocore.config import Config
from health_track_common.response import ok, err
from app_util import admin_application, query_index

logger = logging.getLogger()
logger.setLevel(logging.INFO)

URL_EXPIRES = 300


def _others(index, key, value, application_id):
    return [{"application_id": a["application_id"], "status": a["status"]}
            for a in query_index(index, key, value) if a["application_id"] != application_id]


def handler(event, context):
    """Admin: the full application, short-lived links to its documents, and other applications sharing
    its ONMC number or email (the strongest fraud signals)."""
    try:
        _, item, error = admin_application(event)
        if error:
            return error
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION"), config=Config(signature_version="s3v4"))
        document_urls = {
            doc_type: s3.generate_presigned_url("get_object", ExpiresIn=URL_EXPIRES, Params={
                "Bucket": os.environ["DOCUMENTS_BUCKET"], "Key": doc["key"]})
            for doc_type, doc in item["documents"].items()
        }
        application_id = item["application_id"]
        duplicates = {
            "onmc_number": _others("OnmcIndex", "onmc_number", item["onmc_number"], application_id),
            "email": _others("EmailIndex", "email", item["email"], application_id),
        }
        return ok({**item, "document_urls": document_urls, "duplicates": duplicates})

    except Exception as e:
        logger.error("Unhandled error in get_application: %s", str(e))
        return err(500, "Internal server error")
