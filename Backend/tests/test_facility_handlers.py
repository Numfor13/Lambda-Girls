import json, os, sys
from decimal import Decimal
import pytest
import boto3
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
os.environ["FACILITY_TABLE"] = "test-facilities"
os.environ["ENV_NAME"] = "dev"
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

from health_track.lambdas.facility.get_facilities import handler as list_facilities
from health_track.lambdas.facility.get_facility import handler as get_facility
from health_track.lambdas.facility.post_facility import handler as create_facility
from health_track.lambdas.facility.put_facility import handler as update_facility


def _admin_event(method="GET", body=None, path_params=None, query=None):
    return {
        "requestContext": {"authorizer": {"claims": {
            "sub": "admin-sub",
            "cognito:groups": "Admin"
        }}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params or {},
        "queryStringParameters": query or {},
    }


@pytest.fixture(autouse=True)
def ddb_table():
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = ddb.create_table(
            TableName="test-facilities",
            KeySchema=[{"AttributeName": "facility_id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "facility_id", "AttributeType": "S"},
                {"AttributeName": "region", "AttributeType": "S"},
                {"AttributeName": "primary_capability", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "RegionIndex",
                    "KeySchema": [
                        {"AttributeName": "region", "KeyType": "HASH"},
                        {"AttributeName": "facility_id", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "CapabilityIndex",
                    "KeySchema": [
                        {"AttributeName": "primary_capability", "KeyType": "HASH"},
                        {"AttributeName": "facility_id", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield table


def _seed_facility(table, fid, **kwargs):
    item = {
        "facility_id": fid,
        "name": "Test Clinic",
        "region": "Southwest",
        "primary_capability": "general",
        "is_active": True,
        "latitude": Decimal("4.16"),
        "longitude": Decimal("9.23"),
        **kwargs,
    }
    table.put_item(Item=item)
    return item


def test_list_facilities_empty(ddb_table):
    resp = list_facilities({"queryStringParameters": {}, "pathParameters": {}}, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["facilities"] == []


def test_list_facilities_returns_active(ddb_table):
    _seed_facility(ddb_table, "f1")
    _seed_facility(ddb_table, "f2", is_active=False)
    resp = list_facilities({"queryStringParameters": {}, "pathParameters": {}}, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert len(body["facilities"]) == 1
    assert body["facilities"][0]["facility_id"] == "f1"


def test_get_facility_found(ddb_table):
    _seed_facility(ddb_table, "fx1")
    resp = get_facility({"pathParameters": {"facility_id": "fx1"}, "queryStringParameters": {}}, None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["facility_id"] == "fx1"


def test_get_facility_not_found(ddb_table):
    resp = get_facility({"pathParameters": {"facility_id": "nope"}, "queryStringParameters": {}}, None)
    assert resp["statusCode"] == 404


def test_get_facility_inactive(ddb_table):
    _seed_facility(ddb_table, "fx2", is_active=False)
    resp = get_facility({"pathParameters": {"facility_id": "fx2"}, "queryStringParameters": {}}, None)
    assert resp["statusCode"] == 404


def test_create_facility_ok(ddb_table):
    event = _admin_event("POST", body={
        "name": "New Clinic", "region": "Southwest", "quarter": "Molyko",
        "address": "123 Main St", "phone": "+237600000001",
        "latitude": 4.16, "longitude": 9.23,
    })
    resp = create_facility(event, None)
    assert resp["statusCode"] == 201
    body = json.loads(resp["body"])
    assert body["facility_id"]


def test_create_facility_missing_fields(ddb_table):
    event = _admin_event("POST", body={"name": "Incomplete"})
    resp = create_facility(event, None)
    assert resp["statusCode"] == 400


def test_create_facility_non_admin(ddb_table):
    event = {
        "requestContext": {"authorizer": {"claims": {"sub": "u1", "cognito:groups": "Patient"}}},
        "httpMethod": "POST",
        "body": json.dumps({"name": "X", "region": "SW", "quarter": "Q", "address": "A",
                            "phone": "+237600000002", "latitude": 4.16, "longitude": 9.23}),
        "pathParameters": {},
        "queryStringParameters": {},
    }
    resp = create_facility(event, None)
    assert resp["statusCode"] == 403


def test_update_facility_not_found(ddb_table):
    event = _admin_event("PUT", body={"name": "Updated"}, path_params={"facility_id": "nope"})
    resp = update_facility(event, None)
    assert resp["statusCode"] == 404


def test_update_facility_ok(ddb_table):
    _seed_facility(ddb_table, "fu1")
    event = _admin_event("PUT", body={"name": "Updated Name"}, path_params={"facility_id": "fu1"})
    resp = update_facility(event, None)
    assert resp["statusCode"] == 200
