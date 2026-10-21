import boto3, logging, os
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        payment_table = boto3.resource("dynamodb").Table(os.environ["PAYMENT_TABLE"])

        user_id = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {}).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        payment_id = (event.get("pathParameters") or {}).get("payment_id")
        if not payment_id:
            return err(400, "payment_id is required")

        resp = payment_table.get_item(Key={"payment_id": payment_id})
        payment = resp.get("Item")
        if not payment:
            return err(404, "Payment not found")

        # Only payer or patient can view
        if payment.get("payer_id") != user_id and payment.get("patient_id") != user_id:
            return err(403, "Access denied")

        return ok(payment)

    except Exception as e:
        logger.error("Unhandled error in get_payment: %s", str(e))
        return err(500, "Internal server error")
