import logging

from boto3.dynamodb.conditions import Key
from health_track_common.response import ok, err
from anon_util import get_own_consultation, path_param, response_headers, start, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """GET /anonymous/consultations/{consultation_id} -- detail + messages, own session only."""
    headers = response_headers(event)
    try:
        anon_id, error = start(event, headers)
        if error:
            return error

        consultation_id = path_param(event, "consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required", headers=headers)

        consultation = get_own_consultation(table("CONSULTATION_TABLE"), consultation_id, anon_id)
        if not consultation:
            return err(404, "Consultation not found", headers=headers)

        messages = table("MESSAGE_TABLE").query(
            KeyConditionExpression=Key("consultation_id").eq(consultation_id),
            ScanIndexForward=True,
            Limit=500,
        ).get("Items", [])
        return ok({"consultation": consultation, "messages": messages}, headers=headers)

    except Exception:
        logger.exception("Unhandled error in anonymous get_consultation")
        return err(500, "Internal server error", headers=headers)
