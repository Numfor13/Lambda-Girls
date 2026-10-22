import boto3, logging, os, time, uuid
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, validate_tip_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event, "Admin")
        if error:
            return error

        body, error = parse_body(event)
        if error:
            return error

        # Every tip must carry source_name and published_date (enforced here)
        fields, message = validate_tip_fields(body, partial=False)
        if message:
            return err(400, message)

        now = int(time.time() * 1000)
        item = {
            "tip_id":     str(uuid.uuid4()),
            "source_url": None,
            "tags":       [],
            "is_active":  True,
            **fields,
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
        }
        boto3.resource("dynamodb").Table(os.environ["HEALTH_TIP_TABLE"]).put_item(Item=item)
        return ok(item, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_health_tip: %s", str(e))
        return err(500, "Internal server error")
