import boto3, json, logging, os, uuid
from datetime import datetime, timezone
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CURRENT_YEAR = datetime.now(timezone.utc).year

SPECIALTIES = {
    "general_practice", "internal_medicine", "pediatrics", "surgery",
    "obstetrics_gynecology", "cardiology", "dermatology", "psychiatry",
    "orthopedics", "ent", "ophthalmology", "neurology", "emergency_medicine",
    "infectious_disease", "urology", "oncology", "radiology", "anesthesiology",
    "endocrinology", "nephrology", "pulmonology",
}


def _validate(body: dict) -> str | None:
    required = ["full_name", "email", "phone", "specialty",
                 "medical_school", "graduation_year", "years_experience",
                 "hospitals_worked", "recommending_hospital", "document_s3_key"]
    for field in required:
        if not body.get(field):
            return f"Missing field: {field}"

    if body["specialty"] not in SPECIALTIES:
        return f"Invalid specialty: {body['specialty']}"

    grad_year = body["graduation_year"]
    if not isinstance(grad_year, int) or CURRENT_YEAR - grad_year < 7:
        return "Medical school must be completed at least 7 years ago"

    exp = body["years_experience"]
    if not isinstance(exp, int) or exp < 3:
        return "Minimum 3 years of hospital experience required"

    rec = body.get("recommending_hospital", {})
    for f in ["name", "contact_person", "phone"]:
        if not rec.get(f):
            return f"Recommending hospital missing: {f}"

    hospitals = body.get("hospitals_worked", [])
    if not hospitals:
        return "At least one hospital must be listed"

    return None


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        error = _validate(body)
        if error:
            return err(400, error)

        application_id = "APP-" + uuid.uuid4().hex[:8].upper()
        now = datetime.now(timezone.utc).isoformat()

        item = {
            "application_id": application_id,
            "full_name": body["full_name"].strip(),
            "email": body["email"].strip().lower(),
            "phone": body["phone"].strip(),
            "specialty": body["specialty"],
            "medical_school": body["medical_school"].strip(),
            "graduation_year": int(body["graduation_year"]),
            "years_experience": int(body["years_experience"]),
            "hospitals_worked": body["hospitals_worked"],
            "recommending_hospital": body["recommending_hospital"],
            "document_s3_key": body["document_s3_key"],
            "status": "pending",
            "admin_notes": "",
            "called_hospital": False,
            "submitted_at": now,
            "reviewed_at": None,
            "reviewed_by": None,
        }

        boto3.resource("dynamodb").Table(
            os.environ["APPLICATIONS_TABLE"]
        ).put_item(Item=item)

        logger.info("Doctor application submitted: %s", application_id)
        return ok({"application_id": application_id, "status": "pending"}, status_code=201)

    except Exception as e:
        logger.error("Error in post_application: %s", e)
        return err(500, "Internal server error")
