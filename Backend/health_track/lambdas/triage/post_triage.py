import boto3, json, logging, os, time, uuid
from decimal import Decimal
from health_track_common import events
from health_track_common.response import ok, err
from health_track_common.rules.rule_engine import evaluate

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

        try:
            body = json.loads(event.get("body") or "{}", parse_float=Decimal)
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        # Validate required fields. bool is an int subclass, and floats parse as Decimal: both rejected.
        symptoms = body.get("symptoms")
        if not isinstance(symptoms, list) or not all(isinstance(x, str) for x in symptoms):
            return err(400, "symptoms (list of strings) is required")
        age_months = body.get("age_months", 999)
        if isinstance(age_months, bool) or not isinstance(age_months, int):
            return err(400, "age_months must be an integer")
        is_pregnant = body.get("is_pregnant", False)
        if not isinstance(is_pregnant, bool):
            return err(400, "is_pregnant must be a boolean")
        vitals = body.get("vitals", {})
        if not isinstance(vitals, dict):
            return err(400, "vitals must be an object")

        payload = {
            "age_months":  age_months,
            "is_pregnant": is_pregnant,
            "symptoms":    symptoms,
            "vitals":      vitals,
        }

        urgency, rules_fired, recommendation, facility_type_needed = evaluate(payload)

        result_id = str(uuid.uuid4())
        # Allow offline clients to supply their original timestamp
        created_at = body.get("queued_at") or int(time.time() * 1000)
        if isinstance(created_at, bool) or not isinstance(created_at, int):
            return err(400, "queued_at must be an integer timestamp")

        item = {
            "result_id":            result_id,
            "user_id":              user_id,
            "urgency":              urgency,
            "recommendation":       recommendation,
            "facility_type_needed": facility_type_needed,
            "rules_fired":          rules_fired,
            "symptom_payload":      payload,
            "on_behalf_member_id":  body.get("on_behalf_member_id"),
            "synced_from_offline":  bool(body.get("queued_at")),
            "created_at":           int(created_at),
        }

        table.put_item(Item=item)
        events.record(f"triage.{urgency}")

        return ok(item, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_triage: %s", str(e))
        return err(500, "Internal server error")
