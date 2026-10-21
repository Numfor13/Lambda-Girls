import boto3, logging, os, time, uuid
from boto3.dynamodb.conditions import Key
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import parse_body, non_empty_str, is_int

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BLOOD_TYPES = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
URGENCIES = {"RED", "AMBER", "GREEN"}


def _blood_bank_facilities():
    """Best-effort lookup of blood-bank facilities; never raises."""
    try:
        table = boto3.resource("dynamodb").Table(os.environ["FACILITY_TABLE"])
        resp = table.query(
            IndexName="CapabilityIndex",
            KeyConditionExpression=Key("primary_capability").eq("blood_bank"),
        )
        return [
            {"facility_id": f.get("facility_id"), "name": f.get("name"), "phone": f.get("phone")}
            for f in resp.get("Items", [])
        ]
    except Exception as e:
        logger.warning("Blood bank facility lookup failed: %s", str(e))
        return []


def handler(event, context):
    try:
        user_id, error = require_group(event)
        if error:
            return error

        body, error = parse_body(event)
        if error:
            return error

        facility_id = body.get("requesting_facility_id")
        if not non_empty_str(facility_id):
            return err(400, "requesting_facility_id is required")
        blood_type = body.get("blood_type")
        if blood_type not in BLOOD_TYPES:
            return err(400, "blood_type must be one of " + ", ".join(sorted(BLOOD_TYPES)))
        units = body.get("units")
        if not is_int(units) or not 1 <= units <= 20:
            return err(400, "units must be an integer between 1 and 20")
        urgency = body.get("urgency")
        if urgency not in URGENCIES:
            return err(400, "urgency must be one of RED, AMBER, GREEN")

        now = int(time.time() * 1000)
        item = {
            "request_id":             str(uuid.uuid4()),
            "requesting_facility_id": facility_id.strip(),
            "requested_by":           user_id,
            "blood_type":             blood_type,
            "units":                  units,
            "urgency":                urgency,
            "status":                 "pending",
            "created_at":             now,
            "updated_at":             now,
        }
        # Pending items land on the operator console queue via StatusIndex
        boto3.resource("dynamodb").Table(os.environ["BLOOD_REQUEST_TABLE"]).put_item(Item=item)

        return ok({**item, "blood_bank_facilities": _blood_bank_facilities()}, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_blood_request: %s", str(e))
        return err(500, "Internal server error")
