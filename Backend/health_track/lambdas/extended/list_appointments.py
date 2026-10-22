import boto3, logging, os
from boto3.dynamodb.conditions import Key, Attr
from health_track_common.auth import require_group, get_groups
from health_track_common.response import ok, err
from extended_util import collect_all, query_param

logger = logging.getLogger()
logger.setLevel(logging.INFO)

STATUSES = {"requested", "confirmed", "cancelled"}


def handler(event, context):
    try:
        user_id, error = require_group(event)
        if error:
            return error

        status = query_param(event, "status")
        if status is not None and status not in STATUSES:
            return err(400, "status must be one of requested, confirmed, cancelled")

        table = boto3.resource("dynamodb").Table(os.environ["APPOINTMENT_TABLE"])

        if status and "Admin" in get_groups(event):
            # Admin: every appointment with this status, soonest slot first
            items = collect_all(table.query, IndexName="StatusIndex",
                                KeyConditionExpression=Key("status").eq(status),
                                ScanIndexForward=True)
        else:
            kwargs = {
                "IndexName": "PatientIndex",
                "KeyConditionExpression": Key("patient_id").eq(user_id),
                "ScanIndexForward": False,
            }
            if status:
                kwargs["FilterExpression"] = Attr("status").eq(status)
            items = collect_all(table.query, **kwargs)

        return ok({"appointments": items, "count": len(items)})

    except Exception as e:
        logger.error("Unhandled error in list_appointments: %s", str(e))
        return err(500, "Internal server error")
