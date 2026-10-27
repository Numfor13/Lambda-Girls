import boto3, json, logging, os, time, uuid
from health_track_common.response import ok, err
from health_track_common import fapshi

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        ddb = boto3.resource("dynamodb")
        payment_table = ddb.Table(os.environ["PAYMENT_TABLE"])
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])

        claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
        user_id = claims.get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        consultation_id = body.get("consultation_id")
        if not isinstance(consultation_id, str) or not consultation_id:
            return err(400, "consultation_id is required")

        phone = body.get("phone", "")  # payer's mobile money phone: sent to Fapshi, never stored
        redirect_url = body.get("redirect_url", "")
        if not isinstance(phone, str) or not isinstance(redirect_url, str):
            return err(400, "phone and redirect_url must be strings")

        # Verify consultation exists
        c_resp = consultation_table.get_item(Key={"consultation_id": consultation_id})
        consultation = c_resp.get("Item")
        if not consultation:
            return err(404, "Consultation not found")

        if consultation.get("status") not in ("pending_payment",):
            return err(400, f"Consultation status '{consultation.get('status')}' does not accept payment")

        # payer_id is always the caller (pay-for-someone-else supported)
        payer_id = user_id
        patient_id = consultation.get("patient_id", user_id)
        amount_xaf = fapshi.consultation_fee()  # server-side fee; any client amount_xaf is ignored

        payment_id = str(uuid.uuid4())
        now = int(time.time() * 1000)

        try:
            fapshi_ref, payment_url, simulated = fapshi.start_payment(
                payment_id=payment_id,
                amount=amount_xaf,
                phone=phone,
                redirect_url=redirect_url,
                message=f"Health Track consultation {consultation_id[:8]}",
            )
        except fapshi.PaymentsNotConfigured:
            return err(503, "Payments are not configured")

        item = {
            "payment_id":      payment_id,
            "consultation_id": consultation_id,
            "payer_id":        payer_id,
            "patient_id":      patient_id,
            "amount_xaf":      amount_xaf,
            "fapshi_ref":      fapshi_ref,
            "status":          "initiated",
            "receipt_data":    {},
            "created_at":      now,
        }
        payment_table.put_item(Item=item)

        return ok({"payment_id": payment_id, "payment_url": payment_url, "fapshi_ref": fapshi_ref,
                   "amount_xaf": amount_xaf, "simulated": simulated}, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_initiate: %s", str(e))
        return err(500, "Internal server error")
