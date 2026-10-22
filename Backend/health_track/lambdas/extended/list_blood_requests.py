import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import collect_all

logger = logging.getLogger()
logger.setLevel(logging.INFO)

URGENCY_RANK = {"RED": 0, "AMBER": 1, "GREEN": 2}


def handler(event, context):
    try:
        _, error = require_group(event, "Operator")
        if error:
            return error

        table = boto3.resource("dynamodb").Table(os.environ["BLOOD_REQUEST_TABLE"])
        items = collect_all(table.query, IndexName="StatusIndex",
                            KeyConditionExpression=Key("status").eq("pending"),
                            ScanIndexForward=True)
        # Most urgent first, oldest first within the same urgency
        items.sort(key=lambda i: (URGENCY_RANK.get(i.get("urgency"), len(URGENCY_RANK)),
                                  i.get("created_at", 0)))

        return ok({"blood_requests": items, "count": len(items)})

    except Exception as e:
        logger.error("Unhandled error in list_blood_requests: %s", str(e))
        return err(500, "Internal server error")
