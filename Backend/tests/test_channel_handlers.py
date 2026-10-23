import json, os, sys, time, pytest, boto3
from decimal import Decimal
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "health_track", "lambdas", "channel"))

_TEST_ENV = {
    "SESSION_TABLE":      "test-sessions",
    "CALLBACK_TABLE":     "test-callbacks",
    "DISPATCH_LOG_TABLE": "test-dispatch-logs",
    "GATEWAY_TOKEN_PARAM": "/health-track/dev/gateway-token",
    "ENV_NAME":           "dev",
    "AWS_DEFAULT_REGION": "us-east-1",
}
_GATEWAY_TOKEN = "s3cret-gateway-token"
_saved = {k: os.environ.get(k) for k in _TEST_ENV}
os.environ.update(_TEST_ENV)

from health_track.lambdas.channel.post_sms import handler as post_sms
from health_track.lambdas.channel.post_ussd import handler as post_ussd
from health_track.lambdas.channel.get_callbacks import handler as get_callbacks
from health_track.lambdas.channel.put_callback_handle import handler as put_callback_handle
from health_track.lambdas.channel.post_dispatch_log import handler as post_dispatch_log
from health_track_common import params


def _op_event(sub="op1", method="GET", body=None, path_params=None):
    return {
        "requestContext": {"authorizer": {"claims": {
            "sub": sub, "cognito:groups": "Operator",
        }}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params or {},
        "queryStringParameters": {},
        "headers": {},
    }


@pytest.fixture(autouse=True)
def aws_resources():
    os.environ.update(_TEST_ENV)
    params._cache.clear()
    with mock_aws():
        boto3.client("ssm", region_name="us-east-1").put_parameter(
            Name=_TEST_ENV["GATEWAY_TOKEN_PARAM"], Value=_GATEWAY_TOKEN, Type="SecureString")
        ddb = boto3.resource("dynamodb", region_name="us-east-1")

        # SessionTable
        ddb.create_table(
            TableName="test-sessions",
            KeySchema=[{"AttributeName": "session_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "session_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # CallbackRequestTable with GSI
        ddb.create_table(
            TableName="test-callbacks",
            KeySchema=[{"AttributeName": "request_id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "request_id",  "AttributeType": "S"},
                {"AttributeName": "status",       "AttributeType": "S"},
                {"AttributeName": "created_at",   "AttributeType": "N"},
            ],
            GlobalSecondaryIndexes=[{
                "IndexName": "UrgencyIndex",
                "KeySchema": [
                    {"AttributeName": "status",     "KeyType": "HASH"},
                    {"AttributeName": "created_at", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }],
            BillingMode="PAY_PER_REQUEST",
        )

        # DispatchLogTable
        ddb.create_table(
            TableName="test-dispatch-logs",
            KeySchema=[{"AttributeName": "log_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "log_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        yield
    params._cache.clear()


def _sms_event(phone="+237612345678", text="1"):
    return {"requestContext": {}, "body": json.dumps({"from": phone, "text": text}),
            "headers": {"X-Gateway-Token": _GATEWAY_TOKEN}}

def _ussd_event(phone="+237612345678", text=""):
    return {"requestContext": {}, "body": json.dumps({
        "phoneNumber": phone, "sessionId": "ussd-sess-1", "text": text,
    }), "headers": {"X-Gateway-Token": _GATEWAY_TOKEN}}


# -- Session engine unit tests -----------------------------------------------

def test_sms_init_shows_menu():
    resp = post_sms(_sms_event(text="HELLO"), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert "HealthTrack" in body["response"]
    assert body["state"] == "MENU"


def test_sms_menu_choice_1_facility():
    post_sms(_sms_event(text="HELLO"), None)  # init -> MENU
    resp = post_sms(_sms_event(text="1"), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["state"] == "FACILITY"


def test_sms_triage_flow():
    post_sms(_sms_event(text="MENU"), None)
    post_sms(_sms_event(text="3"), None)       # -> TRIAGE_Q1
    resp = post_sms(_sms_event(text="25"), None)  # age -> TRIAGE_Q2
    assert json.loads(resp["body"])["state"] == "TRIAGE_Q2"
    resp2 = post_sms(_sms_event(text="2"), None)  # breathing -> RED
    body = json.loads(resp2["body"])
    assert "URGENT" in body["response"]


def test_sms_callback_writes_record():
    post_sms(_sms_event(text="MENU"), None)
    post_sms(_sms_event(text="4"), None)       # -> CALLBACK_CONFIRM
    resp = post_sms(_sms_event(text="YES"), None)
    assert resp["statusCode"] == 200
    # Check callback record was created
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    items = ddb.Table("test-callbacks").scan()["Items"]
    assert len(items) == 1
    assert items[0]["channel"] == "sms"


def test_ussd_init():
    resp = post_ussd(_ussd_event(text=""), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert "HealthTrack" in body["response"]


def test_ussd_final_states():
    post_ussd(_ussd_event(text=""), None)    # INIT -> MENU
    post_ussd(_ussd_event(text="2"), None)   # -> FIRST_AID
    resp = post_ussd(_ussd_event(text="ok"), None)
    body = json.loads(resp["body"])
    assert body["is_final"] is True or body["state"] == "FIRST_AID"


# -- Telco gateway authentication -------------------------------------------

@pytest.mark.parametrize("handler,make_event", [(post_sms, _sms_event), (post_ussd, _ussd_event)])
def test_gateway_token_missing_or_wrong_is_401(handler, make_event):
    event = make_event(text="HELLO")
    event["headers"] = {}
    assert handler(event, None)["statusCode"] == 401
    event["headers"] = {"X-Gateway-Token": "wrong"}
    assert handler(event, None)["statusCode"] == 401
    event["headers"] = None
    event["queryStringParameters"] = {"token": "wrong"}
    assert handler(event, None)["statusCode"] == 401


@pytest.mark.parametrize("handler,make_event", [(post_sms, _sms_event), (post_ussd, _ussd_event)])
def test_gateway_token_right_is_200(handler, make_event):
    event = make_event(text="HELLO")
    event["headers"] = {"x-gateway-token": _GATEWAY_TOKEN}  # header lookup is case-insensitive
    assert handler(event, None)["statusCode"] == 200
    event["headers"] = {}
    event["queryStringParameters"] = {"token": _GATEWAY_TOKEN}
    assert handler(event, None)["statusCode"] == 200


def test_gateway_token_unset_param_is_401():
    boto3.client("ssm", region_name="us-east-1").put_parameter(
        Name=_TEST_ENV["GATEWAY_TOKEN_PARAM"], Value="UNSET", Type="SecureString", Overwrite=True)
    assert post_sms(_sms_event(text="HELLO"), None)["statusCode"] == 401
    event = _sms_event(text="HELLO")
    event["headers"] = {"X-Gateway-Token": "UNSET"}
    assert post_sms(event, None)["statusCode"] == 401


def test_sms_second_callback_in_same_session_is_recorded():
    for text in ("MENU", "4", "YES", "MENU", "4", "YES"):
        post_sms(_sms_event(text=text), None)
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    assert len(ddb.Table("test-callbacks").scan()["Items"]) == 2
    session = ddb.Table("test-sessions").get_item(Key={"session_id": "+237612345678#sms"})["Item"]
    assert "callback_requested" not in session["context"]


def test_channel_logs_do_not_contain_phone_or_text(caplog):
    caplog.set_level("INFO")
    post_sms(_sms_event(text="MENU"), None)
    post_sms(_sms_event(text="4"), None)
    post_ussd(_ussd_event(text=""), None)
    assert "MENU ->" in caplog.text or "-> MENU" in caplog.text
    assert "+237612345678" not in caplog.text
    assert "nurse callback" not in caplog.text.lower()


# -- Operator console tests ---------------------------------------------------

def _seed_callback(request_id="cb1"):
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    ddb.Table("test-callbacks").put_item(Item={
        "request_id": request_id,
        "phone": "+237612345678",
        "channel": "sms",
        "triage_summary": "fever",
        "urgency": "AMBER",
        "status": "pending",
        "created_at": Decimal(int(time.time() * 1000)),
    })


def test_get_callbacks_empty():
    resp = get_callbacks(_op_event(), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["count"] == 0


def test_get_callbacks_returns_pending():
    _seed_callback()
    resp = get_callbacks(_op_event(), None)
    assert json.loads(resp["body"])["count"] == 1


def test_get_callbacks_requires_operator():
    event = _op_event()
    event["requestContext"]["authorizer"]["claims"]["cognito:groups"] = "Patient"
    resp = get_callbacks(event, None)
    assert resp["statusCode"] == 403


def test_put_callback_handle_ok():
    _seed_callback("cb-handle-1")
    resp = put_callback_handle(_op_event(
        method="PUT",
        path_params={"request_id": "cb-handle-1"},
        body={"note": "Called back, resolved"},
    ), None)
    assert resp["statusCode"] == 200


def test_put_callback_handle_already_handled():
    _seed_callback("cb-handle-2")
    put_callback_handle(_op_event(
        method="PUT",
        path_params={"request_id": "cb-handle-2"},
        body={"note": "first"},
    ), None)
    resp = put_callback_handle(_op_event(
        method="PUT",
        path_params={"request_id": "cb-handle-2"},
        body={"note": "second"},
    ), None)
    assert resp["statusCode"] == 409


def test_post_dispatch_log_ok():
    resp = post_dispatch_log(_op_event(
        method="POST",
        body={"facility_id": "fac-001", "note": "Dispatched ambulance", "urgency": "RED"},
    ), None)
    assert resp["statusCode"] == 201
    assert "log_id" in json.loads(resp["body"])


def test_post_dispatch_log_missing_facility():
    resp = post_dispatch_log(_op_event(method="POST", body={}), None)
    assert resp["statusCode"] == 400
