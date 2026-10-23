import boto3, logging, os, time
from botocore.exceptions import ClientError
from health_track_common.auth import require_group
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event, "Doctor")
        if error:
            return error

        consultation_table = boto3.resource("dynamodb").Table(os.environ["CONSULTATION_TABLE"])
        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        consultation = consultation_table.get_item(Key={"consultation_id": consultation_id}).get("Item")
        if not consultation:
            return err(404, "Consultation not found")
        if consultation.get("status") != "open":
            return err(409, "Consultation is not in 'open' status")
        if consultation.get("doctor_id") != user_id:
            return err(403, "Only the assigned doctor can close this consultation")

        now = int(time.time() * 1000)
        try:
            consultation_table.update_item(
                Key={"consultation_id": consultation_id},
                UpdateExpression="SET #s = :closed, updated_at = :ts",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":closed": "closed",
                    ":ts": now,
                    ":open": "open",
                    ":me": user_id,
                },
                ConditionExpression="#s = :open AND doctor_id = :me",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "Consultation is not in 'open' status")
            raise

        return ok({"consultation_id": consultation_id, "status": "closed"})

    except Exception as e:
        logger.error("Unhandled error in close_consultation: %s", str(e))
        return err(500, "Internal server error")
