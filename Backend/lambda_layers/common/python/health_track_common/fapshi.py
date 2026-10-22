"""Fapshi payment-gateway client shared by the payment and anonymous-payment handlers."""

import json
import urllib.request

import boto3

FAPSHI_BASE = "https://live.fapshi.com"
TIMEOUT_SECONDS = 10


def get_secret(secret_arn: str) -> str:
    """Return the SecretString of a Secrets Manager secret (full or partial ARN, or name)."""
    resp = boto3.client("secretsmanager").get_secret_value(SecretId=secret_arn)
    return resp.get("SecretString", "")


def fapshi_initiate(*, api_key_secret_arn: str, amount: int, phone: str, external_id: str,
                    redirect_url: str, message: str, user_id: str = None) -> tuple:
    """POST /initiate-pay and return (trans_id, payment_link).

    The API key secret is stored as "apiuser:apikey". `user_id` (Fapshi's payer
    reference) is only sent when given.
    """
    api_key = get_secret(api_key_secret_arn)
    payload = {
        "amount": amount,
        "phone": phone,
        "externalId": external_id,
    }
    if user_id is not None:
        payload["userId"] = user_id
    payload["redirectUrl"] = redirect_url
    payload["message"] = message
    req = urllib.request.Request(
        f"{FAPSHI_BASE}/initiate-pay",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json",
                 "apiuser": api_key.split(":")[0], "apikey": api_key.split(":")[-1]},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        fapshi_resp = json.loads(resp.read())
    return fapshi_resp.get("transId", ""), fapshi_resp.get("link", "")
