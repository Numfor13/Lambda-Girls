import boto3, hashlib, hmac, json, logging, os, time
from botocore.exceptions import ClientError
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _get_secret(secret_arn: str) -> str:
    sm = boto3.client("secretsmanager")
    resp = sm.get_secret_value(SecretId=secret_arn)
    return resp.get("SecretString", "")


def _verify_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def handler(event, context):
    try:
        ddb = boto3.resource("dynamodb")
        payment_table = ddb.Table(os.environ["PAYMENT_TABLE"])
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])

        # Signature verification
        raw_body = (event.get("body") or "").encode()
        signature = (event.get("headers") or {}).get("x-fapshi-signature", "")

        env_name = os.environ.get("ENV_NAME", "dev")
        if env_name != "dev":
            webhook_secret = _get_secret(os.environ["FAPSHI_WEBHOOK_SECRET_ARN"])
            if not signature or not _verify_signature(raw_body, signature, webhook_secret):
                logger.warning("Invalid webhook signature")
                return err(401, "Invalid signature")

        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON")

        fapshi_ref = payload.get("transId") or payload.get("fapshi_ref")
        status = payload.get("status", "").lower()

        if status != "successful":
            # Not a success event — acknowledge but do nothing
            return ok({"acknowledged": True})

        # Find payment by fapshi_ref using scan (no GSI on fapshi_ref — acceptable for webhook volume)
        scan_resp = payment_table.scan(
            FilterExpression="fapshi_ref = :ref",
            ExpressionAttributeValues={":ref": fapshi_ref},
            Limit=1,
        )
        items = scan_resp.get("Items", [])
        if not items:
            logger.warning("Payment not found for fapshi_ref: %s", fapshi_ref)
            return ok({"acknowledged": True})  # Return 200 to stop Fapshi retries

        payment = items[0]
        payment_id = payment["payment_id"]
        consultation_id = payment["consultation_id"]
        now = int(time.time() * 1000)

        receipt_data = {
            "reference":  fapshi_ref,
            "amount":     payload.get("amount"),
            "timestamp":  now,
            "payer_phone": payload.get("payer", {}).get("phone", ""),
        }

        # Idempotent update — only if not already confirmed
        try:
            payment_table.update_item(
                Key={"payment_id": payment_id},
                UpdateExpression="SET #s = :confirmed, confirmed_at = :ts, receipt_data = :rd",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":confirmed": "confirmed",
                    ":ts": now,
                    ":rd": receipt_data,
                },
                ConditionExpression="attribute_not_exists(confirmed_at)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                logger.info("Webhook replay for payment %s — already confirmed", payment_id)
                return ok({"acknowledged": True})
            raise

        # Update consultation status to 'paid'
        consultation_table.update_item(
            Key={"consultation_id": consultation_id},
            UpdateExpression="SET #s = :paid, updated_at = :ts",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":paid": "paid", ":ts": now},
        )

        return ok({"acknowledged": True, "payment_id": payment_id})

    except Exception as e:
        logger.error("Unhandled error in post_webhook: %s", str(e))
        return err(500, "Internal server error")
