"""Fapshi payment-gateway client shared by the payment and anonymous-payment handlers.

Credentials live in an SSM SecureString ("apiuser:apikey", or "UNSET"). With no
credentials and PAYMENT_SIMULATION_ALLOWED=true, payments are simulated and only an
Admin can confirm them (POST /payments/{payment_id}/simulate). The server sets the
fee; the webhook never trusts its body and re-reads the transaction from Fapshi.
"""

import json
import logging
import os
import time
import urllib.parse
import urllib.request

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

from health_track_common import events, params

logger = logging.getLogger()

TIMEOUT_SECONDS = 10
RECEIPT_KEYS = ("reference", "medium", "financial_trans_id", "date_confirmed", "simulated")


class PaymentsNotConfigured(Exception):
    """No Fapshi credentials and simulation is not allowed: handlers answer 503."""


def _credentials():
    """Return (apiuser, apikey), or None when the SSM parameter is UNSET."""
    name = os.environ.get("FAPSHI_CREDENTIALS_PARAM")
    value = params.get_param(name) if name else None
    if not params.is_set(value) or ":" not in value:
        return None
    apiuser, apikey = value.split(":", 1)
    return apiuser, apikey


def simulation_enabled() -> bool:
    return os.environ.get("PAYMENT_SIMULATION_ALLOWED") == "true" and _credentials() is None


def consultation_fee() -> int:
    """The amount is decided here, never by the client."""
    return int(os.environ["CONSULTATION_FEE_XAF"])


def _call(method: str, path: str, payload: dict = None) -> dict:
    creds = _credentials()
    if creds is None:
        raise PaymentsNotConfigured()
    req = urllib.request.Request(
        os.environ["FAPSHI_BASE_URL"].rstrip("/") + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "apiuser": creds[0], "apikey": creds[1]},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        return json.loads(resp.read())


def initiate(*, amount: int, phone: str, external_id: str, redirect_url: str, message: str,
             user_id: str = None) -> tuple:
    """POST /initiate-pay and return (trans_id, payment_link). Empty optional fields are omitted."""
    payload = {"amount": amount, "externalId": external_id, "message": message}
    if phone:
        payload["phone"] = phone
    if redirect_url:
        payload["redirectUrl"] = redirect_url
    if user_id is not None:
        payload["userId"] = user_id
    resp = _call("POST", "/initiate-pay", payload)
    if not resp.get("transId"):
        raise ValueError("Fapshi initiate-pay returned no transId")
    return resp["transId"], resp.get("link", "")


def payment_status(trans_id: str) -> dict:
    """GET /payment-status/{transId}: Fapshi's own view of the transaction."""
    return _call("GET", f"/payment-status/{urllib.parse.quote(trans_id, safe='')}")


def start_payment(*, payment_id: str, amount: int, phone: str, redirect_url: str, message: str,
                  user_id: str = None) -> tuple:
    """Return (fapshi_ref, payment_url, simulated). Raises PaymentsNotConfigured."""
    if simulation_enabled():
        return f"sim-{payment_id[:8]}", None, True
    ref, link = initiate(amount=amount, phone=phone, external_id=payment_id,
                         redirect_url=redirect_url, message=message, user_id=user_id)
    return ref, link, False


def _confirm_payment_only(client, payment_key, values) -> bool:
    """Confirm the payment alone, flagged for refund. False if it was already confirmed."""
    try:
        client.update_item(
            TableName=os.environ["PAYMENT_TABLE"],
            Key=payment_key,
            UpdateExpression="SET #s = :confirmed, confirmed_at = :ts, receipt_data = :rd, needs_refund = :t",
            ConditionExpression="#s = :initiated",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={**values, ":t": {"BOOL": True}},
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def confirm_payment(payment: dict, amount_paid: int, receipt: dict) -> str:
    """Atomically mark the payment confirmed and its consultation paid.

    Returns "confirmed", "already_confirmed" (replay) or "consultation_not_pending"
    (the money arrived but the case is no longer awaiting payment: the payment is
    confirmed with needs_refund=True and the consultation is left untouched).
    """
    ser = TypeSerializer()
    receipt_data = {k: receipt[k] for k in RECEIPT_KEYS if receipt.get(k) is not None}
    receipt_data["amount"] = int(amount_paid)  # never the payer's phone (PII)
    now = int(time.time() * 1000)
    payment_key = {"payment_id": {"S": payment["payment_id"]}}
    payment_values = {
        ":confirmed": {"S": "confirmed"},
        ":initiated": {"S": "initiated"},
        ":ts": {"N": str(now)},
        ":rd": ser.serialize(receipt_data),
    }
    client = boto3.client("dynamodb")
    try:
        client.transact_write_items(TransactItems=[
            {"Update": {
                "TableName": os.environ["PAYMENT_TABLE"],
                "Key": payment_key,
                "UpdateExpression": "SET #s = :confirmed, confirmed_at = :ts, receipt_data = :rd",
                "ConditionExpression": "#s = :initiated",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": payment_values,
            }},
            {"Update": {
                "TableName": os.environ["CONSULTATION_TABLE"],
                "Key": {"consultation_id": {"S": payment["consultation_id"]}},
                "UpdateExpression": "SET #s = :paid, updated_at = :ts",
                "ConditionExpression": "#s = :pending",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": {":paid": {"S": "paid"}, ":pending": {"S": "pending_payment"},
                                              ":ts": {"N": str(now)}},
            }},
        ])
    except ClientError as e:
        if e.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        codes = [r.get("Code") for r in e.response.get("CancellationReasons", [])]
        if codes[:1] == ["ConditionalCheckFailed"]:
            return "already_confirmed"
        if codes[1:2] == ["ConditionalCheckFailed"]:
            if not _confirm_payment_only(client, payment_key, payment_values):
                return "already_confirmed"
            logger.warning("Payment %s confirmed but consultation %s is not pending_payment; needs refund",
                           payment["payment_id"], payment["consultation_id"])
            return "consultation_not_pending"
        raise

    events.publish("payment.confirmed", {
        "user_id": payment["payer_id"],
        "payload": {"title": "CareBridge", "body": "Payment received. A doctor will see your case soon."},
    })
    return "confirmed"
