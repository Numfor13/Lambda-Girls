import io, json, os, sys, time
import pytest
import boto3
from decimal import Decimal
from unittest.mock import patch
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

_TEST_ENV = {
    "PAYMENT_TABLE":              "test-payments",
    "CONSULTATION_TABLE":         "test-pay-consultations",
    "CONSULTATION_FEE_XAF":       "2000",
    "FAPSHI_BASE_URL":            "https://sandbox.fapshi.com",
    "FAPSHI_CREDENTIALS_PARAM":   "/test/fapshi/credentials",
    "PAYMENT_SIMULATION_ALLOWED": "true",
    "ENV_NAME":                   "dev",
    "AWS_DEFAULT_REGION":         "us-east-1",
}
_orig_env = {k: os.environ.get(k) for k in _TEST_ENV}
os.environ.update(_TEST_ENV)

from health_track_common import fapshi, params
from health_track.lambdas.payment.post_initiate import handler as post_initiate
from health_track.lambdas.payment.post_webhook import handler as post_webhook
from health_track.lambdas.payment.post_simulate import handler as post_simulate
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


def _webhook_event(body, headers=None):
    return {"body": body if isinstance(body, str) or body is None else json.dumps(body),
            "headers": headers or {}, "requestContext": {}, "pathParameters": {}, "queryStringParameters": {}}


def _set_credentials(value):
    boto3.client("ssm", region_name="us-east-1").put_parameter(
        Name=_TEST_ENV["FAPSHI_CREDENTIALS_PARAM"], Value=value, Type="SecureString", Overwrite=True)
    params._cache.clear()


@pytest.fixture(autouse=True)
def aws_resources():
    os.environ.update(_TEST_ENV)
    params._cache.clear()
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
        _seed_consultation(ddb, "c-pending")
        _set_credentials(params.UNSET)  # default: simulation mode

        yield ddb

    params._cache.clear()
    for k, v in _orig_env.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def _seed_consultation(ddb, cid, status="pending_payment"):
    ddb.Table("test-pay-consultations").put_item(Item={
        "consultation_id": cid,
        "patient_id": "p-patient",
        "phone_owner_id": "p-patient",
        "status": status,
        "created_at": Decimal(int(time.time() * 1000)),
    })


def _consultation(ddb, cid):
    return ddb.Table("test-pay-consultations").get_item(Key={"consultation_id": cid})["Item"]


def _payment(ddb, pid):
    return ddb.Table("test-payments").get_item(Key={"payment_id": pid})["Item"]


@pytest.fixture
def live_fapshi(monkeypatch):
    """Credentials set (no simulation); Fapshi HTTP replaced by in-memory fakes.

    `fapshi_db[trans_id]` is what Fapshi's payment-status endpoint reports.
    """
    _set_credentials("apiuser1:apikey1")
    fapshi_db = {}
    counter = iter(range(1, 1000))

    def fake_initiate(*, amount, phone, external_id, redirect_url, message, user_id=None):
        trans_id = f"TX-{next(counter)}"
        fapshi_db[trans_id] = {"transId": trans_id, "status": "CREATED", "amount": amount,
                               "externalId": external_id, "medium": "mobile money",
                               "financialTransId": f"FIN-{trans_id}", "dateConfirmed": None,
                               "payerName": "Jane", "phone": "670000000"}
        return trans_id, f"https://pay.example/{trans_id}"

    def fake_status(trans_id):
        return dict(fapshi_db[trans_id])

    monkeypatch.setattr(fapshi, "initiate", fake_initiate)
    monkeypatch.setattr(fapshi, "payment_status", fake_status)
    return fapshi_db


def _initiate(sub="u1", cid="c-pending", **extra):
    resp = post_initiate(_event(sub, body={"consultation_id": cid, **extra}), None)
    assert resp["statusCode"] == 201, resp
    return json.loads(resp["body"])


def _pay_successfully(fapshi_db, trans_id):
    fapshi_db[trans_id].update(status="SUCCESSFUL", dateConfirmed="2026-10-22T10:00:00Z")


# -- initiate -------------------------------------------------------------------

def test_initiate_simulated_ignores_client_amount(aws_resources):
    body = _initiate(amount_xaf=1, phone="+237600000001")
    assert body["simulated"] is True
    assert body["fapshi_ref"].startswith("sim-")
    assert body["payment_url"] is None
    assert body["amount_xaf"] == 2000
    item = _payment(aws_resources, body["payment_id"])
    assert int(item["amount_xaf"]) == 2000
    assert item["status"] == "initiated"
    assert "+237600000001" not in json.dumps(item, default=str)


def test_initiate_missing_consultation_id(aws_resources):
    resp = post_initiate(_event("u1", body={"amount_xaf": 2000}), None)
    assert resp["statusCode"] == 400


@pytest.mark.parametrize("extra", [{"phone": 670000000}, {"redirect_url": ["x"]}])
def test_initiate_phone_and_redirect_must_be_strings(aws_resources, extra):
    resp = post_initiate(_event("u1", body={"consultation_id": "c-pending", **extra}), None)
    assert resp["statusCode"] == 400


def test_initiate_consultation_not_found(aws_resources):
    resp = post_initiate(_event("u1", body={"consultation_id": "no-such"}), None)
    assert resp["statusCode"] == 404


def test_initiate_wrong_status(aws_resources):
    _seed_consultation(aws_resources, "c-already-paid", status="paid")
    resp = post_initiate(_event("u1", body={"consultation_id": "c-already-paid"}), None)
    assert resp["statusCode"] == 400


def test_initiate_not_configured_503(aws_resources, monkeypatch):
    monkeypatch.setenv("PAYMENT_SIMULATION_ALLOWED", "false")
    resp = post_initiate(_event("u1", body={"consultation_id": "c-pending"}), None)
    assert resp["statusCode"] == 503
    assert json.loads(resp["body"]) == {"error": "Payments are not configured"}
    assert aws_resources.Table("test-payments").scan()["Items"] == []


def test_initiate_live_fapshi_request_shape(aws_resources):
    """Real fapshi.initiate with the HTTP layer faked: URL from FAPSHI_BASE_URL, creds from SSM."""
    _set_credentials("user9:key9")
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
    assert body["simulated"] is False
    assert captured["url"] == "https://sandbox.fapshi.com/initiate-pay"
    assert captured["method"] == "POST"
    assert captured["timeout"] == 10
    assert captured["headers"]["apiuser"] == "user9"
    assert captured["headers"]["apikey"] == "key9"
    assert captured["headers"]["content-type"] == "application/json"
    assert captured["payload"] == {
        "amount": 2000,
        "phone": "+237600000001",
        "externalId": body["payment_id"],
        "redirectUrl": "https://app/done",
        "message": "Health Track consultation c-pendin",
    }


def test_payment_status_request_shape(aws_resources):
    _set_credentials("user9:key9")
    captured = {}

    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout=None):
        captured.update(url=req.full_url, method=req.get_method(), data=req.data)
        return _Resp(json.dumps({"transId": "a/b", "status": "PENDING"}).encode())

    with patch("urllib.request.urlopen", fake_urlopen):
        assert fapshi.payment_status("a/b")["status"] == "PENDING"
    assert captured == {"url": "https://sandbox.fapshi.com/payment-status/a%2Fb", "method": "GET", "data": None}


# -- webhook --------------------------------------------------------------------

def test_webhook_finds_right_payment_among_many(aws_resources, live_fapshi, monkeypatch):
    published = []
    monkeypatch.setattr(fapshi.events, "publish", lambda t, d: published.append((t, d)))
    for cid in ("c-a", "c-b", "c-c"):
        _seed_consultation(aws_resources, cid)
    payments = {cid: _initiate(sub=f"payer-{cid}", cid=cid) for cid in ("c-a", "c-b", "c-c")}
    target = payments["c-b"]
    _pay_successfully(live_fapshi, target["fapshi_ref"])

    # Body status and headers are irrelevant; only transId is read.
    resp = post_webhook(_webhook_event({"transId": target["fapshi_ref"], "status": "garbage"},
                                       headers={"X-Whatever": "1"}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["result"] == "confirmed"

    assert _consultation(aws_resources, "c-b")["status"] == "paid"
    assert _consultation(aws_resources, "c-a")["status"] == "pending_payment"
    assert _consultation(aws_resources, "c-c")["status"] == "pending_payment"
    confirmed = _payment(aws_resources, target["payment_id"])
    assert confirmed["status"] == "confirmed"
    assert confirmed["receipt_data"] == {
        "reference": target["fapshi_ref"], "amount": 2000, "medium": "mobile money",
        "financial_trans_id": f"FIN-{target['fapshi_ref']}", "date_confirmed": "2026-10-22T10:00:00Z"}
    assert "670000000" not in json.dumps(confirmed, default=str)
    for cid in ("c-a", "c-c"):
        assert _payment(aws_resources, payments[cid]["payment_id"])["status"] == "initiated"
    assert published == [("payment.confirmed", {
        "user_id": "payer-c-b",
        "payload": {"title": "CareBridge", "body": "Payment received. A doctor will see your case soon."}})]


def test_webhook_forged_success_body_not_confirmed(aws_resources, live_fapshi):
    body = _initiate()
    live_fapshi[body["fapshi_ref"]]["status"] = "PENDING"
    resp = post_webhook(_webhook_event({"transId": body["fapshi_ref"], "status": "SUCCESSFUL",
                                        "amount": 2000, "externalId": body["payment_id"]}), None)
    assert resp["statusCode"] == 200
    assert _payment(aws_resources, body["payment_id"])["status"] == "initiated"
    assert _consultation(aws_resources, "c-pending")["status"] == "pending_payment"


def test_webhook_amount_mismatch_not_confirmed(aws_resources, live_fapshi):
    body = _initiate()
    _pay_successfully(live_fapshi, body["fapshi_ref"])
    live_fapshi[body["fapshi_ref"]]["amount"] = 100
    resp = post_webhook(_webhook_event({"transId": body["fapshi_ref"]}), None)
    assert resp["statusCode"] == 200
    assert _payment(aws_resources, body["payment_id"])["status"] == "initiated"
    assert _consultation(aws_resources, "c-pending")["status"] == "pending_payment"


def test_webhook_trans_id_must_match_payment(aws_resources, live_fapshi):
    """A real, successful transaction whose externalId points at someone else's payment."""
    victim = _initiate(sub="victim")
    _seed_consultation(aws_resources, "c-other")
    attacker = _initiate(sub="attacker", cid="c-other")
    _pay_successfully(live_fapshi, attacker["fapshi_ref"])
    live_fapshi[attacker["fapshi_ref"]]["externalId"] = victim["payment_id"]
    resp = post_webhook(_webhook_event({"transId": attacker["fapshi_ref"]}), None)
    assert resp["statusCode"] == 200
    assert _payment(aws_resources, victim["payment_id"])["status"] == "initiated"
    assert _consultation(aws_resources, "c-pending")["status"] == "pending_payment"


def test_webhook_idempotent(aws_resources, live_fapshi):
    body = _initiate()
    _pay_successfully(live_fapshi, body["fapshi_ref"])
    event = _webhook_event({"transId": body["fapshi_ref"]})
    assert json.loads(post_webhook(event, None)["body"])["result"] == "confirmed"
    resp2 = post_webhook(event, None)
    assert resp2["statusCode"] == 200
    assert json.loads(resp2["body"])["result"] == "already_confirmed"


def test_second_payment_does_not_revert_open_consultation(aws_resources, live_fapshi):
    first, second = _initiate(sub="u1"), _initiate(sub="u2")
    _pay_successfully(live_fapshi, first["fapshi_ref"])
    post_webhook(_webhook_event({"transId": first["fapshi_ref"]}), None)
    assert _consultation(aws_resources, "c-pending")["status"] == "paid"
    aws_resources.Table("test-pay-consultations").update_item(
        Key={"consultation_id": "c-pending"}, UpdateExpression="SET #s = :s",
        ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "open"})

    _pay_successfully(live_fapshi, second["fapshi_ref"])
    resp = post_webhook(_webhook_event({"transId": second["fapshi_ref"]}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["result"] == "consultation_not_pending"
    assert _consultation(aws_resources, "c-pending")["status"] == "open"
    item = _payment(aws_resources, second["payment_id"])
    assert item["status"] == "confirmed"
    assert item["needs_refund"] is True


def test_webhook_unknown_trans_id_acknowledged(aws_resources, live_fapshi, monkeypatch):
    monkeypatch.setattr(fapshi, "payment_status",
                        lambda t: {"transId": t, "status": "SUCCESSFUL", "amount": 2000, "externalId": "nope"})
    resp = post_webhook(_webhook_event({"transId": "TX-unknown"}), None)
    assert resp["statusCode"] == 200
    assert "result" not in json.loads(resp["body"])


def test_webhook_ignored_in_simulation(aws_resources):
    body = _initiate()
    resp = post_webhook(_webhook_event({"transId": body["fapshi_ref"], "status": "SUCCESSFUL"}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"acknowledged": True, "ignored": "simulation"}
    assert _payment(aws_resources, body["payment_id"])["status"] == "initiated"


@pytest.mark.parametrize("raw", [None, "", "null", "[]", "{bad", '"x"', json.dumps({"transId": 5}),
                                 json.dumps({"transId": ""}), json.dumps({"transId": "x" * 129}),
                                 json.dumps({"status": "SUCCESSFUL"})])
def test_webhook_odd_payloads_400_not_500(aws_resources, live_fapshi, raw):
    resp = post_webhook(_webhook_event(raw), None)
    assert resp["statusCode"] == 400


def test_webhook_null_event_fields(aws_resources, live_fapshi):
    assert post_webhook({"body": None, "headers": None}, None)["statusCode"] == 400


def test_webhook_not_configured_503(aws_resources, monkeypatch):
    monkeypatch.setenv("PAYMENT_SIMULATION_ALLOWED", "false")
    resp = post_webhook(_webhook_event({"transId": "TX-1"}), None)
    assert resp["statusCode"] == 503


# -- simulate -------------------------------------------------------------------

def _simulate(payment_id, groups="Admin", sub="admin-1"):
    return post_simulate(_event(sub, path_params={"payment_id": payment_id}, groups=groups), None)


def test_simulate_admin_confirms(aws_resources):
    body = _initiate()
    resp = _simulate(body["payment_id"])
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"payment_id": body["payment_id"], "result": "confirmed"}
    assert _consultation(aws_resources, "c-pending")["status"] == "paid"
    item = _payment(aws_resources, body["payment_id"])
    assert item["status"] == "confirmed"
    assert item["receipt_data"] == {"reference": body["fapshi_ref"], "simulated": True, "amount": 2000}
    # Already confirmed -> no longer "initiated"
    assert _simulate(body["payment_id"])["statusCode"] == 409


def test_simulate_requires_admin(aws_resources):
    body = _initiate()
    assert _simulate(body["payment_id"], groups="Patient")["statusCode"] == 403
    assert _payment(aws_resources, body["payment_id"])["status"] == "initiated"


def test_simulate_requires_simulation_mode(aws_resources, live_fapshi):
    body = _initiate()
    resp = _simulate(body["payment_id"])
    assert resp["statusCode"] == 404
    assert _payment(aws_resources, body["payment_id"])["status"] == "initiated"


def test_simulate_disabled_when_not_allowed(aws_resources, monkeypatch):
    body = _initiate()
    monkeypatch.setenv("PAYMENT_SIMULATION_ALLOWED", "false")
    assert _simulate(body["payment_id"])["statusCode"] == 404


def test_simulate_unknown_payment_404(aws_resources):
    assert _simulate("no-such")["statusCode"] == 404


# -- read -----------------------------------------------------------------------

def test_list_payments(aws_resources):
    _initiate(sub="u3")
    resp = list_payments(_event("u3", method="GET"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["count"] >= 1


def test_get_payment_ok(aws_resources):
    payment_id = _initiate(sub="u4")["payment_id"]
    resp = get_payment(_event("u4", method="GET", path_params={"payment_id": payment_id}), None)
    assert resp["statusCode"] == 200


def test_get_payment_forbidden(aws_resources):
    payment_id = _initiate(sub="u5")["payment_id"]
    resp = get_payment(_event("other-user", method="GET", path_params={"payment_id": payment_id}), None)
    assert resp["statusCode"] == 403


def test_get_payment_not_found(aws_resources):
    resp = get_payment(_event("u6", method="GET", path_params={"payment_id": "no-such"}), None)
    assert resp["statusCode"] == 404
