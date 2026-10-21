import boto3, json, logging, os, time, uuid
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        consultation_table = boto3.resource("dynamodb").Table(os.environ["CONSULTATION_TABLE"])

        user_id = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {}).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        complaint = body.get("complaint", "").strip()
        if not complaint:
            return err(400, "complaint is required")

        consultation_id = str(uuid.uuid4())
        now = int(time.time() * 1000)
        on_behalf_member_id = body.get("on_behalf_member_id")

        # patient_id is the household member ID for on-behalf consultations,
        # else it's the phone owner's Cognito sub
        patient_id = body.get("patient_id") or user_id

        item = {
            "consultation_id":      consultation_id,
            "patient_id":           patient_id,
            "phone_owner_id":       user_id,
            "on_behalf_member_id":  on_behalf_member_id,
            "triage_result_id":     body.get("triage_result_id"),
            "complaint":            complaint,
            "status":               "pending_payment",
            "urgency":              body.get("urgency"),  # from triage if provided
            "doctor_id":            None,
            "created_at":           now,
            "updated_at":           now,
            # Composite SK for StatusUrgencyIndex
            "urgency_created":      f"{body.get('urgency', 'GREEN')}#{now}",
        }

        consultation_table.put_item(Item=item)
        return ok(item, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_consultation: %s", str(e))
        return err(500, "Internal server error")
