import boto3, json, logging, os, time, uuid
from health_track_common.response import ok, err
from rules.rule_engine import evaluate

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
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        # Validate required fields
        if "symptoms" not in body or not isinstance(body["symptoms"], list):
            return err(400, "symptoms (list) is required")
        age_months = body.get("age_months")
        if age_months is not None and not isinstance(age_months, (int, float)):
            return err(400, "age_months must be a number")

        payload = {
            "age_months":  body.get("age_months", 999),
            "is_pregnant": body.get("is_pregnant", False),
            "symptoms":    body["symptoms"],
            "vitals":      body.get("vitals", {}),
        }

        urgency, rules_fired, recommendation, facility_type_needed = evaluate(payload)

        result_id = str(uuid.uuid4())
        # Allow offline clients to supply their original timestamp
        created_at = body.get("queued_at") or int(time.time() * 1000)

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

        return ok(item, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_triage: %s", str(e))
        return err(500, "Internal server error")
