import boto3, logging, os, time, uuid
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, non_empty_str

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event)
        if error:
            return error

        body, error = parse_body(event)
        if error:
            return error

        test_type = body.get("test_type")
        if not non_empty_str(test_type):
            return err(400, "test_type is required")
        facility_id = body.get("facility_id")
        if not non_empty_str(facility_id):
            return err(400, "facility_id is required")
        for field in ("collection_address", "payment_id"):
            if body.get(field) is not None and not isinstance(body[field], str):
                return err(400, f"{field} must be a string")

        now = int(time.time() * 1000)
        item = {
            "request_id":         str(uuid.uuid4()),
            "patient_id":         user_id,
            "test_type":          test_type.strip(),
            "facility_id":        facility_id.strip(),
            "collection_address": body.get("collection_address") or "",
            "status":             "requested",
            "payment_id":         body.get("payment_id"),
            "result_summary":     None,
            "created_at":         now,
            "updated_at":         now,
        }
        boto3.resource("dynamodb").Table(os.environ["LAB_REQUEST_TABLE"]).put_item(Item=item)
        return ok(item, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_lab_request: %s", str(e))
        return err(500, "Internal server error")
