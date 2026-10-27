import logging, time, uuid

from health_track_common import fapshi
from health_track_common.anonymous import ANON_PREFIX
from health_track_common.response import ok, err
from anon_util import MAX_ID_CHARS, get_own_consultation, parse_body, response_headers, start, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """POST /anonymous/payments/initiate -- mirrors payment/post_initiate.py.

    payer_id is the hashed anon id; the Fapshi payer reference (userId) is its sha256
    hex digest, never the raw session token. The amount is the server-side fee.
    """
    headers = response_headers(event)
    try:
        anon_id, error = start(event, headers)
        if error:
            return error

        body, error = parse_body(event, headers)
        if error:
            return error

        consultation_id = body.get("consultation_id")
        if not isinstance(consultation_id, str) or not 0 < len(consultation_id) <= MAX_ID_CHARS:
            return err(400, "consultation_id is required", headers=headers)

        phone = body.get("phone", "")  # payer's mobile money phone: sent to Fapshi, never stored
        redirect_url = body.get("redirect_url", "")
        if not isinstance(phone, str) or not isinstance(redirect_url, str):
            return err(400, "phone and redirect_url must be strings", headers=headers)

        consultation = get_own_consultation(table("CONSULTATION_TABLE"), consultation_id, anon_id)
        if not consultation:
            return err(404, "Consultation not found", headers=headers)
        if consultation.get("status") != "pending_payment":
            return err(400, f"Consultation status '{consultation.get('status')}' does not accept payment",
                       headers=headers)

        amount_xaf = fapshi.consultation_fee()  # any client amount_xaf is ignored
        payment_id = str(uuid.uuid4())
        payer_reference = anon_id[len(ANON_PREFIX):]  # sha256 hex digest

        try:
            fapshi_ref, payment_url, simulated = fapshi.start_payment(
                payment_id=payment_id,
                amount=amount_xaf,
                phone=phone,
                user_id=payer_reference,
                redirect_url=redirect_url,
                message=f"Health Track consultation {consultation_id[:8]}",
            )
        except fapshi.PaymentsNotConfigured:
            return err(503, "Payments are not configured", headers=headers)

        table("PAYMENT_TABLE").put_item(Item={
            "payment_id":      payment_id,
            "consultation_id": consultation_id,
            "payer_id":        anon_id,
            "patient_id":      anon_id,
            "amount_xaf":      amount_xaf,
            "fapshi_ref":      fapshi_ref,
            "status":          "initiated",
            "receipt_data":    {},
            "created_at":      int(time.time() * 1000),
        })
        return ok({"payment_id": payment_id, "payment_url": payment_url, "fapshi_ref": fapshi_ref,
                   "amount_xaf": amount_xaf, "simulated": simulated}, status_code=201, headers=headers)

    except Exception:
        logger.exception("Unhandled error in anonymous post_payment_initiate")
        return err(500, "Internal server error", headers=headers)
