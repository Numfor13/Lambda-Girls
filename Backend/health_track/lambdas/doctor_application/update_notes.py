import boto3, json, logging, os
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

        update_expr = "SET #status = :status"
        names = {"#status": "status"}
        values = {":status": "under_review"}

        if "admin_notes" in body:
            update_expr += ", admin_notes = :notes"
            values[":notes"] = body["admin_notes"]

        if "called_hospital" in body:
            update_expr += ", called_hospital = :called"
            values[":called"] = bool(body["called_hospital"])

        table = boto3.resource("dynamodb").Table(os.environ["APPLICATIONS_TABLE"])
        table.update_item(
            Key={"application_id": application_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )

        return ok({"updated": application_id})

    except Exception as e:
        logger.error("Error in update_notes: %s", e)
        return err(500, "Internal server error")
