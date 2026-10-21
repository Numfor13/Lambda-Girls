import json, os, sys, time
import pytest
import boto3
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "health_track", "lambdas", "triage"))
os.environ["TRIAGE_TABLE"] = "test-triage"
os.environ["ENV_NAME"] = "dev"
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

from health_track.lambdas.triage.post_triage import handler as post_triage
from health_track.lambdas.triage.get_triage_result import handler as get_triage_result
from health_track.lambdas.triage.list_triage_results import handler as list_results


def _event(sub, method="POST", body=None, path_params=None):
    return {
        "requestContext": {"authorizer": {"claims": {"sub": sub}}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params or {},
        "queryStringParameters": {},
    }


@pytest.fixture(autouse=True)
def ddb_table():
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = ddb.create_table(
            TableName="test-triage",
            KeySchema=[
                {"AttributeName": "result_id", "KeyType": "HASH"},
                {"AttributeName": "user_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "result_id", "AttributeType": "S"},
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "created_at", "AttributeType": "N"},
            ],
            GlobalSecondaryIndexes=[{
                "IndexName": "UserIndex",
                "KeySchema": [
                    {"AttributeName": "user_id", "KeyType": "HASH"},
                    {"AttributeName": "created_at", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }],
            BillingMode="PAY_PER_REQUEST",
        )
        yield table


def test_post_triage_green(ddb_table):
    resp = post_triage(_event("u1", body={"symptoms": [], "age_months": 25}), None)
    assert resp["statusCode"] == 201
    body = json.loads(resp["body"])
    assert body["urgency"] == "GREEN"
    assert body["result_id"]


def test_post_triage_red_chest_pain(ddb_table):
    resp = post_triage(_event("u1", body={"symptoms": ["chest_pain"]}), None)
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["urgency"] == "RED"


def test_post_triage_missing_symptoms(ddb_table):
    resp = post_triage(_event("u1", body={"age_months": 5}), None)
    assert resp["statusCode"] == 400


def test_post_triage_offline_queued_at(ddb_table):
    ts = int(time.time() * 1000) - 60000
    resp = post_triage(_event("u1", body={"symptoms": [], "queued_at": ts}), None)
    assert resp["statusCode"] == 201
    body = json.loads(resp["body"])
    assert body["synced_from_offline"] is True
    assert body["created_at"] == ts


def test_get_triage_result_found(ddb_table):
    create_resp = post_triage(_event("u2", body={"symptoms": ["cough_mild"]}), None)
    result_id = json.loads(create_resp["body"])["result_id"]
    get_resp = get_triage_result(_event("u2", path_params={"result_id": result_id}), None)
    assert get_resp["statusCode"] == 200


def test_get_triage_result_not_found(ddb_table):
    resp = get_triage_result(_event("u2", path_params={"result_id": "nonexistent"}), None)
    assert resp["statusCode"] == 404


def test_get_triage_result_wrong_user(ddb_table):
    create_resp = post_triage(_event("u3", body={"symptoms": []}), None)
    result_id = json.loads(create_resp["body"])["result_id"]
    get_resp = get_triage_result(_event("other-user", path_params={"result_id": result_id}), None)
    assert get_resp["statusCode"] == 403


def test_list_triage_results_empty(ddb_table):
    resp = list_results(_event("new-user"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["results"] == []


def test_list_triage_results_returns_own(ddb_table):
    post_triage(_event("u4", body={"symptoms": []}), None)
    resp = list_results(_event("u4"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["count"] == 1
