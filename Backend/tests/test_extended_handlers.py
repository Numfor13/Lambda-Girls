import base64, json, os, sys, time, pytest, boto3
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "health_track", "lambdas", "extended"))

_REGION = "us-east-1"
_TOPIC_ARN = f"arn:aws:sns:{_REGION}:123456789012:test-operator-alerts"
_TEST_ENV = {
    "APPOINTMENT_TABLE":     "test-appointments",
    "LAB_REQUEST_TABLE":     "test-lab-requests",
    "BLOOD_REQUEST_TABLE":   "test-blood-requests",
    "EMERGENCY_TABLE":       "test-emergencies",
    "HEALTH_TIP_TABLE":      "test-health-tips",
    "DOCTOR_PRESENCE_TABLE": "test-doctor-presence",
    "FACILITY_TABLE":        "test-facilities",
    "OPERATOR_TOPIC_ARN":    _TOPIC_ARN,
    "AWS_DEFAULT_REGION":    _REGION,
    "ENV_NAME":              "dev",
}
os.environ.update(_TEST_ENV)

from health_track.lambdas.extended.post_appointment import handler as post_appointment
from health_track.lambdas.extended.list_appointments import handler as list_appointments
from health_track.lambdas.extended.confirm_appointment import handler as confirm_appointment
from health_track.lambdas.extended.cancel_appointment import handler as cancel_appointment
from health_track.lambdas.extended.post_lab_request import handler as post_lab_request
from health_track.lambdas.extended.list_lab_requests import handler as list_lab_requests
from health_track.lambdas.extended.get_lab_request import handler as get_lab_request
from health_track.lambdas.extended.put_lab_request_status import handler as put_lab_request_status
from health_track.lambdas.extended.post_blood_request import handler as post_blood_request
from health_track.lambdas.extended.list_blood_requests import handler as list_blood_requests
from health_track.lambdas.extended.post_emergency import handler as post_emergency
from health_track.lambdas.extended.list_emergencies import handler as list_emergencies
from health_track.lambdas.extended.list_health_tips import handler as list_health_tips
from health_track.lambdas.extended.post_health_tip import handler as post_health_tip
from health_track.lambdas.extended.put_health_tip import handler as put_health_tip
from health_track.lambdas.extended.delete_health_tip import handler as delete_health_tip
from health_track.lambdas.extended.put_doctor_presence import handler as put_doctor_presence
from health_track.lambdas.extended.list_available_doctors import handler as list_available_doctors


def _event(sub="patient1", groups="Patient", body=None, path_params=None, query=None, raw_body=None):
    claims = {}
    if sub:
        claims["sub"] = sub
    if groups is not None:
        claims["cognito:groups"] = groups
    return {
        "requestContext": {"authorizer": {"claims": claims}},
        "body": raw_body if raw_body is not None else (json.dumps(body) if body is not None else None),
        "pathParameters": path_params or {},
        "queryStringParameters": query,
        "headers": {},
    }


def _public_event(query=None):
    return {"requestContext": {}, "body": None, "pathParameters": None,
            "queryStringParameters": query, "headers": {}}


def _body(resp):
    return json.loads(resp["body"])


def _gsi(name, hash_key, range_key):
    return {
        "IndexName": name,
        "KeySchema": [{"AttributeName": hash_key, "KeyType": "HASH"},
                      {"AttributeName": range_key, "KeyType": "RANGE"}],
        "Projection": {"ProjectionType": "ALL"},
    }


def _create(ddb, name, pk, attrs=(), gsis=()):
    defs = [{"AttributeName": pk, "AttributeType": "S"}]
    defs += [{"AttributeName": a, "AttributeType": t} for a, t in attrs]
    kwargs = {}
    if gsis:
        kwargs["GlobalSecondaryIndexes"] = list(gsis)
    ddb.create_table(
        TableName=name,
        KeySchema=[{"AttributeName": pk, "KeyType": "HASH"}],
        AttributeDefinitions=defs,
        BillingMode="PAY_PER_REQUEST",
        **kwargs,
    )


@pytest.fixture(autouse=True)
def aws_resources():
    os.environ.update(_TEST_ENV)
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name=_REGION)
        _create(ddb, "test-appointments", "appointment_id",
                [("patient_id", "S"), ("created_at", "N"), ("status", "S"), ("slot_date", "S")],
                [_gsi("PatientIndex", "patient_id", "created_at"),
                 _gsi("StatusIndex", "status", "slot_date")])
        _create(ddb, "test-lab-requests", "request_id",
                [("patient_id", "S"), ("created_at", "N")],
                [_gsi("PatientIndex", "patient_id", "created_at")])
        _create(ddb, "test-blood-requests", "request_id",
                [("status", "S"), ("created_at", "N")],
                [_gsi("StatusIndex", "status", "created_at")])
        _create(ddb, "test-emergencies", "emergency_id")
        _create(ddb, "test-health-tips", "tip_id",
                [("locale", "S"), ("published_date", "S")],
                [_gsi("LocaleIndex", "locale", "published_date")])
        _create(ddb, "test-doctor-presence", "doctor_id")
        _create(ddb, "test-facilities", "facility_id",
                [("primary_capability", "S")],
                [_gsi("CapabilityIndex", "primary_capability", "facility_id")])

        sns = boto3.client("sns", region_name=_REGION)
        sns.create_topic(Name="test-operator-alerts")
        yield


def _table(name):
    return boto3.resource("dynamodb", region_name=_REGION).Table(name)


def _future(days=3):
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


# ===========================================================================
# Appointments
# ===========================================================================

def _make_appointment(sub="patient1", **overrides):
    body = {"facility_id": "fac-1", "slot_date": _future(), "slot_label": "morning", "note": "checkup"}
    body.update(overrides)
    return post_appointment(_event(sub=sub, body=body), None)


def test_post_appointment_creates_requested():
    resp = _make_appointment()
    assert resp["statusCode"] == 201
    body = _body(resp)
    assert body["status"] == "requested"
    assert body["patient_id"] == "patient1"
    assert body["slot_label"] == "morning"
    stored = _table("test-appointments").get_item(Key={"appointment_id": body["appointment_id"]})["Item"]
    assert stored["facility_id"] == "fac-1"
    assert stored["note"] == "checkup"


def test_post_appointment_today_allowed():
    resp = _make_appointment(slot_date=datetime.now(timezone.utc).date().isoformat())
    assert resp["statusCode"] == 201


def test_post_appointment_rejects_past_date():
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    assert _make_appointment(slot_date=yesterday)["statusCode"] == 400


@pytest.mark.parametrize("override", [
    {"slot_date": "2030/01/01"}, {"slot_date": "not-a-date"}, {"slot_date": None},
    {"slot_label": "night"}, {"facility_id": ""},
])
def test_post_appointment_validation(override):
    assert _make_appointment(**override)["statusCode"] == 400


def test_post_appointment_bad_json():
    resp = post_appointment(_event(raw_body="{not json"), None)
    assert resp["statusCode"] == 400


def test_post_appointment_requires_auth():
    resp = post_appointment(_event(sub=None, body={}), None)
    assert resp["statusCode"] == 401


def test_list_appointments_own_only():
    _make_appointment(sub="patient1")
    _make_appointment(sub="patient1")
    _make_appointment(sub="patient2")
    resp = list_appointments(_event(sub="patient1"), None)
    assert resp["statusCode"] == 200
    items = _body(resp)["appointments"]
    assert len(items) == 2
    assert all(i["patient_id"] == "patient1" for i in items)


def test_list_appointments_admin_by_status():
    a1 = _body(_make_appointment(sub="patient1"))
    _make_appointment(sub="patient2")
    confirm_appointment(_event(sub="admin1", groups="Admin",
                               path_params={"appointment_id": a1["appointment_id"]}), None)
    resp = list_appointments(_event(sub="admin1", groups="Admin", query={"status": "requested"}), None)
    items = _body(resp)["appointments"]
    assert len(items) == 1
    assert items[0]["patient_id"] == "patient2"


def test_list_appointments_non_admin_status_filters_own():
    _make_appointment(sub="patient1")
    _make_appointment(sub="patient2")
    resp = list_appointments(_event(sub="patient1", query={"status": "requested"}), None)
    items = _body(resp)["appointments"]
    assert [i["patient_id"] for i in items] == ["patient1"]


def test_list_appointments_invalid_status():
    resp = list_appointments(_event(groups="Admin", query={"status": "bogus"}), None)
    assert resp["statusCode"] == 400


def test_confirm_appointment_admin_only():
    appt = _body(_make_appointment())
    pp = {"appointment_id": appt["appointment_id"]}
    assert confirm_appointment(_event(sub="patient1", path_params=pp), None)["statusCode"] == 403
    assert confirm_appointment(_event(sub=None, path_params=pp), None)["statusCode"] == 401
    resp = confirm_appointment(_event(sub="admin1", groups="Admin", path_params=pp), None)
    assert resp["statusCode"] == 200
    assert _body(resp)["status"] == "confirmed"


def test_confirm_appointment_conflict_and_missing():
    appt = _body(_make_appointment())
    pp = {"appointment_id": appt["appointment_id"]}
    confirm_appointment(_event(sub="admin1", groups="Admin", path_params=pp), None)
    assert confirm_appointment(_event(sub="admin1", groups="Admin", path_params=pp), None)["statusCode"] == 409
    missing = confirm_appointment(_event(sub="admin1", groups="Admin",
                                         path_params={"appointment_id": "nope"}), None)
    assert missing["statusCode"] == 404


def test_cancel_appointment_owner_and_idempotent():
    appt = _body(_make_appointment())
    pp = {"appointment_id": appt["appointment_id"]}
    resp = cancel_appointment(_event(sub="patient1", path_params=pp), None)
    assert resp["statusCode"] == 200
    assert _body(resp)["status"] == "cancelled"
    again = cancel_appointment(_event(sub="patient1", path_params=pp), None)
    assert again["statusCode"] == 200
    assert _body(again)["status"] == "cancelled"


def test_cancel_appointment_non_owner_gets_404():
    appt = _body(_make_appointment())
    pp = {"appointment_id": appt["appointment_id"]}
    resp = cancel_appointment(_event(sub="patient2", path_params=pp), None)
    assert resp["statusCode"] == 404
    stored = _table("test-appointments").get_item(Key=pp)["Item"]
    assert stored["status"] == "requested"


def test_cancel_appointment_admin_and_confirm_after_cancel_conflicts():
    appt = _body(_make_appointment())
    pp = {"appointment_id": appt["appointment_id"]}
    assert cancel_appointment(_event(sub="admin1", groups="Admin", path_params=pp), None)["statusCode"] == 200
    assert confirm_appointment(_event(sub="admin1", groups="Admin", path_params=pp), None)["statusCode"] == 409


def test_cancel_appointment_requires_auth():
    assert cancel_appointment(_event(sub=None, path_params={"appointment_id": "x"}), None)["statusCode"] == 401


# ===========================================================================
# Lab requests
# ===========================================================================

def _make_lab(sub="patient1", **overrides):
    body = {"test_type": "malaria_rdt", "facility_id": "fac-1",
            "collection_address": "Molyko, Buea", "payment_id": "pay-1"}
    body.update(overrides)
    return post_lab_request(_event(sub=sub, body=body), None)


def _set_status(request_id, status, groups="Operator", **extra):
    return put_lab_request_status(_event(sub="op1", groups=groups,
                                         path_params={"request_id": request_id},
                                         body={"status": status, **extra}), None)


def test_post_lab_request_creates_requested():
    resp = _make_lab()
    assert resp["statusCode"] == 201
    body = _body(resp)
    assert body["status"] == "requested"
    assert body["patient_id"] == "patient1"
    assert body["payment_id"] == "pay-1"


def test_post_lab_request_validation():
    assert _make_lab(test_type="")["statusCode"] == 400
    assert _make_lab(facility_id=None)["statusCode"] == 400
    assert post_lab_request(_event(raw_body="[1,2]"), None)["statusCode"] == 400
    assert post_lab_request(_event(sub=None, body={}), None)["statusCode"] == 401


def test_list_lab_requests_own_only():
    _make_lab(sub="patient1")
    _make_lab(sub="patient2")
    items = _body(list_lab_requests(_event(sub="patient1"), None))["lab_requests"]
    assert len(items) == 1 and items[0]["patient_id"] == "patient1"


def test_get_lab_request_visibility():
    req = _body(_make_lab(sub="patient1"))
    pp = {"request_id": req["request_id"]}
    assert get_lab_request(_event(sub="patient1", path_params=pp), None)["statusCode"] == 200
    assert get_lab_request(_event(sub="patient2", path_params=pp), None)["statusCode"] == 404
    assert get_lab_request(_event(sub="op1", groups="Operator", path_params=pp), None)["statusCode"] == 200
    assert get_lab_request(_event(sub="ad1", groups="Admin", path_params=pp), None)["statusCode"] == 200
    assert get_lab_request(_event(sub="patient1", path_params={"request_id": "nope"}), None)["statusCode"] == 404
    assert get_lab_request(_event(sub=None, path_params=pp), None)["statusCode"] == 401


def test_lab_status_forward_transitions():
    rid = _body(_make_lab())["request_id"]
    assert _set_status(rid, "sample_collected")["statusCode"] == 200
    resp = _set_status(rid, "results_ready", groups="Admin", result_summary="Negative for malaria")
    assert resp["statusCode"] == 200
    assert _body(resp)["result_summary"] == "Negative for malaria"
    resp = _set_status(rid, "delivered")
    assert resp["statusCode"] == 200
    assert _body(resp)["status"] == "delivered"


def test_lab_status_illegal_transitions_409():
    rid = _body(_make_lab())["request_id"]
    assert _set_status(rid, "results_ready")["statusCode"] == 409   # skips sample_collected
    assert _set_status(rid, "requested")["statusCode"] == 409       # not forward
    _set_status(rid, "sample_collected")
    assert _set_status(rid, "sample_collected")["statusCode"] == 409


def test_lab_status_result_summary_only_on_results_ready():
    rid = _body(_make_lab())["request_id"]
    assert _set_status(rid, "sample_collected", result_summary="early")["statusCode"] == 400
    stored = _table("test-lab-requests").get_item(Key={"request_id": rid})["Item"]
    assert stored["status"] == "requested"


def test_lab_status_validation_and_auth():
    rid = _body(_make_lab())["request_id"]
    assert _set_status(rid, "bogus")["statusCode"] == 400
    assert _set_status(rid, "sample_collected", groups="Patient")["statusCode"] == 403
    resp = put_lab_request_status(_event(sub=None, path_params={"request_id": rid},
                                         body={"status": "sample_collected"}), None)
    assert resp["statusCode"] == 401
    assert _set_status("missing", "sample_collected")["statusCode"] == 404


# ===========================================================================
# Blood requests
# ===========================================================================

def _blood_body(**overrides):
    body = {"requesting_facility_id": "fac-1", "blood_type": "O-", "units": 2, "urgency": "RED"}
    body.update(overrides)
    return body


def _seed_facilities():
    t = _table("test-facilities")
    t.put_item(Item={"facility_id": "bb-1", "name": "Buea Blood Bank", "phone": "+237600000001",
                     "primary_capability": "blood_bank", "region": "SW"})
    t.put_item(Item={"facility_id": "gen-1", "name": "General Clinic", "phone": "+237600000002",
                     "primary_capability": "general"})


def test_post_blood_request_routes_to_operator_queue():
    _seed_facilities()
    resp = post_blood_request(_event(sub="doc1", groups="Doctor", body=_blood_body()), None)
    assert resp["statusCode"] == 201
    body = _body(resp)
    assert body["status"] == "pending"
    assert body["units"] == 2
    assert body["blood_bank_facilities"] == [
        {"facility_id": "bb-1", "name": "Buea Blood Bank", "phone": "+237600000001"}
    ]
    # Operator sees it in the queue
    listed = _body(list_blood_requests(_event(sub="op1", groups="Operator"), None))
    assert [r["request_id"] for r in listed["blood_requests"]] == [body["request_id"]]


def test_post_blood_request_facility_lookup_failure_is_best_effort(monkeypatch):
    monkeypatch.setenv("FACILITY_TABLE", "does-not-exist")
    resp = post_blood_request(_event(body=_blood_body()), None)
    assert resp["statusCode"] == 201
    assert _body(resp)["blood_bank_facilities"] == []


@pytest.mark.parametrize("override", [
    {"blood_type": "C+"}, {"units": 0}, {"units": 21}, {"units": "2"}, {"units": True},
    {"units": 2.5}, {"urgency": "LOW"}, {"requesting_facility_id": ""},
])
def test_post_blood_request_validation(override):
    resp = post_blood_request(_event(body=_blood_body(**override)), None)
    assert resp["statusCode"] == 400


def test_post_blood_request_requires_auth():
    assert post_blood_request(_event(sub=None, body=_blood_body()), None)["statusCode"] == 401


def test_list_blood_requests_operator_only_and_ordering():
    t = _table("test-blood-requests")
    now = int(time.time() * 1000)
    t.put_item(Item={"request_id": "g-old", "status": "pending", "urgency": "GREEN", "created_at": now - 3000})
    t.put_item(Item={"request_id": "r-new", "status": "pending", "urgency": "RED", "created_at": now - 1000})
    t.put_item(Item={"request_id": "r-old", "status": "pending", "urgency": "RED", "created_at": now - 2000})
    t.put_item(Item={"request_id": "a-1", "status": "pending", "urgency": "AMBER", "created_at": now - 500})
    t.put_item(Item={"request_id": "done", "status": "fulfilled", "urgency": "RED", "created_at": now - 9000})
    resp = list_blood_requests(_event(sub="op1", groups="Operator"), None)
    assert resp["statusCode"] == 200
    ids = [r["request_id"] for r in _body(resp)["blood_requests"]]
    assert ids == ["r-old", "r-new", "a-1", "g-old"]
    assert list_blood_requests(_event(sub="ad1", groups="Admin"), None)["statusCode"] == 403
    assert list_blood_requests(_event(sub=None), None)["statusCode"] == 401


# ===========================================================================
# Emergency
# ===========================================================================

def _subscribe_queue():
    sqs = boto3.client("sqs", region_name=_REGION)
    url = sqs.create_queue(QueueName="op-alerts")["QueueUrl"]
    arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    boto3.client("sns", region_name=_REGION).subscribe(TopicArn=_TOPIC_ARN, Protocol="sqs", Endpoint=arn)
    return sqs, url


def test_post_emergency_writes_record_and_publishes_sns():
    sqs, url = _subscribe_queue()
    before = int(time.time())
    resp = post_emergency(_event(sub="patient1", body={
        "latitude": 4.1527, "longitude": 9.2410, "triage_result_id": "tri-1"}), None)
    assert resp["statusCode"] == 201
    body = _body(resp)
    assert body["alert_sent"] is True
    stored = _table("test-emergencies").get_item(Key={"emergency_id": body["emergency_id"]})["Item"]
    assert stored["user_id"] == "patient1"
    assert stored["latitude"] == Decimal("4.1527")
    assert stored["longitude"] == Decimal("9.241")
    assert stored["triage_result_id"] == "tri-1"
    assert before + 86400 <= int(stored["ttl"]) <= int(time.time()) + 86400
    assert "timestamp" in stored

    msgs = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10).get("Messages", [])
    assert len(msgs) == 1
    envelope = json.loads(msgs[0]["Body"])
    payload = json.loads(envelope["Message"])
    assert payload["emergency_id"] == body["emergency_id"]
    assert payload["user_id"] == "patient1"
    assert payload["latitude"] == 4.1527


def test_post_emergency_publish_failure_still_201(monkeypatch):
    monkeypatch.setenv("OPERATOR_TOPIC_ARN", f"arn:aws:sns:{_REGION}:123456789012:missing-topic")
    resp = post_emergency(_event(body={"latitude": 1, "longitude": 2}), None)
    assert resp["statusCode"] == 201
    body = _body(resp)
    assert body["alert_sent"] is False
    assert _table("test-emergencies").get_item(Key={"emergency_id": body["emergency_id"]}).get("Item")


@pytest.mark.parametrize("payload", [
    {"latitude": 91, "longitude": 0}, {"latitude": -91, "longitude": 0},
    {"latitude": 0, "longitude": 181}, {"latitude": 0, "longitude": -180.5},
    {"latitude": "4", "longitude": 9}, {"latitude": True, "longitude": 9}, {"longitude": 9},
    {"latitude": 4, "longitude": 9, "triage_result_id": 5},
])
def test_post_emergency_validation(payload):
    assert post_emergency(_event(body=payload), None)["statusCode"] == 400


def test_post_emergency_requires_auth():
    assert post_emergency(_event(sub=None, body={"latitude": 1, "longitude": 1}), None)["statusCode"] == 401


def test_list_emergencies_operator_only_drops_expired_newest_first():
    t = _table("test-emergencies")
    now_s = int(time.time())
    t.put_item(Item={"emergency_id": "old", "user_id": "u", "timestamp": now_s * 1000 - 5000, "ttl": now_s + 100})
    t.put_item(Item={"emergency_id": "new", "user_id": "u", "timestamp": now_s * 1000 - 1000, "ttl": now_s + 100})
    t.put_item(Item={"emergency_id": "expired", "user_id": "u", "timestamp": now_s * 1000, "ttl": now_s - 1})
    resp = list_emergencies(_event(sub="op1", groups="Operator"), None)
    assert resp["statusCode"] == 200
    assert [e["emergency_id"] for e in _body(resp)["emergencies"]] == ["new", "old"]
    assert list_emergencies(_event(sub="p1", groups="Patient"), None)["statusCode"] == 403
    assert list_emergencies(_event(sub=None), None)["statusCode"] == 401


# ===========================================================================
# Health tips
# ===========================================================================

def _tip_body(**overrides):
    body = {"title": "Sleep under a net", "body": "Use treated mosquito nets every night.",
            "source_name": "WHO", "source_url": "https://who.int/malaria",
            "published_date": "2026-01-15", "locale": "en", "tags": ["malaria", "prevention"]}
    body.update(overrides)
    return body


def _admin_post_tip(**overrides):
    return post_health_tip(_event(sub="ad1", groups="Admin", body=_tip_body(**overrides)), None)


def _seed_tip(tip_id, locale="en", date="2026-01-01", tags=("general",), active=True):
    _table("test-health-tips").put_item(Item={
        "tip_id": tip_id, "title": tip_id, "body": "b", "source_name": "WHO",
        "published_date": date, "locale": locale, "tags": list(tags), "is_active": active,
    })


def test_post_health_tip_admin_creates_active_tip():
    resp = _admin_post_tip()
    assert resp["statusCode"] == 201
    body = _body(resp)
    assert body["is_active"] is True
    assert body["source_name"] == "WHO"
    assert body["tip_id"]


@pytest.mark.parametrize("override", [
    {"source_name": None}, {"source_name": "  "}, {"published_date": None},
    {"published_date": "15/01/2026"}, {"published_date": ""}, {"locale": "de"},
    {"tags": "malaria"}, {"tags": ["ok", 3]}, {"title": ""}, {"body": None},
])
def test_post_health_tip_validation(override):
    assert _admin_post_tip(**override)["statusCode"] == 400


def test_post_health_tip_admin_only():
    resp = post_health_tip(_event(sub="op1", groups="Operator", body=_tip_body()), None)
    assert resp["statusCode"] == 403
    assert post_health_tip(_event(sub=None, body=_tip_body()), None)["statusCode"] == 401


def test_list_health_tips_public_hides_inactive():
    _seed_tip("t1")
    _seed_tip("t2", active=False)
    resp = list_health_tips(_public_event(), None)
    assert resp["statusCode"] == 200
    assert [t["tip_id"] for t in _body(resp)["tips"]] == ["t1"]


def test_list_health_tips_locale_filter_newest_first():
    _seed_tip("en-old", date="2026-01-01")
    _seed_tip("en-new", date="2026-03-01")
    _seed_tip("fr-1", locale="fr", date="2026-02-01")
    resp = list_health_tips(_public_event({"locale": "en"}), None)
    assert [t["tip_id"] for t in _body(resp)["tips"]] == ["en-new", "en-old"]


def test_list_health_tips_tag_filter():
    _seed_tip("m1", tags=["malaria"])
    _seed_tip("c1", tags=["cholera"])
    _seed_tip("m2", locale="fr", tags=["malaria", "water"])
    resp = list_health_tips(_public_event({"tag": "malaria"}), None)
    assert sorted(t["tip_id"] for t in _body(resp)["tips"]) == ["m1", "m2"]
    resp = list_health_tips(_public_event({"tag": "malaria", "locale": "fr"}), None)
    assert [t["tip_id"] for t in _body(resp)["tips"]] == ["m2"]


def test_list_health_tips_pagination_with_filters():
    # 10 English tips (newest = t09): t09/t03 off-tag, t04 inactive; page with limit=2.
    # The newest page starts with a non-match followed by a run of matches, which would
    # overshoot the page size if the handler kept asking DynamoDB for a full page.
    off_tag, inactive = {9, 3}, {4}
    for i in range(10):
        _seed_tip(f"t{i:02d}", date=f"2026-01-{i + 1:02d}",
                  tags=["other"] if i in off_tag else ["malaria"], active=(i not in inactive))
    expected = [f"t{i:02d}" for i in reversed(range(10)) if i not in off_tag | inactive]
    seen, token, pages = [], None, 0
    while True:
        q = {"locale": "en", "tag": "malaria", "limit": "2"}
        if token:
            q["next_token"] = token
        body = _body(list_health_tips(_public_event(q), None))
        assert len(body["tips"]) <= 2
        seen += [t["tip_id"] for t in body["tips"]]
        token = body.get("next_token")
        pages += 1
        if not token:
            break
        assert pages < 20
    assert seen == expected


def test_list_health_tips_pagination_without_locale():
    for i in range(25):
        _seed_tip(f"p{i:02d}", date=f"2026-02-{i + 1:02d}")
    first = _body(list_health_tips(_public_event(), None))
    assert len(first["tips"]) == 20
    assert first["next_token"]
    second = _body(list_health_tips(_public_event({"next_token": first["next_token"]}), None))
    ids = {t["tip_id"] for t in first["tips"]} | {t["tip_id"] for t in second["tips"]}
    assert len(ids) == 25
    assert not second.get("next_token")


@pytest.mark.parametrize("query", [
    {"limit": "0"}, {"limit": "51"}, {"limit": "abc"}, {"locale": "de"}, {"next_token": "%%%"},
    {"next_token": base64.urlsafe_b64encode(b"[1]").decode()},
])
def test_list_health_tips_bad_query(query):
    assert list_health_tips(_public_event(query), None)["statusCode"] == 400


def test_put_health_tip_updates_and_validates():
    tip = _body(_admin_post_tip())
    pp = {"tip_id": tip["tip_id"]}
    resp = put_health_tip(_event(sub="ad1", groups="Admin", path_params=pp,
                                 body={"title": "New title", "is_active": False}), None)
    assert resp["statusCode"] == 200
    assert _body(resp)["title"] == "New title"
    assert _body(resp)["is_active"] is False
    assert _body(resp)["source_name"] == "WHO"
    bad = put_health_tip(_event(sub="ad1", groups="Admin", path_params=pp, body={"source_name": ""}), None)
    assert bad["statusCode"] == 400
    bad = put_health_tip(_event(sub="ad1", groups="Admin", path_params=pp, body={"published_date": "x"}), None)
    assert bad["statusCode"] == 400
    empty = put_health_tip(_event(sub="ad1", groups="Admin", path_params=pp, body={}), None)
    assert empty["statusCode"] == 400
    missing = put_health_tip(_event(sub="ad1", groups="Admin", path_params={"tip_id": "nope"},
                                    body={"title": "x"}), None)
    assert missing["statusCode"] == 404
    forbidden = put_health_tip(_event(sub="p1", groups="Patient", path_params=pp, body={"title": "x"}), None)
    assert forbidden["statusCode"] == 403


def test_delete_health_tip():
    tip = _body(_admin_post_tip())
    pp = {"tip_id": tip["tip_id"]}
    assert delete_health_tip(_event(sub="p1", groups="Patient", path_params=pp), None)["statusCode"] == 403
    assert delete_health_tip(_event(sub=None, path_params=pp), None)["statusCode"] == 401
    assert delete_health_tip(_event(sub="ad1", groups="Admin", path_params=pp), None)["statusCode"] == 200
    assert "Item" not in _table("test-health-tips").get_item(Key=pp)
    assert delete_health_tip(_event(sub="ad1", groups="Admin", path_params=pp), None)["statusCode"] == 404


# ===========================================================================
# Doctor presence
# ===========================================================================

def _heartbeat(sub, body=None, groups="Doctor"):
    return put_doctor_presence(_event(sub=sub, groups=groups, body=body), None)


def test_presence_heartbeat_defaults_and_updates():
    resp = _heartbeat("doc1", {"specialty": "pediatrics"})
    assert resp["statusCode"] == 200
    body = _body(resp)
    assert body["doctor_id"] == "doc1"
    assert body["typical_response_minutes"] == 30
    assert body["is_online"] is True
    stored = _table("test-doctor-presence").get_item(Key={"doctor_id": "doc1"})["Item"]
    assert abs(int(stored["last_seen"]) - int(time.time() * 1000)) < 5000
    assert "is_online" not in stored

    _heartbeat("doc1", {"typical_response_minutes": 10})
    _heartbeat("doc1")  # plain heartbeat keeps previous values
    stored = _table("test-doctor-presence").get_item(Key={"doctor_id": "doc1"})["Item"]
    assert stored["typical_response_minutes"] == 10
    assert stored["specialty"] == "pediatrics"


@pytest.mark.parametrize("body", [
    {"typical_response_minutes": -1}, {"typical_response_minutes": "5"},
    {"typical_response_minutes": True}, {"specialty": ""}, {"specialty": 7},
])
def test_presence_validation(body):
    assert _heartbeat("doc1", body)["statusCode"] == 400


def test_presence_doctor_only():
    assert _heartbeat("p1", groups="Patient")["statusCode"] == 403
    assert _heartbeat(None)["statusCode"] == 401


def test_available_doctors_sorted_and_stale_excluded():
    _heartbeat("slow", {"specialty": "gp", "typical_response_minutes": 45})
    _heartbeat("fast", {"specialty": "gp", "typical_response_minutes": 5})
    _heartbeat("default")
    _table("test-doctor-presence").put_item(Item={
        "doctor_id": "stale", "specialty": "gp", "typical_response_minutes": 1,
        "last_seen": int(time.time() * 1000) - 301_000,
    })
    resp = list_available_doctors(_event(sub="p1"), None)
    assert resp["statusCode"] == 200
    doctors = _body(resp)["doctors"]
    assert [d["doctor_id"] for d in doctors] == ["fast", "default", "slow"]
    assert all(d["is_online"] is True for d in doctors)


def test_available_doctors_requires_auth():
    assert list_available_doctors(_event(sub=None), None)["statusCode"] == 401
