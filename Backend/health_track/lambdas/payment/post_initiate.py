import boto3, hashlib, hmac, json, logging, os, time, uuid
from botocore.exceptions import ClientError
from health_track_common.response import ok, err
from health_track_common.fapshi import fapshi_initiate

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
        if not consultation_id:
            return err(400, "consultation_id is required")

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
        amount_xaf = int(body.get("amount_xaf", 2000))  # default 2000 XAF
        phone = body.get("phone", "")  # payer's mobile money phone

        payment_id = str(uuid.uuid4())
        now = int(time.time() * 1000)

        # In sandbox/dev: skip real Fapshi call, generate fake ref
        env_name = os.environ.get("ENV_NAME", "dev")
        if env_name == "dev":
            fapshi_ref = f"sandbox-{payment_id[:8]}"
            payment_url = f"https://fapshi.com/pay/sandbox/{fapshi_ref}"
        else:
            fapshi_ref, payment_url = fapshi_initiate(
                api_key_secret_arn=os.environ["FAPSHI_API_KEY_SECRET_ARN"],
                amount=amount_xaf,
                phone=phone,
                external_id=payment_id,
                redirect_url=body.get("redirect_url", ""),
                message=f"Health Track consultation {consultation_id[:8]}",
            )

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

        return ok({"payment_id": payment_id, "payment_url": payment_url, "fapshi_ref": fapshi_ref}, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_initiate: %s", str(e))
        return err(500, "Internal server error")
