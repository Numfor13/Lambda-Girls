import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common import access
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        ddb = boto3.resource("dynamodb")
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])
        message_table = ddb.Table(os.environ["MESSAGE_TABLE"])

        user_id = access.claims_of(event).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        consultation = resp.get("Item")
        if not consultation:
            return err(404, "Consultation not found")

        # Access control: patient must own the consultation; doctors can see all
        if not access.can_read(event, consultation, user_id):
            return err(403, "Access denied")

        # Fetch messages
        messages_resp = message_table.query(
            KeyConditionExpression=Key("consultation_id").eq(consultation_id),
            ScanIndexForward=True,
        )

        return ok({
            "consultation": consultation,
            "messages": messages_resp.get("Items", []),
        })

    except Exception as e:
        logger.error("Unhandled error in get_consultation: %s", str(e))
        return err(500, "Internal server error")
