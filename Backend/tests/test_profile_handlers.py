import json
import os
import sys
import decimal
import pytest
import boto3
from moto import mock_aws

# Make the layer importable locally
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
os.environ["PROFILE_TABLE"] = "test-profiles"
os.environ["ENV_NAME"] = "dev"
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

from health_track.lambdas.profile.get_profile import handler as get_profile
from health_track.lambdas.profile.put_profile import handler as put_profile
from health_track.lambdas.profile.post_household import handler as post_household
from health_track.lambdas.profile.delete_household_member import handler as delete_household_member


def _make_event(sub, method="GET", body=None, path_params=None):
    return {
        "requestContext": {"authorizer": {"claims": {"sub": sub}}},
        "headers": {"Authorization": "Bearer fake"},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params,
    }


@pytest.fixture(autouse=True)
def ddb_table():
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = ddb.create_table(
            TableName="test-profiles",
            KeySchema=[{"AttributeName": "user_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "user_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield table


def test_get_profile_not_found(ddb_table):
    resp = get_profile(_make_event("user-1"), None)
    assert resp["statusCode"] == 404


def test_get_profile_found(ddb_table):
    ddb_table.put_item(Item={"user_id": "user-1", "display_name": "Alice", "locale": "en", "on_behalf_profiles": [], "created_at": 123456})
    resp = get_profile(_make_event("user-1"), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["display_name"] == "Alice"


def test_get_profile_decimal_serialization(ddb_table):
    """Regression for C1: Decimal in created_at must not crash json.dumps."""
    ddb_table.put_item(Item={"user_id": "user-2", "created_at": decimal.Decimal("1700000000000"), "on_behalf_profiles": []})
    resp = get_profile(_make_event("user-2"), None)
    assert resp["statusCode"] == 200  # must not be 500


def test_get_profile_unauthorized():
    event = {
        "requestContext": {"authorizer": {"claims": {}}},
        "headers": {},
        "httpMethod": "GET",
        "body": None,
        "pathParameters": None,
    }
    resp = get_profile(event, None)
    assert resp["statusCode"] == 401


def test_put_profile_invalid_locale(ddb_table):
    ddb_table.put_item(Item={"user_id": "u1", "on_behalf_profiles": []})
    resp = put_profile(_make_event("u1", body={"locale": "es"}), None)
    assert resp["statusCode"] == 400


def test_put_profile_valid(ddb_table):
    ddb_table.put_item(Item={"user_id": "u1", "on_behalf_profiles": []})
    resp = put_profile(_make_event("u1", body={"locale": "fr", "display_name": "Bob"}), None)
    assert resp["statusCode"] == 200


def test_put_profile_no_profile(ddb_table):
    resp = put_profile(_make_event("ghost", body={"locale": "en"}), None)
    assert resp["statusCode"] == 404


def test_put_profile_invalid_json(ddb_table):
    event = _make_event("u1")
    event["body"] = "not-json"
    resp = put_profile(event, None)
    assert resp["statusCode"] == 400


def test_post_household_missing_fields(ddb_table):
    ddb_table.put_item(Item={"user_id": "u2", "on_behalf_profiles": []})
    resp = post_household(_make_event("u2", body={"name": "Child"}), None)
    assert resp["statusCode"] == 400


def test_post_household_ok(ddb_table):
    ddb_table.put_item(Item={"user_id": "u2", "on_behalf_profiles": []})
    resp = post_household(_make_event("u2", body={"name": "Child", "dob": "2020-01-01", "sex": "female", "relationship": "child"}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["member_id"]


def test_post_household_no_profile(ddb_table):
    resp = post_household(_make_event("ghost", body={"name": "Child", "dob": "2020-01-01", "sex": "female", "relationship": "child"}), None)
    assert resp["statusCode"] == 404


def test_post_household_size_limit(ddb_table):
    members = [{"member_id": str(i), "name": f"M{i}"} for i in range(10)]
    ddb_table.put_item(Item={"user_id": "u5", "on_behalf_profiles": members})
    resp = post_household(_make_event("u5", body={"name": "Child", "dob": "2020-01-01", "sex": "male", "relationship": "child"}), None)
    assert resp["statusCode"] == 400


def test_delete_household_member_not_found(ddb_table):
    ddb_table.put_item(Item={"user_id": "u3", "on_behalf_profiles": []})
    resp = delete_household_member(_make_event("u3", path_params={"member_id": "nonexistent"}), None)
    assert resp["statusCode"] == 404


def test_delete_household_member_ok(ddb_table):
    mid = "member-abc"
    ddb_table.put_item(Item={"user_id": "u4", "on_behalf_profiles": [{"member_id": mid, "name": "X"}]})
    resp = delete_household_member(_make_event("u4", path_params={"member_id": mid}), None)
    assert resp["statusCode"] == 200


def test_delete_household_profile_not_found(ddb_table):
    resp = delete_household_member(_make_event("ghost", path_params={"member_id": "mid"}), None)
    assert resp["statusCode"] == 404
