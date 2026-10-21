import boto3, logging, os, time
from boto3.dynamodb.conditions import Attr
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import collect_all

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        _, error = require_group(event, "Operator")
        if error:
            return error

        table = boto3.resource("dynamodb").Table(os.environ["EMERGENCY_TABLE"])
        # DynamoDB TTL deletion lags, so drop already-expired records explicitly
        items = collect_all(table.scan, FilterExpression=Attr("ttl").gt(int(time.time())))
        items.sort(key=lambda i: i.get("timestamp", 0), reverse=True)

        return ok({"emergencies": items, "count": len(items)})

    except Exception as e:
        logger.error("Unhandled error in list_emergencies: %s", str(e))
        return err(500, "Internal server error")
