import boto3, json, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        table = boto3.resource("dynamodb").Table(os.environ["FACILITY_TABLE"])

        facility_id = (event.get("pathParameters") or {}).get("facility_id")
        if not facility_id:
            return err(400, "facility_id is required")

        response = table.get_item(Key={"facility_id": facility_id})
        item = response.get("Item")

        if not item or not item.get("is_active", False):
            return err(404, "Facility not found")

        return ok(item)

    except Exception as e:
        logger.error("Unexpected error in get_facility: %s", e, exc_info=True)
        return err(500, "Internal server error")
