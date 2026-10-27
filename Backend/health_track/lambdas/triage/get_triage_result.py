import boto3, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        table = boto3.resource("dynamodb").Table(os.environ["TRIAGE_TABLE"])
        user_id = (
            (event.get("requestContext") or {})
            .get("authorizer", {})
            .get("claims", {})
            .get("sub")
        )
        if not user_id:
            return err(401, "Unauthorized")

        result_id = (event.get("pathParameters") or {}).get("result_id")
        if not result_id:
            return err(400, "result_id is required")

        item = table.get_item(Key={"result_id": result_id}).get("Item")
        if not item:
            return err(404, "Triage result not found")

        # Users can only see their own results
        if item.get("user_id") != user_id:
            return err(403, "Access denied")

        return ok(item)

    except Exception as e:
        logger.error("Unhandled error in get_triage_result: %s", str(e))
        return err(500, "Internal server error")
