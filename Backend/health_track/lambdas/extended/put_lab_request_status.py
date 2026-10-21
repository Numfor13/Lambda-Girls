import boto3, logging, os, time
from botocore.exceptions import ClientError
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, path_param

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Each status may only advance to the next one in the chain.
NEXT_STATUS = {
    "requested":        "sample_collected",
    "sample_collected": "results_ready",
    "results_ready":    "delivered",
}
STATUSES = {"requested", "sample_collected", "results_ready", "delivered"}


def handler(event, context):
    try:
        user_id, error = require_group(event, "Admin", "Operator")
        if error:
            return error

        request_id = path_param(event, "request_id")
        if not request_id:
            return err(400, "request_id is required")

        body, error = parse_body(event)
        if error:
            return error

        new_status = body.get("status")
        if new_status not in STATUSES:
            return err(400, "status must be one of requested, sample_collected, results_ready, delivered")

        result_summary = body.get("result_summary")
        if result_summary is not None:
            if new_status != "results_ready":
                return err(400, "result_summary is only accepted when moving to results_ready")
            if not isinstance(result_summary, str):
                return err(400, "result_summary must be a string")

        table = boto3.resource("dynamodb").Table(os.environ["LAB_REQUEST_TABLE"])
        item = table.get_item(Key={"request_id": request_id}).get("Item")
        if not item:
            return err(404, "Lab request not found")

        current = item.get("status")
        if NEXT_STATUS.get(current) != new_status:
            return err(409, f"Cannot move lab request from '{current}' to '{new_status}'")

        update_expr = "SET #s = :new, updated_at = :now, updated_by = :by"
        values = {":new": new_status, ":cur": current,
                  ":now": int(time.time() * 1000), ":by": user_id}
        if result_summary is not None:
            update_expr += ", result_summary = :summary"
            values[":summary"] = result_summary

        try:
            updated = table.update_item(
                Key={"request_id": request_id},
                UpdateExpression=update_expr,
                ConditionExpression="#s = :cur",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues=values,
                ReturnValues="ALL_NEW",
            )["Attributes"]
        except ClientError as ce:
            if ce.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "Lab request status changed concurrently")
            raise

        return ok(updated)

    except Exception as e:
        logger.error("Unhandled error in put_lab_request_status: %s", str(e))
        return err(500, "Internal server error")
