import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import collect_all

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event)
        if error:
            return error

        table = boto3.resource("dynamodb").Table(os.environ["LAB_REQUEST_TABLE"])
        items = collect_all(table.query, IndexName="PatientIndex",
                            KeyConditionExpression=Key("patient_id").eq(user_id),
                            ScanIndexForward=False)

        return ok({"lab_requests": items, "count": len(items)})

    except Exception as e:
        logger.error("Unhandled error in list_lab_requests: %s", str(e))
        return err(500, "Internal server error")
