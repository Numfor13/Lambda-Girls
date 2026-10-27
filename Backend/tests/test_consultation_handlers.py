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
    "PROFILE_TABLE":      "test-profiles",
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
from health_track.lambdas.consultation.get_voice_note_upload_url import handler as get_upload_url


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
    _saved = {k: os.environ.get(k) for k in ("CONSULTATION_TABLE", "MESSAGE_TABLE", "TRIAGE_TABLE", "PROFILE_TABLE", "VOICE_NOTES_BUCKET")}
    os.environ["CONSULTATION_TABLE"] = "test-consultations"
    os.environ["MESSAGE_TABLE"] = "test-messages"
    os.environ["TRIAGE_TABLE"] = "test-triage-sync"
    os.environ["PROFILE_TABLE"] = "test-profiles"
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

        # TriageTable: partition key result_id only
        ddb.create_table(
            TableName="test-triage-sync",
            KeySchema=[{"AttributeName": "result_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "result_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        ddb.create_table(
            TableName="test-profiles",
            KeySchema=[{"AttributeName": "user_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "user_id", "AttributeType": "S"}],
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


# -- Authorization: who may write into a consultation --------------------------

def _consultation(owner, **extra):
    cid = json.loads(post_consultation(_event(owner, body={"complaint": "x"}), None)["body"])["consultation_id"]
    if extra:
        boto3.resource("dynamodb", region_name="us-east-1").Table("test-consultations").update_item(
            Key={"consultation_id": cid},
            UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in extra),
            ExpressionAttributeNames={f"#{k}": k for k in extra},
            ExpressionAttributeValues={f":{k}": v for k, v in extra.items()},
        )
    return cid


def _msg(sub, cid, groups="Patient", **body):
    body.setdefault("content_type", "text")
    body.setdefault("text_body", "hi")
    return post_message(_event(sub, body=body, path_params={"consultation_id": cid}, groups=groups), None)


def test_post_message_other_patient_forbidden(aws_tables):
    cid = _consultation("patient-a")
    assert _msg("patient-b", cid)["statusCode"] == 403


def test_post_message_body_sender_role_ignored(aws_tables):
    cid = _consultation("patient-a")
    resp = _msg("patient-a", cid, sender_role="doctor")
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["sender_role"] == "patient"


def test_post_message_unassigned_doctor_forbidden(aws_tables):
    cid = _consultation("patient-a", status="open", doctor_id="doc1")
    assert _msg("doc2", cid, groups="Doctor")["statusCode"] == 403


def test_post_message_assigned_doctor_ok_and_requires_open(aws_tables):
    cid = _consultation("patient-a", status="open", doctor_id="doc1")
    resp = _msg("doc1", cid, groups="Doctor")
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["sender_role"] == "doctor"
    cid2 = _consultation("patient-a", status="closed", doctor_id="doc1")
    assert _msg("doc1", cid2, groups="Doctor")["statusCode"] == 409


def test_post_message_cross_consultation_voice_key_rejected(aws_tables):
    cid = _consultation("patient-a")
    other = _consultation("patient-a")
    resp = _msg("patient-a", cid, content_type="voice_note",
                voice_note_key=f"voice-notes/{other}/x.opus")
    assert resp["statusCode"] == 400


def test_post_message_text_too_long(aws_tables):
    cid = _consultation("patient-a")
    assert _msg("patient-a", cid, text_body="a" * 4001)["statusCode"] == 400


def test_post_message_reused_client_id_from_other_user_not_leaked(aws_tables):
    cid_a = _consultation("patient-a")
    _msg("patient-a", cid_a, text_body="secret", client_message_id="cm-1")
    cid_b = _consultation("patient-b")
    resp = _msg("patient-b", cid_b, client_message_id="cm-1")
    assert resp["statusCode"] == 409
    assert "secret" not in resp["body"]


def test_post_sync_message_other_consultation_and_role(aws_tables):
    cid = _consultation("patient-a")
    msgs = [
        {"consultation_id": cid, "client_message_id": "s1", "text_body": "x", "sender_role": "doctor"},
    ]
    body = json.loads(post_sync(_event("patient-a", body={"messages": msgs}), None)["body"])
    assert body["results"]["messages"][0]["status"] == "ok"
    stored = boto3.resource("dynamodb", region_name="us-east-1").Table("test-messages").get_item(
        Key={"consultation_id": cid, "message_id": "s1"})["Item"]
    assert stored["sender_role"] == "patient"

    # patient B cannot write into A's consultation; a foreign voice key is rejected
    msgs = [{"consultation_id": cid, "client_message_id": "s2", "text_body": "x"}]
    body = json.loads(post_sync(_event("patient-b", body={"messages": msgs}), None)["body"])
    assert body["results"]["messages"][0] == {"message_id": None, "status": "error"}
    msgs = [{"consultation_id": cid, "client_message_id": "s3", "voice_note_key": "voice-notes/other/x.opus"}]
    body = json.loads(post_sync(_event("patient-a", body={"messages": msgs}), None)["body"])
    assert body["results"]["messages"][0]["status"] == "error"


def test_post_sync_triage_conflict_and_idempotent(aws_tables):
    tr = {"result_id": "tr-x", "symptom_payload": {"symptoms": [], "age_months": 30}}

    def status(sub):
        resp = post_sync(_event(sub, body={"triage_results": [tr]}), None)
        return json.loads(resp["body"])["results"]["triage_results"][0]["status"]

    assert status("u1") == "ok"
    assert status("u1") == "ok"
    assert status("u2") == "conflict"
    item = boto3.resource("dynamodb", region_name="us-east-1").Table("test-triage-sync").get_item(
        Key={"result_id": "tr-x"})["Item"]
    assert item["user_id"] == "u1"


def test_post_sync_triage_bad_payload_is_error_not_500(aws_tables):
    trs = [{"result_id": "a", "symptom_payload": "nope"},
           {"result_id": "b", "symptom_payload": {"symptoms": [], "age_months": "12"}},
           {"result_id": "c", "symptom_payload": {"symptoms": [], "age_months": None}},
           {"result_id": "d", "symptom_payload": {"symptoms": [], "age_months": 1.5, "vitals": {"temp_c": 38.5}}}]
    resp = post_sync(_event("u1", body={"triage_results": trs}), None)
    assert resp["statusCode"] == 200
    statuses = [r["status"] for r in json.loads(resp["body"])["results"]["triage_results"]]
    assert statuses == ["error", "error", "ok", "ok"]


def test_post_sync_batch_cap(aws_tables):
    msgs = [{"consultation_id": "c", "text_body": "x"}] * 51
    assert post_sync(_event("u1", body={"messages": msgs}), None)["statusCode"] == 400


def test_voice_upload_url_requires_writer(aws_tables):
    cid = _consultation("patient-a")
    assert get_upload_url(_event("patient-b", path_params={"consultation_id": cid}), None)["statusCode"] == 403
    resp = get_upload_url(_event("patient-a", path_params={"consultation_id": cid}), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["voice_note_key"].startswith(f"voice-notes/{cid}/")
    assert "X-Amz-Signature" in body["upload_url"]  # SigV4


# -- post_consultation derives patient_id and urgency server-side ---------------

def _put_triage(result_id, user_id, urgency):
    boto3.resource("dynamodb", region_name="us-east-1").Table("test-triage-sync").put_item(
        Item={"result_id": result_id, "user_id": user_id, "urgency": urgency})


def test_post_consultation_ignores_body_patient_id_and_urgency(aws_tables):
    resp = post_consultation(_event("u1", body={
        "complaint": "x", "patient_id": "victim", "urgency": "RED"}), None)
    body = json.loads(resp["body"])
    assert body["patient_id"] == "u1"
    assert body["urgency"] is None
    assert body["urgency_created"].startswith("GREEN#")


def test_post_consultation_takes_urgency_from_own_triage(aws_tables):
    _put_triage("tr-own", "u1", "AMBER")
    resp = post_consultation(_event("u1", body={
        "complaint": "x", "triage_result_id": "tr-own", "urgency": "RED"}), None)
    assert resp["statusCode"] == 201
    body = json.loads(resp["body"])
    assert body["urgency"] == "AMBER"
    assert body["urgency_created"].startswith("AMBER#")


def test_post_consultation_rejects_other_users_triage(aws_tables):
    _put_triage("tr-other", "u2", "RED")
    resp = post_consultation(_event("u1", body={"complaint": "x", "triage_result_id": "tr-other"}), None)
    assert resp["statusCode"] == 400
    resp = post_consultation(_event("u1", body={"complaint": "x", "triage_result_id": "missing"}), None)
    assert resp["statusCode"] == 400


def test_post_consultation_on_behalf_member(aws_tables):
    boto3.resource("dynamodb", region_name="us-east-1").Table("test-profiles").put_item(
        Item={"user_id": "u1", "on_behalf_profiles": [{"member_id": "m1", "name": "Kid"}]})
    resp = post_consultation(_event("u1", body={"complaint": "x", "on_behalf_member_id": "m1"}), None)
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["patient_id"] == "u1#m1"
    resp = post_consultation(_event("u1", body={"complaint": "x", "on_behalf_member_id": "m9"}), None)
    assert resp["statusCode"] == 400
    resp = post_consultation(_event("u2", body={"complaint": "x", "on_behalf_member_id": "m1"}), None)
    assert resp["statusCode"] == 400
