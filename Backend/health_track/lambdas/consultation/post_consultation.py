import boto3, json, logging, os, time, uuid
from health_track_common import access, events
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        ddb = boto3.resource("dynamodb")
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])

        user_id = access.claims_of(event).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        complaint = body.get("complaint")
        if not isinstance(complaint, str) or not complaint.strip():
            return err(400, "complaint is required")
        complaint = complaint.strip()

        # patient_id is server-derived: the caller, or one of the caller's own household members.
        # Any patient_id in the body is ignored.
        on_behalf_member_id = body.get("on_behalf_member_id")
        if on_behalf_member_id:
            profile = ddb.Table(os.environ["PROFILE_TABLE"]).get_item(Key={"user_id": user_id}).get("Item") or {}
            members = {m.get("member_id") for m in profile.get("on_behalf_profiles") or [] if isinstance(m, dict)}
            if not isinstance(on_behalf_member_id, str) or on_behalf_member_id not in members:
                return err(400, "on_behalf_member_id is not a member of your household")
            patient_id = f"{user_id}#{on_behalf_member_id}"
        else:
            on_behalf_member_id = None
            patient_id = user_id

        # urgency comes only from the caller's own stored triage result, never from the body.
        triage_result_id = body.get("triage_result_id")
        urgency = None
        if triage_result_id:
            triage = None
            if isinstance(triage_result_id, str):
                triage = ddb.Table(os.environ["TRIAGE_TABLE"]).get_item(
                    Key={"result_id": triage_result_id}).get("Item")
            if not triage or triage.get("user_id") != user_id:
                return err(400, "triage_result_id not found")
            urgency = triage.get("urgency")
        else:
            triage_result_id = None

        consultation_id = str(uuid.uuid4())
        now = int(time.time() * 1000)

        item = {
            "consultation_id":      consultation_id,
            "patient_id":           patient_id,
            "phone_owner_id":       user_id,
            "on_behalf_member_id":  on_behalf_member_id,
            "triage_result_id":     triage_result_id,
            "complaint":            complaint,
            "status":               "pending_payment",
            "urgency":              urgency,
            "doctor_id":            None,
            "created_at":           now,
            "updated_at":           now,
            # Composite SK for StatusUrgencyIndex
            "urgency_created":      f"{urgency or 'GREEN'}#{now}",
        }

        consultation_table.put_item(Item=item)
        events.record("consultation.created")
        return ok(item, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_consultation: %s", str(e))
        return err(500, "Internal server error")
