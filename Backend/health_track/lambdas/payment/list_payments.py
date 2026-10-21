import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        payment_table = boto3.resource("dynamodb").Table(os.environ["PAYMENT_TABLE"])

        user_id = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {}).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        resp = payment_table.query(
            IndexName="PayerIndex",
            KeyConditionExpression=Key("payer_id").eq(user_id),
            ScanIndexForward=False,
            Limit=50,
        )

        return ok({"payments": resp.get("Items", []), "count": resp.get("Count", 0)})

    except Exception as e:
        logger.error("Unhandled error in list_payments: %s", str(e))
        return err(500, "Internal server error")
