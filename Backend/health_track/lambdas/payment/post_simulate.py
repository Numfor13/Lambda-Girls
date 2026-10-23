import boto3, logging, os
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from health_track_common import fapshi

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """POST /payments/{payment_id}/simulate -- Admin-only demo confirmation.

    Exists only while simulation is enabled (no Fapshi credentials and
    PAYMENT_SIMULATION_ALLOWED=true); otherwise the route answers 404.
    """
    try:
        if not fapshi.simulation_enabled():
            return err(404, "Not found")

        _, error = require_group(event, "Admin")
        if error:
            return error

        payment_id = (event.get("pathParameters") or {}).get("payment_id")
        if not isinstance(payment_id, str) or not 0 < len(payment_id) <= 128:
            return err(400, "payment_id is required")

        payment_table = boto3.resource("dynamodb").Table(os.environ["PAYMENT_TABLE"])
        payment = payment_table.get_item(Key={"payment_id": payment_id}).get("Item")
        if not payment:
            return err(404, "Payment not found")
        if payment.get("status") != "initiated":
            return err(409, f"Payment status '{payment.get('status')}' cannot be confirmed")

        result = fapshi.confirm_payment(payment, int(payment["amount_xaf"]),
                                        {"reference": payment["fapshi_ref"], "simulated": True})
        return ok({"payment_id": payment_id, "result": result})

    except Exception as e:
        logger.error("Unhandled error in post_simulate: %s", str(e))
        return err(500, "Internal server error")
