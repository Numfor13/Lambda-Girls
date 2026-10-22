import logging

from boto3.dynamodb.conditions import Key
from health_track_common.response import ok, err
from anon_util import response_headers, start, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """GET /anonymous/consultations -- this session's consultations (PatientIndex, newest first)."""
    headers = response_headers(event)
    try:
        anon_id, error = start(event, headers)
        if error:
            return error

        items = table("CONSULTATION_TABLE").query(
            IndexName="PatientIndex",
            KeyConditionExpression=Key("patient_id").eq(anon_id),
            ScanIndexForward=False,
            Limit=50,
        ).get("Items", [])
        return ok({"consultations": items, "count": len(items)}, headers=headers)

    except Exception:
        logger.exception("Unhandled error in anonymous list_consultations")
        return err(500, "Internal server error", headers=headers)
