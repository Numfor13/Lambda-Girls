import boto3, logging, os
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

        request_id = path_param(event, "request_id")
        if not request_id:
            return err(400, "request_id is required")

        table = boto3.resource("dynamodb").Table(os.environ["LAB_REQUEST_TABLE"])
        item = table.get_item(Key={"request_id": request_id}).get("Item")
        is_staff = bool(get_groups(event) & {"Admin", "Operator"})
        if not item or (item.get("patient_id") != user_id and not is_staff):
            return err(404, "Lab request not found")

        return ok(item)

    except Exception as e:
        logger.error("Unhandled error in get_lab_request: %s", str(e))
        return err(500, "Internal server error")
