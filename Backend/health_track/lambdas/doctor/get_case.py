import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common.response import ok, err
from health_track_common.anonymous import (
    is_anonymous_id, redact_for_doctor, redact_message_for_doctor,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


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
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])
        message_table = ddb.Table(os.environ["MESSAGE_TABLE"])
        triage_table = ddb.Table(os.environ["TRIAGE_TABLE"])

        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        consultation = resp.get("Item")
        if not consultation:
            return err(404, "Consultation not found")

        # Fetch messages
        messages = message_table.query(
            KeyConditionExpression=Key("consultation_id").eq(consultation_id),
            ScanIndexForward=True,
        ).get("Items", [])

        # Fetch triage result if linked. Anonymous triage results are not stored under
        # a user, and an anonymous caller could cite any id, so never dereference it.
        triage_result = None
        triage_result_id = consultation.get("triage_result_id")
        is_anonymous = is_anonymous_id(consultation.get("patient_id"))
        if triage_result_id and not is_anonymous:
            t_resp = triage_table.query(
                KeyConditionExpression=Key("result_id").eq(triage_result_id),
                Limit=1,
            )
            items = t_resp.get("Items", [])
            if items:
                triage_result = items[0]

        if is_anonymous:
            consultation = redact_for_doctor(consultation)
            messages = [redact_message_for_doctor(m) for m in messages]

        return ok({
            "consultation": consultation,
            "messages": messages,
            "triage_result": triage_result,
        })

    except Exception as e:
        logger.error("Unhandled error in get_case: %s", str(e))
        return err(500, "Internal server error")
