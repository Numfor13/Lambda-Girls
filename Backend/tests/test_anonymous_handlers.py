import hashlib, io, json, logging, os, sys, time, uuid
from decimal import Decimal
from unittest.mock import patch

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "health_track", "lambdas", "anonymous"))

_TEST_ENV = {
    "ANON_SESSION_TABLE":        "test-anon-sessions",
    "CONSULTATION_TABLE":        "test-anon-consultations",
    "MESSAGE_TABLE":             "test-anon-messages",
    "PAYMENT_TABLE":             "test-anon-payments",
    "FAPSHI_API_KEY_SECRET_ARN": "arn:aws:secretsmanager:us-east-1:123456789012:secret:fake",
    "ENV_NAME":                  "dev",
    "AWS_DEFAULT_REGION":        "us-east-1",
}
_saved = {k: os.environ.get(k) for k in _TEST_ENV}
os.environ.update(_TEST_ENV)

from health_track.lambdas.anonymous.post_session import handler as post_session
from health_track.lambdas.anonymous.post_consultation import handler as post_consultation
from health_track.lambdas.anonymous.list_consultations import handler as list_consultations
from health_track.lambdas.anonymous.get_consultation import handler as get_consultation
from health_track.lambdas.anonymous.post_message import handler as post_message
from health_track.lambdas.anonymous.post_payment_initiate import handler as post_payment_initiate
from health_track_common.anonymous import hash_session_token


def _event(token=None, body=None, path_params=None, headers=None, raw_body=None, header_name="X-Anonymous-Session"):
    hdrs = dict(headers or {})
    if token is not None:
        hdrs[header_name] = token
    return {
        "requestContext": {},
        "body": raw_body if raw_body is not None else (json.dumps(body) if body is not None else None),
        "pathParameters": path_params,
        "queryStringParameters": None,
        "headers": hdrs,
    }


def _body(resp):
    return json.loads(resp["body"])


@pytest.fixture(autouse=True)
def aws_resources():
    os.environ.update(_TEST_ENV)
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="test-anon-sessions",
            KeySchema=[{"AttributeName": "session_token", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "session_token", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="test-anon-consultations",
            KeySchema=[{"AttributeName": "consultation_id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "consultation_id", "AttributeType": "S"},
                {"AttributeName": "patient_id", "AttributeType": "S"},
                {"AttributeName": "created_at", "AttributeType": "N"},
            ],
            GlobalSecondaryIndexes=[{
                "IndexName": "PatientIndex",
                "KeySchema": [
                    {"AttributeName": "patient_id", "KeyType": "HASH"},
                    {"AttributeName": "created_at", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="test-anon-messages",
            KeySchema=[
                {"AttributeName": "consultation_id", "KeyType": "HASH"},
                {"AttributeName": "message_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "consultation_id", "AttributeType": "S"},
                {"AttributeName": "message_id", "AttributeType": "S"},
                {"AttributeName": "client_message_id", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[{
                "IndexName": "IdempotencyIndex",
                "KeySchema": [{"AttributeName": "client_message_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="test-anon-payments",
            KeySchema=[{"AttributeName": "payment_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "payment_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield ddb
    for k, v in _saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def _mint():
    resp = post_session(_event(), None)
    assert resp["statusCode"] == 201
    return _body(resp)["session_token"]


def _create(token, **extra):
    body = {"complaint": "Fever for 3 days", **extra}
    resp = post_consultation(_event(token, body=body), None)
    assert resp["statusCode"] == 201, resp
    return _body(resp)


def _scan_all(ddb):
    items = []
    for name in ("test-anon-consultations", "test-anon-messages", "test-anon-payments"):
        items.extend(ddb.Table(name).scan()["Items"])
    return items


# -- POST /anonymous/session --------------------------------------------------

def test_session_mint_stores_token_with_7_day_ttl(aws_resources):
    before = int(time.time())
    resp = post_session(_event(), None)
    assert resp["statusCode"] == 201
    body = _body(resp)
    token = body["session_token"]
    assert uuid.UUID(token).version == 4
    item = aws_resources.Table("test-anon-sessions").get_item(Key={"session_token": token})["Item"]
    assert before <= int(item["created_at"]) <= int(time.time())
    assert int(item["ttl"]) - int(item["created_at"]) == 7 * 86400
    assert body["expires_at"] == int(item["ttl"])
    assert resp["headers"]["Content-Language"] == "en"


def test_session_mint_echoes_locale(aws_resources):
    resp = post_session(_event(headers={"Accept-Language": "fr-CM,fr;q=0.9"}), None)
    assert resp["headers"]["Content-Language"] == "fr"


def test_session_tokens_are_unique(aws_resources):
    assert _mint() != _mint()


# -- session enforcement ------------------------------------------------------

def test_missing_token_401(aws_resources):
    resp = post_consultation(_event(body={"complaint": "x"}), None)
    assert resp["statusCode"] == 401


def test_unknown_token_401(aws_resources):
    resp = post_consultation(_event(str(uuid.uuid4()), body={"complaint": "x"}), None)
    assert resp["statusCode"] == 401


def test_malformed_token_401(aws_resources):
    resp = post_consultation(_event("not-a-uuid", body={"complaint": "x"}), None)
    assert resp["statusCode"] == 401


def test_expired_token_401_even_if_item_not_yet_deleted(aws_resources):
    token = str(uuid.uuid4())
    now = int(time.time())
    aws_resources.Table("test-anon-sessions").put_item(Item={
        "session_token": token, "created_at": now - 8 * 86400, "ttl": now - 86400,
    })
    resp = post_consultation(_event(token, body={"complaint": "x"}), None)
    assert resp["statusCode"] == 401


def test_header_lookup_case_insensitive(aws_resources):
    token = _mint()
    resp = post_consultation(_event(token, body={"complaint": "Cough"}, header_name="x-anonymous-session"), None)
    assert resp["statusCode"] == 201


def test_null_request_context_and_headers_handled(aws_resources):
    event = {"requestContext": None, "headers": None, "body": json.dumps({"complaint": "x"})}
    resp = post_consultation(event, None)
    assert resp["statusCode"] == 401


# -- POST /anonymous/consultations --------------------------------------------

def test_create_consultation_stores_hashed_id_and_no_identity(aws_resources):
    token = _mint()
    body = _create(token, triage_result_id="tr-123", urgency="AMBER")
    anon_id = "anon#" + hashlib.sha256(token.encode()).hexdigest()
    assert hash_session_token(token) == anon_id
    stored = aws_resources.Table("test-anon-consultations").get_item(
        Key={"consultation_id": body["consultation_id"]})["Item"]
    assert stored["patient_id"] == anon_id
    assert stored["phone_owner_id"] == anon_id
    assert stored["status"] == "pending_payment"
    assert stored["triage_result_id"] == "tr-123"
    assert stored["urgency"] == "AMBER"
    assert stored["urgency_created"].startswith("AMBER#")
    for k in ("name", "phone", "patient_name", "phone_number"):
        assert k not in stored
    assert token not in json.dumps(stored, default=str)
    assert token not in json.dumps(body, default=str)


@pytest.mark.parametrize("raw,status", [
    ("{not json", 400),
    ("[1, 2]", 400),
    (json.dumps({}), 400),
    (json.dumps({"complaint": "   "}), 400),
    (json.dumps({"complaint": 42}), 400),
    (json.dumps({"complaint": "x" * 2001}), 400),
    (json.dumps({"complaint": "ok", "urgency": "PURPLE"}), 400),
    (json.dumps({"complaint": "ok", "triage_result_id": 5}), 400),
])
def test_create_consultation_validation(aws_resources, raw, status):
    token = _mint()
    resp = post_consultation(_event(token, raw_body=raw), None)
    assert resp["statusCode"] == status


# -- GET /anonymous/consultations ---------------------------------------------

def test_list_only_own_consultations(aws_resources):
    t1, t2 = _mint(), _mint()
    c1 = _create(t1)
    _create(t2)
    resp = list_consultations(_event(t1), None)
    assert resp["statusCode"] == 200
    body = _body(resp)
    assert body["count"] == 1
    assert body["consultations"][0]["consultation_id"] == c1["consultation_id"]


def test_list_requires_session(aws_resources):
    assert list_consultations(_event(), None)["statusCode"] == 401


# -- GET /anonymous/consultations/{id} ----------------------------------------

def test_get_own_consultation_with_messages(aws_resources):
    token = _mint()
    c = _create(token)
    cid = c["consultation_id"]
    post_message(_event(token, body={"text_body": "hello"}, path_params={"consultation_id": cid}), None)
    resp = get_consultation(_event(token, path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 200
    body = _body(resp)
    assert body["consultation"]["consultation_id"] == cid
    assert [m["text_body"] for m in body["messages"]] == ["hello"]


def test_get_cross_session_404(aws_resources):
    t1, t2 = _mint(), _mint()
    c = _create(t1)
    resp = get_consultation(_event(t2, path_params={"consultation_id": c["consultation_id"]}), None)
    assert resp["statusCode"] == 404


def test_get_registered_users_consultation_404(aws_resources):
    aws_resources.Table("test-anon-consultations").put_item(Item={
        "consultation_id": "c-real", "patient_id": "cognito-sub-1", "status": "open",
        "created_at": Decimal(1),
    })
    resp = get_consultation(_event(_mint(), path_params={"consultation_id": "c-real"}), None)
    assert resp["statusCode"] == 404


def test_get_unknown_and_missing_id(aws_resources):
    token = _mint()
    assert get_consultation(_event(token, path_params={"consultation_id": "nope"}), None)["statusCode"] == 404
    assert get_consultation(_event(token, path_params=None), None)["statusCode"] == 400


# -- POST /anonymous/consultations/{id}/messages ------------------------------

def test_post_message_as_hashed_patient(aws_resources):
    token = _mint()
    cid = _create(token)["consultation_id"]
    resp = post_message(_event(token, body={"text_body": "Still feverish", "client_message_id": "cm-1"},
                               path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 201
    msg = _body(resp)
    assert msg["sender_role"] == "patient"
    assert msg["sender_id"] == hash_session_token(token)
    assert msg["content_type"] == "text"
    assert msg["client_message_id"] == "cm-1"


def test_post_message_idempotent(aws_resources):
    token = _mint()
    cid = _create(token)["consultation_id"]
    ev = _event(token, body={"text_body": "hi", "client_message_id": "cm-dup"},
                path_params={"consultation_id": cid})
    first = post_message(ev, None)
    second = post_message(ev, None)
    assert first["statusCode"] == 201
    assert second["statusCode"] == 200
    assert _body(first)["message_id"] == _body(second)["message_id"]
    msgs = aws_resources.Table("test-anon-messages").scan()["Items"]
    assert len(msgs) == 1


def test_post_message_client_id_reused_on_other_consultation_409(aws_resources):
    t1, t2 = _mint(), _mint()
    c1 = _create(t1)["consultation_id"]
    c2 = _create(t2)["consultation_id"]
    post_message(_event(t1, body={"text_body": "a", "client_message_id": "shared"},
                        path_params={"consultation_id": c1}), None)
    resp = post_message(_event(t2, body={"text_body": "b", "client_message_id": "shared"},
                               path_params={"consultation_id": c2}), None)
    assert resp["statusCode"] == 409
    assert "text_body" not in _body(resp)  # other session's message is not echoed back


def test_post_message_cross_session_404(aws_resources):
    t1, t2 = _mint(), _mint()
    cid = _create(t1)["consultation_id"]
    resp = post_message(_event(t2, body={"text_body": "x"}, path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 404


@pytest.mark.parametrize("body", [
    {},
    {"text_body": "   "},
    {"text_body": 7},
    {"text_body": "x" * 4001},
    {"text_body": "ok", "content_type": "voice_note"},
    {"text_body": "ok", "client_message_id": 9},
])
def test_post_message_validation(aws_resources, body):
    token = _mint()
    cid = _create(token)["consultation_id"]
    resp = post_message(_event(token, body=body, path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 400


# -- POST /anonymous/payments/initiate ----------------------------------------

def test_payment_initiate_uses_hashed_payer(aws_resources):
    token = _mint()
    cid = _create(token)["consultation_id"]
    resp = post_payment_initiate(_event(token, body={"consultation_id": cid, "amount_xaf": 2000}), None)
    assert resp["statusCode"] == 201
    body = _body(resp)
    assert "sandbox" in body["fapshi_ref"]
    item = aws_resources.Table("test-anon-payments").get_item(Key={"payment_id": body["payment_id"]})["Item"]
    anon_id = hash_session_token(token)
    assert item["payer_id"] == anon_id
    assert item["patient_id"] == anon_id
    assert item["consultation_id"] == cid
    assert item["status"] == "initiated"
    assert int(item["amount_xaf"]) == 2000


def test_payment_initiate_cross_session_404(aws_resources):
    t1, t2 = _mint(), _mint()
    cid = _create(t1)["consultation_id"]
    resp = post_payment_initiate(_event(t2, body={"consultation_id": cid}), None)
    assert resp["statusCode"] == 404


def test_payment_initiate_wrong_status_400(aws_resources):
    token = _mint()
    cid = _create(token)["consultation_id"]
    aws_resources.Table("test-anon-consultations").update_item(
        Key={"consultation_id": cid}, UpdateExpression="SET #s = :s",
        ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "paid"})
    resp = post_payment_initiate(_event(token, body={"consultation_id": cid}), None)
    assert resp["statusCode"] == 400


@pytest.mark.parametrize("body", [{}, {"consultation_id": 5}, {"consultation_id": "c", "amount_xaf": "abc"},
                                  {"consultation_id": "c", "amount_xaf": 0}])
def test_payment_initiate_validation(aws_resources, body):
    resp = post_payment_initiate(_event(_mint(), body=body), None)
    assert resp["statusCode"] == 400


def test_payment_initiate_live_fapshi_payer_reference_is_hashed(aws_resources, monkeypatch):
    sm = boto3.client("secretsmanager", region_name="us-east-1")
    arn = sm.create_secret(Name="fapshi-key", SecretString="apiuser1:apikey1")["ARN"]
    monkeypatch.setenv("ENV_NAME", "staging")
    monkeypatch.setenv("FAPSHI_API_KEY_SECRET_ARN", arn)
    token = _mint()
    cid = _create(token)["consultation_id"]

    captured = {}

    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout=None):
        captured["payload"] = json.loads(req.data)
        captured["headers"] = dict(req.headers)
        return _Resp(json.dumps({"transId": "T-1", "link": "https://pay.example/T-1"}).encode())

    with patch("urllib.request.urlopen", fake_urlopen):
        resp = post_payment_initiate(_event(token, body={"consultation_id": cid, "phone": "670000000"}), None)
    assert resp["statusCode"] == 201
    assert _body(resp)["fapshi_ref"] == "T-1"
    digest = hashlib.sha256(token.encode()).hexdigest()
    assert captured["payload"]["userId"] == digest
    assert token not in json.dumps(captured["payload"])
    assert token not in json.dumps(captured["headers"])


# -- the raw token never leaks ------------------------------------------------

def test_raw_token_never_stored_or_logged(aws_resources, caplog):
    # INFO is the level the handlers configure on the root logger in Lambda. (At DEBUG,
    # botocore itself traces every API call's parameters -- including the session-table
    # key -- so DEBUG must never be enabled for these functions.)
    caplog.set_level(logging.INFO)
    token = _mint()
    hdr = {"Accept-Language": "pcm"}
    c = _body(post_consultation(_event(token, body={"complaint": "Belle de pain me"}, headers=hdr), None))
    cid = c["consultation_id"]
    post_message(_event(token, body={"text_body": "hello", "client_message_id": "m1"},
                        path_params={"consultation_id": cid}), None)
    post_message(_event(token, body={"text_body": "hello", "client_message_id": "m1"},
                        path_params={"consultation_id": cid}), None)
    list_consultations(_event(token), None)
    get_consultation(_event(token, path_params={"consultation_id": cid}), None)
    post_payment_initiate(_event(token, body={"consultation_id": cid}), None)
    # error paths: bad body, cross-session, and an unhandled exception
    post_consultation(_event(token, raw_body="{bad"), None)
    get_consultation(_event(token, path_params={"consultation_id": "nope"}), None)
    aws_resources.Table("test-anon-messages").delete()
    resp = post_message(_event(token, body={"text_body": "boom"}, path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 500
    assert _body(resp) == {"error": "Internal server error"}

    stored = json.dumps(_scan_all_remaining(aws_resources), default=str)
    assert token not in stored
    for rec in caplog.records:
        assert token not in rec.getMessage()
        assert token not in (rec.exc_text or "")
        if rec.exc_info:
            assert token not in logging.Formatter().formatException(rec.exc_info)
    assert any(r.levelno >= logging.ERROR for r in caplog.records)


def _scan_all_remaining(ddb):
    items = []
    for name in ("test-anon-consultations", "test-anon-payments"):
        items.extend(ddb.Table(name).scan()["Items"])
    return items


def test_messages_never_store_raw_token(aws_resources):
    token = _mint()
    cid = _create(token)["consultation_id"]
    post_message(_event(token, body={"text_body": "x"}, path_params={"consultation_id": cid}), None)
    post_payment_initiate(_event(token, body={"consultation_id": cid}), None)
    assert token not in json.dumps(_scan_all(aws_resources), default=str)


def test_unhandled_error_returns_generic_500(aws_resources):
    token = _mint()
    aws_resources.Table("test-anon-consultations").delete()
    resp = post_consultation(_event(token, body={"complaint": "x"}), None)
    assert resp["statusCode"] == 500
    assert _body(resp) == {"error": "Internal server error"}
    assert "Content-Language" in resp["headers"]
