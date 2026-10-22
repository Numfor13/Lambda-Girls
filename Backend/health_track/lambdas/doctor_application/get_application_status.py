import boto3, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PUBLIC_FIELDS = {
    "application_id", "full_name", "specialty", "status",
    "submitted_at", "reviewed_at",
}


def handler(event, context):
    try:
        application_id = (event.get("pathParameters") or {}).get("application_id", "")
        if not application_id:
            return err(400, "Missing application_id")

        table = boto3.resource("dynamodb").Table(os.environ["APPLICATIONS_TABLE"])
        result = table.get_item(Key={"application_id": application_id})
        item = result.get("Item")

        if not item:
            return err(404, "Application not found")

        # Expose only safe fields to the applicant
        public = {k: item[k] for k in PUBLIC_FIELDS if k in item}

        # Include rejection reason so applicant knows why
        if item.get("status") == "rejected" and item.get("rejection_reason"):
            public["rejection_reason"] = item["rejection_reason"]

        return ok(public)

    except Exception as e:
        logger.error("Error in get_application_status: %s", e)
        return err(500, "Internal server error")
