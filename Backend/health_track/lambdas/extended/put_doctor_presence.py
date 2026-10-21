import boto3, logging, os, time
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, non_empty_str, is_int

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_RESPONSE_MINUTES = 30


def handler(event, context):
    """Doctor heartbeat: stores last_seen; is_online is derived at read time."""
    try:
        doctor_id, error = require_group(event, "Doctor")
        if error:
            return error

        body, error = parse_body(event)
        if error:
            return error

        updates = ["last_seen = :now"]
        values = {":now": int(time.time() * 1000)}

        if "specialty" in body:
            if not non_empty_str(body["specialty"]):
                return err(400, "specialty must be a non-empty string")
            updates.append("specialty = :specialty")
            values[":specialty"] = body["specialty"].strip()

        if "typical_response_minutes" in body:
            minutes = body["typical_response_minutes"]
            if not is_int(minutes) or minutes < 0:
                return err(400, "typical_response_minutes must be an integer >= 0")
            updates.append("typical_response_minutes = :minutes")
            values[":minutes"] = minutes
        else:
            updates.append("typical_response_minutes = if_not_exists(typical_response_minutes, :default)")
            values[":default"] = DEFAULT_RESPONSE_MINUTES

        item = boto3.resource("dynamodb").Table(os.environ["DOCTOR_PRESENCE_TABLE"]).update_item(
            Key={"doctor_id": doctor_id},
            UpdateExpression="SET " + ", ".join(updates),
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )["Attributes"]

        return ok({**item, "is_online": True})

    except Exception as e:
        logger.error("Unhandled error in put_doctor_presence: %s", str(e))
        return err(500, "Internal server error")
