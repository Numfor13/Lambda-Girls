import boto3, json, logging, os, time, uuid
from decimal import Decimal
from health_track_common import events
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, is_number

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_TTL_SECONDS = 365 * 24 * 3600  # emergency records are retained for a year (CLD-18)


def handler(event, context):
    try:
        user_id, error = require_group(event)
        if error:
            return error

        body, error = parse_body(event)
        if error:
            return error

        latitude, longitude = body.get("latitude"), body.get("longitude")
        if not is_number(latitude) or not -90 <= latitude <= 90:
            return err(400, "latitude must be a number between -90 and 90")
        if not is_number(longitude) or not -180 <= longitude <= 180:
            return err(400, "longitude must be a number between -180 and 180")
        triage_result_id = body.get("triage_result_id")
        if triage_result_id is not None and not isinstance(triage_result_id, str):
            return err(400, "triage_result_id must be a string")

        now_s = time.time()
        alert = {
            "emergency_id":     str(uuid.uuid4()),
            "user_id":          user_id,
            "latitude":         latitude,
            "longitude":        longitude,
            "triage_result_id": triage_result_id,
            "timestamp":        int(now_s * 1000),
        }
        item = {
            **alert,
            "latitude":  Decimal(str(latitude)),
            "longitude": Decimal(str(longitude)),
            "ttl":       int(now_s) + _TTL_SECONDS,
        }
        boto3.resource("dynamodb").Table(os.environ["EMERGENCY_TABLE"]).put_item(Item=item)
        events.record("emergency.shared")

        # The stored record is the source of truth; a failed alert must not fail the request.
        alert_sent = False
        try:
            boto3.client("sns").publish(
                TopicArn=os.environ["OPERATOR_TOPIC_ARN"],
                Subject="HealthTrack emergency location share",
                Message=json.dumps(alert),
            )
            alert_sent = True
        except Exception as e:
            logger.error("Operator alert publish failed for %s: %s", alert["emergency_id"], str(e))

        return ok({**item, "alert_sent": alert_sent}, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_emergency: %s", str(e))
        return err(500, "Internal server error")
