import boto3, json, logging, os, urllib.error
from health_track_common.response import ok, err
from health_track_common import fapshi

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_TRANS_ID_CHARS = 128


def handler(event, context):
    """Public Fapshi webhook. The body is never trusted: only transId is read from it,
    and the status, amount and externalId (our payment_id) come from Fapshi's API.

    Forged or mismatched calls are acknowledged with 200 so Fapshi does not retry them.
    """
    try:
        try:
            body = json.loads((event or {}).get("body") or "{}")
        except (ValueError, TypeError):
            return err(400, "Invalid JSON")
        trans_id = body.get("transId") if isinstance(body, dict) else None
        if not isinstance(trans_id, str) or not 0 < len(trans_id) <= MAX_TRANS_ID_CHARS:
            return err(400, "transId is required")

        if fapshi.simulation_enabled():
            return ok({"acknowledged": True, "ignored": "simulation"})

        try:
            verified = fapshi.payment_status(trans_id)
        except urllib.error.HTTPError as e:
            if e.code >= 500:
                raise
            logger.warning("Fapshi rejected payment-status for transId %s (%s)", trans_id, e.code)
            return ok({"acknowledged": True})

        if verified.get("status") != "SUCCESSFUL":
            return ok({"acknowledged": True})

        payment_id = verified.get("externalId")
        payment = None
        if isinstance(payment_id, str) and 0 < len(payment_id) <= MAX_TRANS_ID_CHARS:
            payment_table = boto3.resource("dynamodb").Table(os.environ["PAYMENT_TABLE"])
            payment = payment_table.get_item(Key={"payment_id": payment_id}).get("Item")
        try:
            amount_paid = int(verified.get("amount"))
        except (TypeError, ValueError):
            amount_paid = -1
        if not payment or payment.get("fapshi_ref") != trans_id or amount_paid < int(payment["amount_xaf"]):
            logger.warning("Webhook transId %s does not match a payment (or underpaid); ignored", trans_id)
            return ok({"acknowledged": True})

        result = fapshi.confirm_payment(payment, amount_paid, {
            "reference":          trans_id,
            "medium":             verified.get("medium"),
            "financial_trans_id": verified.get("financialTransId"),
            "date_confirmed":     verified.get("dateConfirmed"),
        })
        return ok({"acknowledged": True, "payment_id": payment_id, "result": result})

    except fapshi.PaymentsNotConfigured:
        return err(503, "Payments are not configured")
    except Exception as e:
        logger.error("Unhandled error in post_webhook: %s", str(e))
        return err(500, "Internal server error")
