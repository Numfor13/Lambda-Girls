import boto3, logging, os, time
from botocore.exceptions import ClientError
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import path_param

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        _, error = require_group(event, "Admin")
        if error:
            return error

        appointment_id = path_param(event, "appointment_id")
        if not appointment_id:
            return err(400, "appointment_id is required")

        table = boto3.resource("dynamodb").Table(os.environ["APPOINTMENT_TABLE"])
        item = table.get_item(Key={"appointment_id": appointment_id}).get("Item")
        if not item:
            return err(404, "Appointment not found")
        if item.get("status") != "requested":
            return err(409, f"Cannot confirm an appointment in status '{item.get('status')}'")

        try:
            updated = table.update_item(
                Key={"appointment_id": appointment_id},
                UpdateExpression="SET #s = :confirmed, updated_at = :now",
                ConditionExpression="#s = :requested",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":confirmed": "confirmed",
                    ":requested": "requested",
                    ":now": int(time.time() * 1000),
                },
                ReturnValues="ALL_NEW",
            )["Attributes"]
        except ClientError as ce:
            if ce.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "Appointment is no longer in status 'requested'")
            raise

        return ok(updated)

    except Exception as e:
        logger.error("Unhandled error in confirm_appointment: %s", str(e))
        return err(500, "Internal server error")
