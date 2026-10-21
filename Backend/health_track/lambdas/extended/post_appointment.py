import boto3, logging, os, time, uuid
from datetime import datetime, timezone
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, parse_iso_date, non_empty_str

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SLOT_LABELS = {"morning", "afternoon", "evening"}


def handler(event, context):
    try:
        user_id, error = require_group(event)
        if error:
            return error

        body, error = parse_body(event)
        if error:
            return error

        facility_id = body.get("facility_id")
        if not non_empty_str(facility_id):
            return err(400, "facility_id is required")

        slot_date = parse_iso_date(body.get("slot_date"))
        if slot_date is None:
            return err(400, "slot_date must be an ISO date (YYYY-MM-DD)")
        if slot_date < datetime.now(timezone.utc).date():
            return err(400, "slot_date cannot be in the past")

        slot_label = body.get("slot_label")
        if slot_label not in SLOT_LABELS:
            return err(400, "slot_label must be one of morning, afternoon, evening")

        note = body.get("note")
        if note is not None and not isinstance(note, str):
            return err(400, "note must be a string")

        now = int(time.time() * 1000)
        item = {
            "appointment_id": str(uuid.uuid4()),
            "patient_id":     user_id,
            "facility_id":    facility_id.strip(),
            "slot_date":      slot_date.isoformat(),
            "slot_label":     slot_label,
            "status":         "requested",
            "note":           note or "",
            "created_at":     now,
            "updated_at":     now,
        }
        boto3.resource("dynamodb").Table(os.environ["APPOINTMENT_TABLE"]).put_item(Item=item)
        return ok(item, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_appointment: %s", str(e))
        return err(500, "Internal server error")
