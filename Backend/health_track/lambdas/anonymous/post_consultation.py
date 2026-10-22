import logging, time, uuid

from health_track_common.response import ok, err
from anon_util import (
    MAX_COMPLAINT_CHARS, URGENCIES, optional_id, parse_body, response_headers, start, table,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """POST /anonymous/consultations -- mirrors consultation/post_consultation.py.

    patient_id / phone_owner_id are the hashed anon id; no name or phone is stored.
    """
    headers = response_headers(event)
    try:
        anon_id, error = start(event, headers)
        if error:
            return error

        body, error = parse_body(event, headers)
        if error:
            return error

        complaint = body.get("complaint")
        if not isinstance(complaint, str) or not complaint.strip():
            return err(400, "complaint is required", headers=headers)
        complaint = complaint.strip()
        if len(complaint) > MAX_COMPLAINT_CHARS:
            return err(400, f"complaint must be at most {MAX_COMPLAINT_CHARS} characters", headers=headers)

        urgency = body.get("urgency")
        if urgency is not None and urgency not in URGENCIES:
            return err(400, "urgency must be RED, AMBER or GREEN", headers=headers)

        # Anonymous triage results are not stored under a user: keep the id, never dereference it.
        triage_result_id = body.get("triage_result_id")
        if not optional_id(triage_result_id):
            return err(400, "triage_result_id must be a string", headers=headers)

        now = int(time.time() * 1000)
        item = {
            "consultation_id":     str(uuid.uuid4()),
            "patient_id":          anon_id,
            "phone_owner_id":      anon_id,
            "on_behalf_member_id": None,
            "triage_result_id":    triage_result_id,
            "complaint":           complaint,
            "status":              "pending_payment",
            "urgency":             urgency,
            "doctor_id":           None,
            "created_at":          now,
            "updated_at":          now,
            # Composite SK for StatusUrgencyIndex
            "urgency_created":     f"{urgency or 'GREEN'}#{now}",
        }
        table("CONSULTATION_TABLE").put_item(Item=item)
        return ok(item, status_code=201, headers=headers)

    except Exception:
        logger.exception("Unhandled error in anonymous post_consultation")
        return err(500, "Internal server error", headers=headers)
