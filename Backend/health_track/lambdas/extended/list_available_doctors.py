import boto3, logging, os, time
from boto3.dynamodb.conditions import Attr
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import collect_all

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ONLINE_WINDOW_MS = 5 * 60 * 1000


def handler(event, context):
    try:
        _, error = require_group(event)
        if error:
            return error

        cutoff = int(time.time() * 1000) - ONLINE_WINDOW_MS
        table = boto3.resource("dynamodb").Table(os.environ["DOCTOR_PRESENCE_TABLE"])
        # Small table: a filtered scan is acceptable here
        doctors = collect_all(table.scan, FilterExpression=Attr("last_seen").gt(cutoff))
        doctors = [{**d, "is_online": True} for d in doctors]
        doctors.sort(key=lambda d: d.get("typical_response_minutes", 0))

        return ok({"doctors": doctors, "count": len(doctors)})

    except Exception as e:
        logger.error("Unhandled error in list_available_doctors: %s", str(e))
        return err(500, "Internal server error")
