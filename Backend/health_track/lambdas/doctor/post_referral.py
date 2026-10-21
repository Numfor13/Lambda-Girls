import boto3, json, logging, os, random, string, time
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BASE62 = string.ascii_letters + string.digits


def _gen_code(length=8):
    return "".join(random.choices(BASE62, k=length))


def _require_doctor(event) -> tuple:
    """Returns (user_id, None) if Doctor, or (None, error_response) if not."""
    claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub")
    if not user_id:
        return None, err(401, "Unauthorized")
    groups = claims.get("cognito:groups", "")
    if "Doctor" not in (groups if isinstance(groups, list) else groups.split(",")):
        return None, err(403, "Doctor group required")
    return user_id, None


def handler(event, context):
    try:
        user_id, error = _require_doctor(event)
        if error:
            return error

        ddb = boto3.resource("dynamodb")
        referral_table = ddb.Table(os.environ["REFERRAL_TABLE"])
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])

        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        target_facility_id = body.get("target_facility_id", "").strip()
        if not target_facility_id:
            return err(400, "target_facility_id is required")

        c_resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        consultation = c_resp.get("Item")
        if not consultation:
            return err(404, "Consultation not found")

        for _ in range(5):
            code = _gen_code()
            try:
                referral_table.put_item(
                    Item={
                        "code":               code,
                        "consultation_id":    consultation_id,
                        "doctor_id":          user_id,
                        "patient_id":         consultation.get("patient_id", ""),
                        "target_facility_id": target_facility_id,
                        "reason":             body.get("reason", ""),
                        "issued_at":          int(time.time() * 1000),
                        "status":             "active",
                    },
                    ConditionExpression="attribute_not_exists(code)",
                )
                return ok({"code": code, "consultation_id": consultation_id}, status_code=201)
            except Exception as e:
                if "ConditionalCheckFailedException" in str(e):
                    continue
                raise
        return err(500, "Failed to generate unique referral code")

    except Exception as e:
        logger.error("Unhandled error in post_referral: %s", str(e))
        return err(500, "Internal server error")
