import boto3, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Public lookup by code (pharmacy/facility): never expose patient, doctor or consultation ids.
PUBLIC_FIELDS = ("code", "status", "issued_at", "target_facility_id", "reason")


def handler(event, context):
    try:
        referral_table = boto3.resource("dynamodb").Table(os.environ["REFERRAL_TABLE"])
        code = (event.get("pathParameters") or {}).get("code")
        if not code:
            return err(400, "code is required")

        resp = referral_table.get_item(Key={"code": code})
        item = resp.get("Item")
        if not item:
            return err(404, "Referral not found")

        return ok({k: item[k] for k in PUBLIC_FIELDS if k in item})

    except Exception as e:
        logger.error("Unhandled error in get_referral: %s", str(e))
        return err(500, "Internal server error")
