import json, os, sys, time, types
import pytest
import boto3
from decimal import Decimal
from unittest.mock import patch
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

_TEST_ENV = {
    "PUSH_SUBSCRIPTION_TABLE": "test-push-subscriptions",
    "VAPID_PUBLIC_KEY_PARAM":  "/health-track/dev/vapid-public-key",
    "VAPID_PRIVATE_KEY_PARAM": "/health-track/dev/vapid-private-key",
    "VAPID_SUBJECT":           "mailto:ops@example.org",
    "ENV_NAME":                "dev",
    "AWS_DEFAULT_REGION":      "us-east-1",
}

_saved = {k: os.environ.get(k) for k in _TEST_ENV}
os.environ.update(_TEST_ENV)

from health_track.lambdas.push.get_vapid_public_key import handler as get_vapid_public_key
from health_track.lambdas.push.post_subscribe import handler as post_subscribe
from health_track.lambdas.push.delete_subscribe import handler as delete_subscribe
from health_track.lambdas.push.post_send import handler as post_send
from health_track_common import params


def _auth_event(sub="u1", method="GET", body=None):
    return {
        "requestContext": {"authorizer": {"claims": {"sub": sub}}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": {},
        "queryStringParameters": {},
        "headers": {},
    }


def _public_event(method="GET"):
    return {
        "requestContext": {},
        "httpMethod": method,
        "body": None,
        "pathParameters": {},
        "queryStringParameters": {},
        "headers": {},
    }


def _put_param(name, value, type_="SecureString"):
    boto3.client("ssm", region_name="us-east-1").put_parameter(
        Name=_TEST_ENV[name], Value=value, Type=type_, Overwrite=True)


@pytest.fixture(autouse=True)
def aws_resources():
    os.environ.update(_TEST_ENV)
    params._cache.clear()
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="test-push-subscriptions",
            KeySchema=[{"AttributeName": "user_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "user_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        _put_param("VAPID_PUBLIC_KEY_PARAM", "test-vapid-public-key", "String")
        _put_param("VAPID_PRIVATE_KEY_PARAM", "test-vapid-private-key")
        yield
    params._cache.clear()


def test_get_vapid_public_key():
    resp = get_vapid_public_key(_public_event(), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"public_key": "test-vapid-public-key",
                                        "vapid_public_key": "test-vapid-public-key"}


def test_get_vapid_public_key_unset_503():
    _put_param("VAPID_PUBLIC_KEY_PARAM", "UNSET", "String")
    assert get_vapid_public_key(_public_event(), None)["statusCode"] == 503


def test_post_subscribe_ok():
    resp = post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/sub/abc",
        "keys": {"p256dh": "key1", "auth": "auth1"},
    }), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"subscribed": True, "ok": True}


def test_post_subscribe_frontend_shape():
    resp = post_subscribe(_auth_event(method="POST", body={"subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
        "expirationTime": None,
        "keys": {"p256dh": "key1", "auth": "auth1"},
    }}), None)
    assert resp["statusCode"] == 200
    item = boto3.resource("dynamodb", region_name="us-east-1").Table(
        "test-push-subscriptions").get_item(Key={"user_id": "u1"})["Item"]
    assert item["subscription_json"] == {"endpoint": "https://fcm.googleapis.com/fcm/send/abc",
                                         "keys": {"p256dh": "key1", "auth": "auth1"}}


@pytest.mark.parametrize("endpoint", [
    "http://push.example.com/sub",
    "https://127.0.0.1/sub",
    "https://[::1]/sub",
    "https://169.254.169.254/latest/meta-data",
    "https://2130706433/",
    "https://localhost/sub",
    "https://api.localhost/sub",
    "https://intranet/sub",
    "file:///etc/passwd",
    "https://push.example.com/" + "a" * 1024,
])
def test_post_subscribe_rejects_unsafe_endpoint(endpoint):
    resp = post_subscribe(_auth_event(method="POST", body={
        "endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"},
    }), None)
    assert resp["statusCode"] == 400


def test_post_subscribe_missing_fields():
    resp = post_subscribe(_auth_event(method="POST", body={"endpoint": "https://x.com"}), None)
    assert resp["statusCode"] == 400


def test_post_subscribe_upserts():
    body = {"endpoint": "https://push.example.com/sub/abc", "keys": {"p256dh": "k", "auth": "a"}}
    post_subscribe(_auth_event(method="POST", body=body), None)
    post_subscribe(_auth_event(method="POST", body={**body, "endpoint": "https://updated.com/sub"}), None)
    # Second call should succeed (upsert)
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    item = ddb.Table("test-push-subscriptions").get_item(Key={"user_id": "u1"}).get("Item")
    assert item["subscription_json"]["endpoint"] == "https://updated.com/sub"


def test_delete_subscribe_ok():
    # Subscribe first
    post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://x.com", "keys": {"p256dh": "k", "auth": "a"},
    }), None)
    resp = delete_subscribe(_auth_event(method="DELETE"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"unsubscribed": True, "ok": True}


def test_delete_subscribe_nonexistent_ok():
    # Deleting a nonexistent item should still return 200 (DynamoDB delete_item is idempotent)
    resp = delete_subscribe(_auth_event(method="DELETE"), None)
    assert resp["statusCode"] == 200


def test_post_send_no_subscription():
    assert post_send({"user_id": "nobody", "payload": {"title": "Hi"}}, None) == {
        "sent": False, "reason": "no_subscription"}


def test_post_send_missing_user_id_returns_normally():
    assert post_send({"detail": {"payload": {"title": "Hi"}}}, None)["sent"] is False


def test_post_send_with_subscription_success():
    post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/u1",
        "keys": {"p256dh": "k", "auth": "a"},
    }), None)
    # Monkeypatch _send_push to return True
    import health_track.lambdas.push.post_send as ps_module
    with patch.object(ps_module, "_send_push", return_value=True):
        resp = post_send({"user_id": "u1", "payload": {"title": "Doctor replied"}}, None)
    assert resp == {"sent": True}


def test_post_send_subscription_expired_deletes():
    post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/u1",
        "keys": {"p256dh": "k", "auth": "a"},
    }), None)
    import health_track.lambdas.push.post_send as ps_module
    with patch.object(ps_module, "_send_push", return_value=False):
        resp = post_send({"user_id": "u1", "payload": {"title": "Hi"}}, None)
    assert resp == {"sent": False, "reason": "subscription_expired"}
    # Subscription should be deleted
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    item = ddb.Table("test-push-subscriptions").get_item(Key={"user_id": "u1"}).get("Item")
    assert item is None


def test_post_send_eventbridge_envelope():
    post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/u1",
        "keys": {"p256dh": "k", "auth": "a"},
    }), None)
    import health_track.lambdas.push.post_send as ps_module
    with patch.object(ps_module, "_send_push", return_value=True):
        resp = post_send({
            "detail": {"user_id": "u1", "payload": {"title": "Payment confirmed"}},
        }, None)
    assert resp == {"sent": True}


def test_post_subscribe_unauthorized():
    event = _auth_event(method="POST", body={
        "endpoint": "https://x.com", "keys": {"p256dh": "k", "auth": "a"},
    })
    event["requestContext"] = {}
    resp = post_subscribe(event, None)
    assert resp["statusCode"] == 401


def test_post_send_anonymous_user_no_subscription():
    """Phase 10: message events for anon#<hash> patients have no subscription -> clean no-op."""
    resp = post_send({"detail": {"user_id": "anon#" + "cd" * 32, "payload": {"title": "t"}}}, None)
    assert resp == {"sent": False, "reason": "no_subscription"}


# -- Real _send_push against a fake pywebpush (the layer is not installed locally) --

def _fake_pywebpush(monkeypatch, status=None):
    """Install a stand-in pywebpush; status=None succeeds, otherwise webpush raises with that HTTP status."""
    class WebPushException(Exception):
        def __init__(self, message, response=None):
            super().__init__(message)
            self.response = response

    calls = []

    def webpush(**kwargs):
        calls.append(kwargs)
        if status is not None:
            raise WebPushException(f"Push failed: {status}", response=types.SimpleNamespace(status_code=status))

    monkeypatch.setitem(sys.modules, "pywebpush",
                        types.SimpleNamespace(webpush=webpush, WebPushException=WebPushException))
    return calls


def _subscribe_u1():
    post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/u1", "keys": {"p256dh": "k", "auth": "a"},
    }), None)


def _stored_u1():
    return boto3.resource("dynamodb", region_name="us-east-1").Table(
        "test-push-subscriptions").get_item(Key={"user_id": "u1"}).get("Item")


def test_post_send_uses_ssm_key_and_subject(monkeypatch):
    calls = _fake_pywebpush(monkeypatch)
    _subscribe_u1()
    assert post_send({"detail": {"user_id": "u1", "payload": {"title": "t"}}}, None) == {"sent": True}
    assert calls[0]["vapid_private_key"] == "test-vapid-private-key"
    assert calls[0]["vapid_claims"]["sub"] == "mailto:ops@example.org"
    assert calls[0]["subscription_info"]["endpoint"] == "https://push.example.com/u1"


@pytest.mark.parametrize("status", [404, 410])
def test_post_send_gone_deletes_subscription(monkeypatch, status):
    _fake_pywebpush(monkeypatch, status)
    _subscribe_u1()
    resp = post_send({"detail": {"user_id": "u1", "payload": {"title": "t"}}}, None)
    assert resp == {"sent": False, "reason": "subscription_expired"}
    assert _stored_u1() is None


def test_post_send_server_error_raises_and_keeps_subscription(monkeypatch):
    _fake_pywebpush(monkeypatch, 500)
    _subscribe_u1()
    with pytest.raises(Exception, match="500"):
        post_send({"detail": {"user_id": "u1", "payload": {"title": "t"}}}, None)
    assert _stored_u1() is not None


def test_post_send_unset_private_key_raises(monkeypatch):
    _fake_pywebpush(monkeypatch)
    _subscribe_u1()
    _put_param("VAPID_PRIVATE_KEY_PARAM", "UNSET")
    with pytest.raises(RuntimeError):
        post_send({"detail": {"user_id": "u1", "payload": {"title": "t"}}}, None)
