import boto3, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Public lookup by code (pharmacy/facility): never expose patient, doctor or consultation ids.
PUBLIC_FIELDS = ("code", "status", "issued_at", "medication_details", "instructions")


def handler(event, context):
    try:
        prescription_table = boto3.resource("dynamodb").Table(os.environ["PRESCRIPTION_TABLE"])
        code = (event.get("pathParameters") or {}).get("code")
        if not code:
            return err(400, "code is required")

        resp = prescription_table.get_item(Key={"code": code})
        item = resp.get("Item")
        if not item:
            return err(404, "Prescription not found")

        return ok({k: item[k] for k in PUBLIC_FIELDS if k in item})

    except Exception as e:
        logger.error("Unhandled error in get_prescription: %s", str(e))
        return err(500, "Internal server error")
