import json, os, sys, time
import pytest
import boto3
from decimal import Decimal
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

_orig_env = {}

def _save_env():
    global _orig_env
    _orig_env = {k: os.environ.get(k) for k in [
        "PAYMENT_TABLE", "CONSULTATION_TABLE",
        "FAPSHI_API_KEY_SECRET_ARN", "FAPSHI_WEBHOOK_SECRET_ARN", "ENV_NAME"
    ]}

def _restore_env():
    for k, v in _orig_env.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v

_save_env()
os.environ.update({
    "PAYMENT_TABLE":              "test-payments",
    "CONSULTATION_TABLE":         "test-pay-consultations",
    "FAPSHI_API_KEY_SECRET_ARN":  "arn:aws:secretsmanager:us-east-1:123456789012:secret:fake",
    "FAPSHI_WEBHOOK_SECRET_ARN":  "arn:aws:secretsmanager:us-east-1:123456789012:secret:fake2",
    "ENV_NAME":                   "dev",
})

from health_track.lambdas.payment.post_initiate import handler as post_initiate
from health_track.lambdas.payment.post_webhook import handler as post_webhook
from health_track.lambdas.payment.list_payments import handler as list_payments
from health_track.lambdas.payment.get_payment import handler as get_payment


def _event(sub, method="POST", body=None, path_params=None, headers=None, groups="Patient"):
    return {
        "requestContext": {"authorizer": {"claims": {"sub": sub, "cognito:groups": groups}}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params or {},
        "queryStringParameters": {},
        "headers": headers or {},
    }


_TEST_ENV = {
    "PAYMENT_TABLE":              "test-payments",
    "CONSULTATION_TABLE":         "test-pay-consultations",
    "FAPSHI_API_KEY_SECRET_ARN":  "arn:aws:secretsmanager:us-east-1:123456789012:secret:fake",
    "FAPSHI_WEBHOOK_SECRET_ARN":  "arn:aws:secretsmanager:us-east-1:123456789012:secret:fake2",
    "ENV_NAME":                   "dev",
}


@pytest.fixture(autouse=True)
def aws_resources():
    os.environ.update(_TEST_ENV)
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")

        ddb.create_table(
            TableName="test-payments",
            KeySchema=[{"AttributeName": "payment_id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "payment_id", "AttributeType": "S"},
                {"AttributeName": "consultation_id", "AttributeType": "S"},
                {"AttributeName": "payer_id", "AttributeType": "S"},
                {"AttributeName": "created_at", "AttributeType": "N"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "ConsultationIndex",
                    "KeySchema": [{"AttributeName": "consultation_id", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "PayerIndex",
                    "KeySchema": [
                        {"AttributeName": "payer_id", "KeyType": "HASH"},
                        {"AttributeName": "created_at", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        ddb.create_table(
            TableName="test-pay-consultations",
            KeySchema=[{"AttributeName": "consultation_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "consultation_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # Seed a pending_payment consultation
        ddb.Table("test-pay-consultations").put_item(Item={
            "consultation_id": "c-pending",
            "patient_id": "p-patient",
            "phone_owner_id": "p-patient",
            "status": "pending_payment",
            "created_at": Decimal(int(time.time() * 1000)),
        })

        yield

    _restore_env()


def test_initiate_payment_ok(aws_resources):
    resp = post_initiate(_event("u1", body={
        "consultation_id": "c-pending",
        "amount_xaf": 3000,
        "phone": "+237600000001",
    }), None)
    assert resp["statusCode"] == 201
    body = json.loads(resp["body"])
    assert body["payment_id"]
    assert "sandbox" in body["fapshi_ref"]


def test_initiate_missing_consultation_id(aws_resources):
    resp = post_initiate(_event("u1", body={"amount_xaf": 2000}), None)
    assert resp["statusCode"] == 400


def test_initiate_consultation_not_found(aws_resources):
    resp = post_initiate(_event("u1", body={"consultation_id": "no-such", "amount_xaf": 2000}), None)
    assert resp["statusCode"] == 404


def test_initiate_wrong_status(aws_resources):
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    ddb.Table("test-pay-consultations").put_item(Item={
        "consultation_id": "c-already-paid",
        "status": "paid",
        "patient_id": "p1",
        "created_at": Decimal(int(time.time() * 1000)),
    })
    resp = post_initiate(_event("u1", body={"consultation_id": "c-already-paid", "amount_xaf": 2000}), None)
    assert resp["statusCode"] == 400


def test_webhook_confirms_payment(aws_resources):
    # First initiate
    init_resp = post_initiate(_event("u1", body={"consultation_id": "c-pending", "amount_xaf": 2000}), None)
    fapshi_ref = json.loads(init_resp["body"])["fapshi_ref"]

    # Webhook fires (dev mode — no signature check)
    webhook_event = {
        "body": json.dumps({"transId": fapshi_ref, "status": "Successful", "amount": 2000}),
        "headers": {},
        "requestContext": {},
        "pathParameters": {},
        "queryStringParameters": {},
    }
    resp = post_webhook(webhook_event, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["acknowledged"] is True

    # Verify consultation is now 'paid'
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    c = ddb.Table("test-pay-consultations").get_item(Key={"consultation_id": "c-pending"})["Item"]
    assert c["status"] == "paid"


def test_webhook_idempotent(aws_resources):
    init_resp = post_initiate(_event("u2", body={"consultation_id": "c-pending", "amount_xaf": 2000}), None)
    fapshi_ref = json.loads(init_resp["body"])["fapshi_ref"]
    webhook_event = {
        "body": json.dumps({"transId": fapshi_ref, "status": "Successful", "amount": 2000}),
        "headers": {},
        "requestContext": {},
        "pathParameters": {},
        "queryStringParameters": {},
    }
    resp1 = post_webhook(webhook_event, None)
    resp2 = post_webhook(webhook_event, None)
    assert resp1["statusCode"] == 200
    assert resp2["statusCode"] == 200  # Second call must not crash


def test_list_payments(aws_resources):
    post_initiate(_event("u3", body={"consultation_id": "c-pending", "amount_xaf": 2000}), None)
    resp = list_payments(_event("u3", method="GET"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["count"] >= 1


def test_get_payment_ok(aws_resources):
    init_resp = post_initiate(_event("u4", body={"consultation_id": "c-pending", "amount_xaf": 2000}), None)
    payment_id = json.loads(init_resp["body"])["payment_id"]
    resp = get_payment(_event("u4", method="GET", path_params={"payment_id": payment_id}), None)
    assert resp["statusCode"] == 200


def test_get_payment_forbidden(aws_resources):
    init_resp = post_initiate(_event("u5", body={"consultation_id": "c-pending", "amount_xaf": 2000}), None)
    payment_id = json.loads(init_resp["body"])["payment_id"]
    resp = get_payment(_event("other-user", method="GET", path_params={"payment_id": payment_id}), None)
    assert resp["statusCode"] == 403


def test_get_payment_not_found(aws_resources):
    resp = get_payment(_event("u6", method="GET", path_params={"payment_id": "no-such"}), None)
    assert resp["statusCode"] == 404


def test_initiate_live_fapshi_request_shape(aws_resources, monkeypatch):
    """Characterises the non-dev Fapshi call (pins behaviour across the shared-module refactor)."""
    import io
    from unittest.mock import patch
    sm = boto3.client("secretsmanager", region_name="us-east-1")
    arn = sm.create_secret(Name="pay-fapshi-key", SecretString="user9:key9")["ARN"]
    monkeypatch.setenv("ENV_NAME", "staging")
    monkeypatch.setenv("FAPSHI_API_KEY_SECRET_ARN", arn)
    captured = {}

    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout=None):
        captured.update(url=req.full_url, method=req.get_method(), timeout=timeout,
                        headers={k.lower(): v for k, v in req.header_items()},
                        payload=json.loads(req.data))
        return _Resp(json.dumps({"transId": "TX-9", "link": "https://pay.example/TX-9"}).encode())

    with patch("urllib.request.urlopen", fake_urlopen):
        resp = post_initiate(_event("u1", body={
            "consultation_id": "c-pending", "amount_xaf": 3000,
            "phone": "+237600000001", "redirect_url": "https://app/done",
        }), None)
    assert resp["statusCode"] == 201
    body = json.loads(resp["body"])
    assert body["fapshi_ref"] == "TX-9"
    assert body["payment_url"] == "https://pay.example/TX-9"
    assert captured["url"] == "https://live.fapshi.com/initiate-pay"
    assert captured["method"] == "POST"
    assert captured["timeout"] == 10
    assert captured["headers"]["apiuser"] == "user9"
    assert captured["headers"]["apikey"] == "key9"
    assert captured["headers"]["content-type"] == "application/json"
    assert captured["payload"] == {
        "amount": 3000,
        "phone": "+237600000001",
        "externalId": body["payment_id"],
        "redirectUrl": "https://app/done",
        "message": "Health Track consultation c-pendin",
    }
