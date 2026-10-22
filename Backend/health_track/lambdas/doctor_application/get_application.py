import boto3, logging, os
from health_track_common.auth import require_group
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event, "Admin")
        if error:
            return error

        application_id = (event.get("pathParameters") or {}).get("application_id", "")
        if not application_id:
            return err(400, "Missing application_id")

        table = boto3.resource("dynamodb").Table(os.environ["APPLICATIONS_TABLE"])
        result = table.get_item(Key={"application_id": application_id})
        item = result.get("Item")
        if not item:
            return err(404, "Application not found")

        # Generate a short-lived presigned URL to view the recommendation letter
        if item.get("document_s3_key"):
            s3 = boto3.client("s3")
            item["document_url"] = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": os.environ["DOCS_BUCKET"], "Key": item["document_s3_key"]},
                ExpiresIn=300,
            )

        return ok(item)

    except Exception as e:
        logger.error("Error in get_application: %s", e)
        return err(500, "Internal server error")
