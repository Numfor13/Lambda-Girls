import json, os, sys, time
import pytest
import boto3
from decimal import Decimal
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
os.environ.update({
    "CONSULTATION_TABLE": "test-consultations",
    "MESSAGE_TABLE":      "test-messages",
    "TRIAGE_TABLE":       "test-triage-sync",
    "VOICE_NOTES_BUCKET": "test-voice-bucket",
    "ENV_NAME":           "dev",
})
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

from health_track.lambdas.consultation.post_consultation import handler as post_consultation
from health_track.lambdas.consultation.list_consultations import handler as list_consultations
from health_track.lambdas.consultation.get_consultation import handler as get_consultation
from health_track.lambdas.consultation.post_message import handler as post_message
from health_track.lambdas.consultation.post_sync import handler as post_sync


def _event(sub, method="POST", body=None, path_params=None, groups="Patient"):
    return {
        "requestContext": {"authorizer": {"claims": {
            "sub": sub,
            "cognito:groups": groups,
        }}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params or {},
        "queryStringParameters": {},
    }


@pytest.fixture(autouse=True)
def aws_tables():
    # Re-apply env vars inside the fixture so other test-file module-level assignments
    # (e.g. test_triage_handlers.py sets TRIAGE_TABLE="test-triage") cannot clobber them.
    # Save originals so we don't break sibling test files.
    _saved = {k: os.environ.get(k) for k in ("CONSULTATION_TABLE", "MESSAGE_TABLE", "TRIAGE_TABLE", "VOICE_NOTES_BUCKET")}
    os.environ["CONSULTATION_TABLE"] = "test-consultations"
    os.environ["MESSAGE_TABLE"] = "test-messages"
    os.environ["TRIAGE_TABLE"] = "test-triage-sync"
    os.environ["VOICE_NOTES_BUCKET"] = "test-voice-bucket"
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")

        # ConsultationTable
        ddb.create_table(
            TableName="test-consultations",
            KeySchema=[{"AttributeName": "consultation_id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "consultation_id", "AttributeType": "S"},
                {"AttributeName": "patient_id", "AttributeType": "S"},
                {"AttributeName": "created_at", "AttributeType": "N"},
                {"AttributeName": "status", "AttributeType": "S"},
                {"AttributeName": "urgency_created", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "PatientIndex",
                    "KeySchema": [
                        {"AttributeName": "patient_id", "KeyType": "HASH"},
                        {"AttributeName": "created_at", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "StatusUrgencyIndex",
                    "KeySchema": [
                        {"AttributeName": "status", "KeyType": "HASH"},
                        {"AttributeName": "urgency_created", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # MessageTable
        ddb.create_table(
            TableName="test-messages",
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

        # TriageTable for sync tests
        ddb.create_table(
            TableName="test-triage-sync",
            KeySchema=[
                {"AttributeName": "result_id", "KeyType": "HASH"},
                {"AttributeName": "user_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "result_id", "AttributeType": "S"},
                {"AttributeName": "user_id", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="test-voice-bucket")

        yield

    # Restore env vars so sibling test files aren't affected
    for k, v in _saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def test_post_consultation_ok(aws_tables):
    resp = post_consultation(_event("u1", body={"complaint": "headache"}), None)
    assert resp["statusCode"] == 201
    body = json.loads(resp["body"])
    assert body["consultation_id"]
    assert body["status"] == "pending_payment"


def test_post_consultation_missing_complaint(aws_tables):
    resp = post_consultation(_event("u1", body={"note": "x"}), None)
    assert resp["statusCode"] == 400


def test_list_consultations_patient(aws_tables):
    post_consultation(_event("u2", body={"complaint": "fever"}), None)
    resp = list_consultations(_event("u2", method="GET"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["count"] == 1


def test_list_consultations_doctor_sees_paid(aws_tables):
    # Create a paid consultation
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    table = ddb.Table("test-consultations")
    now = int(time.time() * 1000)
    table.put_item(Item={
        "consultation_id": "c-paid",
        "patient_id": "p1",
        "phone_owner_id": "p1",
        "status": "paid",
        "urgency": "AMBER",
        "urgency_created": f"AMBER#{now}",
        "created_at": Decimal(now),
    })
    resp = list_consultations(_event("doc1", method="GET", groups="Doctor"), None)
    assert resp["statusCode"] == 200
    items = json.loads(resp["body"])["consultations"]
    assert any(c["consultation_id"] == "c-paid" for c in items)


def test_get_consultation_owner(aws_tables):
    create = post_consultation(_event("u3", body={"complaint": "pain"}), None)
    cid = json.loads(create["body"])["consultation_id"]
    resp = get_consultation(_event("u3", method="GET", path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 200


def test_get_consultation_forbidden(aws_tables):
    create = post_consultation(_event("u4", body={"complaint": "cough"}), None)
    cid = json.loads(create["body"])["consultation_id"]
    resp = get_consultation(_event("other-user", method="GET", path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 403


def test_post_message_ok(aws_tables):
    create = post_consultation(_event("u5", body={"complaint": "ache"}), None)
    cid = json.loads(create["body"])["consultation_id"]
    resp = post_message(_event("u5", body={
        "content_type": "text",
        "text_body": "Hello doctor",
        "client_message_id": "msg-idempotency-1",
    }, path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 201


def test_post_message_idempotent(aws_tables):
    create = post_consultation(_event("u6", body={"complaint": "sore throat"}), None)
    cid = json.loads(create["body"])["consultation_id"]
    payload = {"content_type": "text", "text_body": "First", "client_message_id": "msg-idem-2"}
    resp1 = post_message(_event("u6", body=payload, path_params={"consultation_id": cid}), None)
    resp2 = post_message(_event("u6", body=payload, path_params={"consultation_id": cid}), None)
    # Both return 200/201 and same message_id
    b1 = json.loads(resp1["body"])
    b2 = json.loads(resp2["body"])
    assert b1["message_id"] == b2["message_id"]


def test_post_sync_triage(aws_tables):
    payload = {
        "triage_results": [{
            "result_id": "tr-offline-1",
            "urgency": "RED",
            "recommendation": "Go now",
            "facility_type_needed": "emergency",
            "rules_fired": [],
            "symptom_payload": {"age_months": 3, "symptoms": ["convulsions"], "vitals": {}},
            "queued_at": int(time.time() * 1000) - 5000,
        }],
        "messages": [],
    }
    resp = post_sync(_event("u7", body=payload), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["has_red_triage"] is True
    assert body["results"]["triage_results"][0]["status"] == "ok"


def test_post_sync_message_idempotent(aws_tables):
    create = post_consultation(_event("u8", body={"complaint": "test"}), None)
    cid = json.loads(create["body"])["consultation_id"]
    msg = {
        "consultation_id": cid,
        "client_message_id": "sync-msg-1",
        "content_type": "text",
        "text_body": "offline msg",
    }
    resp1 = post_sync(_event("u8", body={"triage_results": [], "messages": [msg]}), None)
    resp2 = post_sync(_event("u8", body={"triage_results": [], "messages": [msg]}), None)
    assert json.loads(resp1["body"])["results"]["messages"][0]["status"] == "ok"
    assert json.loads(resp2["body"])["results"]["messages"][0]["status"] == "duplicate"
