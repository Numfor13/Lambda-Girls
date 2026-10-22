import boto3, json, logging, os
from datetime import datetime, timezone
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
        body = json.loads(event.get("body") or "{}")
        reason = (body.get("reason") or "").strip()

        if not reason:
            return err(400, "Rejection reason is required")

        if not application_id:
            return err(400, "Missing application_id")

        table = boto3.resource("dynamodb").Table(os.environ["APPLICATIONS_TABLE"])
        result = table.get_item(Key={"application_id": application_id})
        if not result.get("Item"):
            return err(404, "Application not found")

        now = datetime.now(timezone.utc).isoformat()
        table.update_item(
            Key={"application_id": application_id},
            UpdateExpression="SET #status = :s, rejection_reason = :r, reviewed_at = :t, reviewed_by = :by",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":s": "rejected",
                ":r": reason,
                ":t": now,
                ":by": user_id,
            },
        )

        logger.info("Doctor application rejected: %s", application_id)
        return ok({"rejected": application_id})

    except Exception as e:
        logger.error("Error in reject_application: %s", e)
        return err(500, "Internal server error")
