import json, os, sys, time
import pytest
import boto3
from decimal import Decimal
from unittest.mock import patch
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

_TEST_ENV = {
    "PUSH_SUBSCRIPTION_TABLE": "test-push-subscriptions",
    "VAPID_PUBLIC_KEY":        "test-vapid-public-key",
    "VAPID_PRIVATE_KEY":       "test-vapid-private-key",
    "VAPID_SECRET_ARN":        "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
    "ENV_NAME":                "dev",
}

_saved = {k: os.environ.get(k) for k in _TEST_ENV}
os.environ.update(_TEST_ENV)

from health_track.lambdas.push.get_vapid_public_key import handler as get_vapid_public_key
from health_track.lambdas.push.post_subscribe import handler as post_subscribe
from health_track.lambdas.push.delete_subscribe import handler as delete_subscribe
from health_track.lambdas.push.post_send import handler as post_send


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


@pytest.fixture(autouse=True)
def aws_resources():
    os.environ.update(_TEST_ENV)
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="test-push-subscriptions",
            KeySchema=[{"AttributeName": "user_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "user_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield


def test_get_vapid_public_key():
    resp = get_vapid_public_key(_public_event(), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["vapid_public_key"] == "test-vapid-public-key"


def test_post_subscribe_ok():
    resp = post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/sub/abc",
        "keys": {"p256dh": "key1", "auth": "auth1"},
    }), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["subscribed"] is True


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
    assert json.loads(resp["body"])["unsubscribed"] is True


def test_delete_subscribe_nonexistent_ok():
    # Deleting a nonexistent item should still return 200 (DynamoDB delete_item is idempotent)
    resp = delete_subscribe(_auth_event(method="DELETE"), None)
    assert resp["statusCode"] == 200


def test_post_send_no_subscription():
    resp = post_send({"user_id": "nobody", "payload": {"title": "Hi"}}, None)
    body = json.loads(resp["body"])
    assert body["sent"] is False
    assert body["reason"] == "no_subscription"


def test_post_send_with_subscription_success():
    post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/u1",
        "keys": {"p256dh": "k", "auth": "a"},
    }), None)
    # Monkeypatch _send_push to return True
    import health_track.lambdas.push.post_send as ps_module
    with patch.object(ps_module, "_send_push", return_value=True):
        resp = post_send({"user_id": "u1", "payload": {"title": "Doctor replied"}}, None)
    assert json.loads(resp["body"])["sent"] is True


def test_post_send_subscription_expired_deletes():
    post_subscribe(_auth_event(method="POST", body={
        "endpoint": "https://push.example.com/u1",
        "keys": {"p256dh": "k", "auth": "a"},
    }), None)
    import health_track.lambdas.push.post_send as ps_module
    with patch.object(ps_module, "_send_push", return_value=False):
        resp = post_send({"user_id": "u1", "payload": {"title": "Hi"}}, None)
    body = json.loads(resp["body"])
    assert body["sent"] is False
    assert body["reason"] == "subscription_expired"
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
    assert json.loads(resp["body"])["sent"] is True


def test_post_subscribe_unauthorized():
    event = _auth_event(method="POST", body={
        "endpoint": "https://x.com", "keys": {"p256dh": "k", "auth": "a"},
    })
    event["requestContext"] = {}
    resp = post_subscribe(event, None)
    assert resp["statusCode"] == 401
