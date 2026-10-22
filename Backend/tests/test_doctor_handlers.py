import json, os, sys, time
import pytest
import boto3
from decimal import Decimal
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

_TEST_ENV = {
    "CONSULTATION_TABLE": "test-doctor-consultations",
    "MESSAGE_TABLE":      "test-doctor-messages",
    "TRIAGE_TABLE":       "test-doctor-triage",
    "PRESCRIPTION_TABLE": "test-prescriptions",
    "REFERRAL_TABLE":     "test-referrals",
    "ENV_NAME":           "dev",
}

def _save_env():
    return {k: os.environ.get(k) for k in _TEST_ENV}

_saved = _save_env()
os.environ.update(_TEST_ENV)

from health_track.lambdas.doctor.get_queue import handler as get_queue
from health_track.lambdas.doctor.claim_consultation import handler as claim_consultation
from health_track.lambdas.doctor.get_case import handler as get_case
from health_track.lambdas.doctor.close_consultation import handler as close_consultation
from health_track.lambdas.doctor.post_prescription import handler as post_prescription
from health_track.lambdas.doctor.get_prescription import handler as get_prescription
from health_track.lambdas.doctor.post_referral import handler as post_referral
from health_track.lambdas.doctor.get_referral import handler as get_referral


def _doctor_event(sub="doc1", method="GET", body=None, path_params=None):
    return {
        "requestContext": {"authorizer": {"claims": {
            "sub": sub,
            "cognito:groups": "Doctor",
        }}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params or {},
        "queryStringParameters": {},
        "headers": {},
    }

def _patient_event(sub="pat1", method="GET", body=None, path_params=None):
    return {
        "requestContext": {"authorizer": {"claims": {
            "sub": sub,
            "cognito:groups": "Patient",
        }}},
        "httpMethod": method,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params or {},
        "queryStringParameters": {},
        "headers": {},
    }


@pytest.fixture(autouse=True)
def aws_resources():
    # Save and restore env vars to avoid contaminating other test modules
    _orig = {k: os.environ.get(k) for k in _TEST_ENV}
    os.environ.update(_TEST_ENV)
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")

        # ConsultationTable
        ddb.create_table(
            TableName="test-doctor-consultations",
            KeySchema=[{"AttributeName": "consultation_id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "consultation_id", "AttributeType": "S"},
                {"AttributeName": "status", "AttributeType": "S"},
                {"AttributeName": "urgency_created", "AttributeType": "S"},
                {"AttributeName": "patient_id", "AttributeType": "S"},
                {"AttributeName": "created_at", "AttributeType": "N"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "StatusUrgencyIndex",
                    "KeySchema": [
                        {"AttributeName": "status", "KeyType": "HASH"},
                        {"AttributeName": "urgency_created", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "PatientIndex",
                    "KeySchema": [
                        {"AttributeName": "patient_id", "KeyType": "HASH"},
                        {"AttributeName": "created_at", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # MessageTable
        ddb.create_table(
            TableName="test-doctor-messages",
            KeySchema=[
                {"AttributeName": "consultation_id", "KeyType": "HASH"},
                {"AttributeName": "message_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "consultation_id", "AttributeType": "S"},
                {"AttributeName": "message_id", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # TriageTable
        ddb.create_table(
            TableName="test-doctor-triage",
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

        # PrescriptionTable
        ddb.create_table(
            TableName="test-prescriptions",
            KeySchema=[{"AttributeName": "code", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "code", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # ReferralTable
        ddb.create_table(
            TableName="test-referrals",
            KeySchema=[{"AttributeName": "code", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "code", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # Seed a paid consultation for tests
        now = int(time.time() * 1000)
        ddb.Table("test-doctor-consultations").put_item(Item={
            "consultation_id": "c-paid",
            "patient_id": "p1",
            "phone_owner_id": "p1",
            "status": "paid",
            "urgency": "AMBER",
            "urgency_created": f"AMBER#{now}",
            "created_at": Decimal(now),
            "updated_at": Decimal(now),
        })
        ddb.Table("test-doctor-consultations").put_item(Item={
            "consultation_id": "c-open",
            "patient_id": "p2",
            "phone_owner_id": "p2",
            "status": "open",
            "urgency": "RED",
            "doctor_id": "doc1",
            "urgency_created": f"RED#{now}",
            "created_at": Decimal(now),
            "updated_at": Decimal(now),
        })

        yield

    # Restore original env vars
    for k, v in _orig.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def test_get_queue_returns_paid_and_open(aws_resources):
    resp = get_queue(_doctor_event(), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["count"] == 2


def test_get_queue_red_first(aws_resources):
    resp = get_queue(_doctor_event(), None)
    items = json.loads(resp["body"])["queue"]
    urgencies = [i.get("urgency") for i in items]
    # RED should come before AMBER
    assert urgencies.index("RED") < urgencies.index("AMBER")


def test_get_queue_doctor_only(aws_resources):
    resp = get_queue(_patient_event(), None)
    assert resp["statusCode"] == 403


def test_claim_consultation(aws_resources):
    resp = claim_consultation(_doctor_event(path_params={"consultation_id": "c-paid"}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["status"] == "open"


def test_claim_already_open_fails(aws_resources):
    resp = claim_consultation(_doctor_event(path_params={"consultation_id": "c-open"}), None)
    assert resp["statusCode"] == 409


def test_get_case(aws_resources):
    resp = get_case(_doctor_event(path_params={"consultation_id": "c-open"}), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert "consultation" in body
    assert "messages" in body


def test_close_consultation(aws_resources):
    resp = close_consultation(_doctor_event(path_params={"consultation_id": "c-open"}), None)
    assert resp["statusCode"] == 200


def test_close_paid_fails(aws_resources):
    resp = close_consultation(_doctor_event(path_params={"consultation_id": "c-paid"}), None)
    assert resp["statusCode"] == 409


def test_post_prescription_ok(aws_resources):
    resp = post_prescription(_doctor_event(
        method="POST",
        path_params={"consultation_id": "c-open"},
        body={"medication_details": "Paracetamol 500mg", "instructions": "Take twice daily"},
    ), None)
    assert resp["statusCode"] == 201
    code = json.loads(resp["body"])["code"]
    assert len(code) == 8


def test_post_prescription_missing_fields(aws_resources):
    resp = post_prescription(_doctor_event(
        method="POST",
        path_params={"consultation_id": "c-open"},
        body={},
    ), None)
    assert resp["statusCode"] == 400


def test_get_prescription(aws_resources):
    create = post_prescription(_doctor_event(
        method="POST",
        path_params={"consultation_id": "c-open"},
        body={"medication_details": "Amoxicillin 250mg"},
    ), None)
    code = json.loads(create["body"])["code"]
    # Public lookup — no auth
    resp = get_prescription({"pathParameters": {"code": code}, "requestContext": {}, "headers": {}}, None)
    assert resp["statusCode"] == 200


def test_get_prescription_not_found(aws_resources):
    resp = get_prescription({"pathParameters": {"code": "XXXXXXXX"}, "requestContext": {}, "headers": {}}, None)
    assert resp["statusCode"] == 404


def test_post_referral_ok(aws_resources):
    resp = post_referral(_doctor_event(
        method="POST",
        path_params={"consultation_id": "c-open"},
        body={"target_facility_id": "fac-123", "reason": "Follow-up required"},
    ), None)
    assert resp["statusCode"] == 201
    assert len(json.loads(resp["body"])["code"]) == 8


def test_get_referral(aws_resources):
    create = post_referral(_doctor_event(
        method="POST",
        path_params={"consultation_id": "c-open"},
        body={"target_facility_id": "fac-456"},
    ), None)
    code = json.loads(create["body"])["code"]
    resp = get_referral({"pathParameters": {"code": code}, "requestContext": {}, "headers": {}}, None)
    assert resp["statusCode"] == 200

def test_prescription_code_uniqueness(aws_resources):
    """Multiple prescriptions get different codes."""
    codes = set()
    for i in range(5):
        resp = post_prescription(_doctor_event(
            method="POST",
            path_params={"consultation_id": "c-open"},
            body={"medication_details": f"Med {i}"},
        ), None)
        codes.add(json.loads(resp["body"])["code"])
    assert len(codes) == 5


# -- Phase 10: anonymous consultations are non-identifying to doctors ---------

_ANON_ID = "anon#" + "ab" * 32


def _seed_anonymous(triage_result_id=None):
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    now = int(time.time() * 1000)
    ddb.Table("test-doctor-consultations").put_item(Item={
        "consultation_id": "c-anon",
        "patient_id": _ANON_ID,
        "phone_owner_id": _ANON_ID,
        "on_behalf_member_id": None,
        "triage_result_id": triage_result_id,
        "complaint": "Fever and chills",
        "status": "paid",
        "urgency": "RED",
        "urgency_created": f"RED#{now}",
        "created_at": Decimal(now),
        "updated_at": Decimal(now),
    })
    ddb.Table("test-doctor-messages").put_item(Item={
        "consultation_id": "c-anon", "message_id": "m1", "sender_id": _ANON_ID,
        "sender_role": "patient", "content_type": "text", "text_body": "help",
        "created_at": Decimal(now),
    })
    ddb.Table("test-doctor-messages").put_item(Item={
        "consultation_id": "c-anon", "message_id": "m2", "sender_id": "doc1",
        "sender_role": "doctor", "content_type": "text", "text_body": "hello",
        "created_at": Decimal(now + 1),
    })


def test_get_queue_redacts_anonymous_patient(aws_resources):
    _seed_anonymous()
    resp = get_queue(_doctor_event(), None)
    assert resp["statusCode"] == 200
    assert "anon#" not in resp["body"]
    assert "ab" * 32 not in resp["body"]
    queue = {c["consultation_id"]: c for c in json.loads(resp["body"])["queue"]}
    anon = queue["c-anon"]
    assert anon["patient_id"] == "anonymous"
    assert anon["phone_owner_id"] == "anonymous"
    assert anon["is_anonymous"] is True
    assert anon["complaint"] == "Fever and chills"
    assert anon["urgency"] == "RED"
    # registered patients are untouched
    assert queue["c-paid"]["patient_id"] == "p1"
    assert "is_anonymous" not in queue["c-paid"]


def test_get_case_redacts_anonymous_patient_and_messages(aws_resources):
    _seed_anonymous()
    resp = get_case(_doctor_event(path_params={"consultation_id": "c-anon"}), None)
    assert resp["statusCode"] == 200
    assert "anon#" not in resp["body"]
    body = json.loads(resp["body"])
    c = body["consultation"]
    assert c["patient_id"] == "anonymous"
    assert c["phone_owner_id"] == "anonymous"
    assert c["is_anonymous"] is True
    assert c["complaint"] == "Fever and chills"
    for k in ("name", "phone", "patient_name", "phone_number"):
        assert k not in c
    senders = {m["message_id"]: m["sender_id"] for m in body["messages"]}
    assert senders == {"m1": "anonymous", "m2": "doc1"}


def test_get_case_strips_identity_fields_if_present(aws_resources):
    _seed_anonymous()
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    ddb.Table("test-doctor-consultations").update_item(
        Key={"consultation_id": "c-anon"},
        UpdateExpression="SET #n = :n, phone = :p, on_behalf_member_id = :m",
        ExpressionAttributeNames={"#n": "name"},
        ExpressionAttributeValues={":n": "Leaky Name", ":p": "+237600000000", ":m": "member-1"},
    )
    resp = get_case(_doctor_event(path_params={"consultation_id": "c-anon"}), None)
    assert "Leaky Name" not in resp["body"]
    assert "+237600000000" not in resp["body"]
    assert "member-1" not in resp["body"]


def test_get_case_anonymous_does_not_dereference_foreign_triage(aws_resources):
    # An anonymous caller can put any triage_result_id on their record; it must not
    # pull a registered user's triage result into the doctor's view of the anon case.
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    ddb.Table("test-doctor-triage").put_item(Item={
        "result_id": "tr-1", "user_id": "registered-user", "urgency": "GREEN"})
    _seed_anonymous(triage_result_id="tr-1")
    body = json.loads(get_case(_doctor_event(path_params={"consultation_id": "c-anon"}), None)["body"])
    assert body["triage_result"] is None
    assert body["consultation"]["urgency"] == "RED"
    assert "registered-user" not in json.dumps(body)


def test_get_case_registered_patient_unchanged(aws_resources):
    resp = get_case(_doctor_event(path_params={"consultation_id": "c-paid"}), None)
    c = json.loads(resp["body"])["consultation"]
    assert c["patient_id"] == "p1"
    assert "is_anonymous" not in c
