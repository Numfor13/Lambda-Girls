import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common import access
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        consultation_table = boto3.resource("dynamodb").Table(os.environ["CONSULTATION_TABLE"])

        claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
        user_id = claims.get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        is_doctor = access.is_doctor(event)

        if is_doctor:
            # Doctors see paid + open consultations via StatusUrgencyIndex
            # Query two statuses and merge
            paid = consultation_table.query(
                IndexName="StatusUrgencyIndex",
                KeyConditionExpression=Key("status").eq("paid"),
                ScanIndexForward=False,
                Limit=50,
            ).get("Items", [])
            open_c = consultation_table.query(
                IndexName="StatusUrgencyIndex",
                KeyConditionExpression=Key("status").eq("open"),
                ScanIndexForward=False,
                Limit=50,
            ).get("Items", [])
            items = sorted(paid + open_c, key=lambda x: x.get("urgency_created", ""), reverse=True)
        else:
            # Patients see their own consultations
            items = consultation_table.query(
                IndexName="PatientIndex",
                KeyConditionExpression=Key("patient_id").eq(user_id),
                ScanIndexForward=False,
                Limit=50,
            ).get("Items", [])

        return ok({"consultations": items, "count": len(items)})

    except Exception as e:
        logger.error("Unhandled error in list_consultations: %s", str(e))
        return err(500, "Internal server error")
