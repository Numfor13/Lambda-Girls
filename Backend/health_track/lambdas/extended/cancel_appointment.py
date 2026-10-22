import boto3, logging, os, time
from health_track_common.auth import require_group, get_groups
from health_track_common.response import ok, err
from extended_util import path_param

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event)
        if error:
            return error

        appointment_id = path_param(event, "appointment_id")
        if not appointment_id:
            return err(400, "appointment_id is required")

        table = boto3.resource("dynamodb").Table(os.environ["APPOINTMENT_TABLE"])
        item = table.get_item(Key={"appointment_id": appointment_id}).get("Item")
        # Non-owners (other than Admin) get 404 so existence is not leaked
        if not item or (item.get("patient_id") != user_id and "Admin" not in get_groups(event)):
            return err(404, "Appointment not found")

        if item.get("status") == "cancelled":
            return ok(item)

        updated = table.update_item(
            Key={"appointment_id": appointment_id},
            UpdateExpression="SET #s = :cancelled, updated_at = :now, cancelled_by = :by",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":cancelled": "cancelled",
                ":now": int(time.time() * 1000),
                ":by": user_id,
            },
            ReturnValues="ALL_NEW",
        )["Attributes"]
        return ok(updated)

    except Exception as e:
        logger.error("Unhandled error in cancel_appointment: %s", str(e))
        return err(500, "Internal server error")
