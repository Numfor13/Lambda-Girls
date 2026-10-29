import json, os, sys, uuid
import boto3, pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "health_track", "lambdas", "doctor_application"))

_REGION = "us-east-1"
_BUCKET = "test-doctor-documents"
_TEST_ENV = {
    "APPLICATION_TABLE": "test-doctor-applications",
    "PROFILE_TABLE":     "test-da-profiles",
    "DOCUMENTS_BUCKET":  _BUCKET,
    "AWS_DEFAULT_REGION": _REGION,
    "ENV_NAME":          "dev",
}
_saved = {k: os.environ.get(k) for k in _TEST_ENV}
os.environ.update(_TEST_ENV)  # import-time only; the fixture sets (and restores) the env per test

from health_track.lambdas.doctor_application.post_uploads import handler as post_uploads
from health_track.lambdas.doctor_application.post_application import handler as post_application
from health_track.lambdas.doctor_application.get_application_status import handler as get_status
from health_track.lambdas.doctor_application.list_applications import handler as list_applications
from health_track.lambdas.doctor_application.get_application import handler as get_application
from health_track.lambdas.doctor_application.put_application import handler as put_application
from health_track.lambdas.doctor_application.approve_application import handler as approve
from health_track.lambdas.doctor_application.reject_application import handler as reject
from health_track.lambdas.doctor_application.resend_invite import handler as resend_invite

for _k, _v in _saved.items():  # don't leak PROFILE_TABLE etc. into other test modules
    if _v is None:
        os.environ.pop(_k, None)
    else:
        os.environ[_k] = _v

PDF, JPEG, PNG = b"%PDF-1.7\n...", b"\xff\xd8\xff\xe0\x00\x10JFIF", b"\x89PNG\r\n\x1a\n...."
DOCS = {
    "onmc_certificate": ("application/pdf", PDF),
    "onmc_card": ("image/jpeg", JPEG),
    "medical_degree": ("application/pdf", PDF),
    "identity_document": ("image/png", PNG),
    "selfie_with_ids": ("image/jpeg", JPEG),
}
ALL_CHECKS = {"onmc_register_verified": True, "documents_consistent": True, "selfie_matches": True}


def _event(body=None, path=None, query=None, groups=None, sub="admin-1"):
    claims = {"sub": sub, "cognito:groups": groups} if groups else {}
    return {"requestContext": {"authorizer": {"claims": claims}}, "headers": {},
            "body": json.dumps(body) if body is not None else None,
            "pathParameters": path or {}, "queryStringParameters": query}


def _admin(**kw):
    return _event(groups="Admin", **kw)


def _body(resp):
    return json.loads(resp["body"])


def _gsi(name, pk, sk=None):
    schema = [{"AttributeName": pk, "KeyType": "HASH"}]
    if sk:
        schema.append({"AttributeName": sk, "KeyType": "RANGE"})
    return {"IndexName": name, "KeySchema": schema, "Projection": {"ProjectionType": "ALL"}}


@pytest.fixture(autouse=True)
def aws(monkeypatch):
    for k, v in _TEST_ENV.items():
        monkeypatch.setenv(k, v)
    with mock_aws():
        ddb = boto3.client("dynamodb", region_name=_REGION)
        ddb.create_table(
            TableName=_TEST_ENV["APPLICATION_TABLE"], BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "application_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": a, "AttributeType": t} for a, t in
                                  [("application_id", "S"), ("status", "S"), ("submitted_at", "N"),
                                   ("email", "S"), ("onmc_number", "S")]],
            GlobalSecondaryIndexes=[_gsi("StatusIndex", "status", "submitted_at"), _gsi("EmailIndex", "email"),
                                    _gsi("OnmcIndex", "onmc_number")],
        )
        ddb.create_table(
            TableName=_TEST_ENV["PROFILE_TABLE"], BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "user_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "user_id", "AttributeType": "S"}],
        )
        boto3.client("s3", region_name=_REGION).create_bucket(Bucket=_BUCKET)
        idp = boto3.client("cognito-idp", region_name=_REGION)
        pool_id = idp.create_user_pool(PoolName="staff")["UserPool"]["Id"]
        idp.create_group(GroupName="Doctor", UserPoolId=pool_id)
        topic = boto3.client("sns", region_name=_REGION).create_topic(Name="reviewers")["TopicArn"]
        monkeypatch.setenv("STAFF_USER_POOL_ID", pool_id)
        monkeypatch.setenv("REVIEWER_TOPIC_ARN", topic)
        yield


def _s3():
    return boto3.client("s3", region_name=_REGION)


def _table():
    return boto3.resource("dynamodb", region_name=_REGION).Table(_TEST_ENV["APPLICATION_TABLE"])


def _upload(app_id, docs=DOCS):
    for doc, (content_type, data) in docs.items():
        _s3().put_object(Bucket=_BUCKET, Key=f"drafts/{app_id}/{doc}", Body=data, ContentType=content_type)


def _fields(app_id, **overrides):
    body = {
        "application_id": app_id,
        "full_name": "Dr Ambe Tanyi",
        "email": "Ambe.Tanyi@example.org",
        "phone": "+237677000001",
        "specialty": "pediatrics",
        "onmc_number": "12345/2019",
        "medical_school": "University of Buea",
        "graduation_year": 2018,
        "identity_document_type": "cni",
        "identity_document_number": "CM123456",
    }
    body.update(overrides)
    return body


def _submit(**overrides):
    app_id = str(uuid.uuid4())
    _upload(app_id)
    resp = post_application(_event(body=_fields(app_id, **overrides)), None)
    return app_id, resp


def _reviewed(**overrides):
    app_id, _ = _submit(**overrides)
    put_application(_admin(path={"application_id": app_id}, body={"checks": ALL_CHECKS}), None)
    return app_id


# -- Uploads ------------------------------------------------------------------

def test_uploads_returns_presigned_post_for_all_five():
    resp = post_uploads(_event(body={"documents": {d: ct for d, (ct, _) in DOCS.items()}}), None)
    assert resp["statusCode"] == 201
    body = _body(resp)
    uuid.UUID(body["application_id"])
    assert body["expires_in"] == 900
    assert set(body["uploads"]) == set(DOCS)
    selfie = body["uploads"]["selfie_with_ids"]
    assert selfie["fields"]["key"] == f"drafts/{body['application_id']}/selfie_with_ids"
    assert selfie["fields"]["Content-Type"] == "image/jpeg"
    assert "url" in selfie


def test_uploads_rejects_pdf_selfie():
    documents = {d: ct for d, (ct, _) in DOCS.items()} | {"selfie_with_ids": "application/pdf"}
    resp = post_uploads(_event(body={"documents": documents}), None)
    assert resp["statusCode"] == 400
    assert "selfie_with_ids" in _body(resp)["error"]


def test_uploads_rejects_missing_doc_type():
    documents = {d: ct for d, (ct, _) in DOCS.items() if d != "medical_degree"}
    resp = post_uploads(_event(body={"documents": documents}), None)
    assert resp["statusCode"] == 400
    assert "medical_degree" in _body(resp)["error"]


# -- Submit -------------------------------------------------------------------

def test_submit_happy_path():
    app_id, resp = _submit()
    assert resp["statusCode"] == 201
    assert _body(resp) == {"application_id": app_id, "status": "pending"}
    item = _table().get_item(Key={"application_id": app_id})["Item"]
    assert item["status"] == "pending"
    assert item["email"] == "ambe.tanyi@example.org"
    assert item["onmc_number"] == "12345/2019"
    assert item["checks"] == {k: False for k in ALL_CHECKS}
    assert item["duplicate_onmc"] is False
    for doc in DOCS:
        key = f"doctor-applications/{app_id}/{doc}"
        assert item["documents"][doc]["key"] == key
        assert _s3().get_object(Bucket=_BUCKET, Key=key)["Body"].read() == DOCS[doc][1]


@pytest.mark.parametrize("onmc", ["12345", "12345/19", "12345/2999", "123456789/2019", "12-45/2019"])
def test_submit_rejects_bad_onmc_number(onmc):
    _, resp = _submit(onmc_number=onmc)
    assert resp["statusCode"] == 400
    assert "onmc_number" in _body(resp)["error"]


def test_submit_normalises_onmc_case():
    app_id, resp = _submit(onmc_number=" ab123/2019 ")
    assert resp["statusCode"] == 201
    assert _table().get_item(Key={"application_id": app_id})["Item"]["onmc_number"] == "AB123/2019"


@pytest.mark.parametrize("field,value", [
    ("email", "not-an-email"), ("phone", "677000001"), ("specialty", "astrology"),
    ("graduation_year", 1900), ("identity_document_type", "driving_licence"), ("full_name", "  "),
])
def test_submit_rejects_invalid_fields(field, value):
    _, resp = _submit(**{field: value})
    assert resp["statusCode"] == 400
    assert field in _body(resp)["error"]


def test_submit_rejects_missing_document():
    app_id = str(uuid.uuid4())
    _upload(app_id, {d: v for d, v in DOCS.items() if d != "identity_document"})
    resp = post_application(_event(body=_fields(app_id)), None)
    assert resp["statusCode"] == 400
    assert "identity_document" in _body(resp)["error"]
    assert "Item" not in _table().get_item(Key={"application_id": app_id})


def test_submit_rejects_wrong_magic_bytes():
    app_id = str(uuid.uuid4())
    _upload(app_id, DOCS | {"selfie_with_ids": ("image/jpeg", PDF)})
    resp = post_application(_event(body=_fields(app_id)), None)
    assert resp["statusCode"] == 400
    assert "selfie_with_ids" in _body(resp)["error"]


def test_submit_rejects_non_uuid_application_id():
    resp = post_application(_event(body=_fields("../../etc")), None)
    assert resp["statusCode"] == 400


def test_submit_twice_conflicts():
    app_id, _ = _submit()
    resp = post_application(_event(body=_fields(app_id, full_name="Someone Else")), None)
    assert resp["statusCode"] == 409
    assert _table().get_item(Key={"application_id": app_id})["Item"]["full_name"] == "Dr Ambe Tanyi"


def test_submit_conflicts_on_active_email():
    _submit()
    _, resp = _submit(email="ambe.tanyi@EXAMPLE.org", onmc_number="99999/2020")
    assert resp["statusCode"] == 409


def test_submit_allows_reapply_after_rejection():
    app_id, _ = _submit()
    reject(_admin(path={"application_id": app_id}, body={"reason": "Selfie unreadable"}), None)
    _, resp = _submit()
    assert resp["statusCode"] == 201


def test_submit_conflicts_on_existing_staff_account():
    boto3.client("cognito-idp", region_name=_REGION).admin_create_user(
        UserPoolId=os.environ["STAFF_USER_POOL_ID"], Username="ambe.tanyi@example.org", MessageAction="SUPPRESS",
        UserAttributes=[{"Name": "email", "Value": "ambe.tanyi@example.org"}])
    _, resp = _submit()
    assert resp["statusCode"] == 409


def test_submit_flags_duplicate_onmc():
    _submit()
    app_id, resp = _submit(email="impostor@example.org")
    assert resp["statusCode"] == 201
    assert _table().get_item(Key={"application_id": app_id})["Item"]["duplicate_onmc"] is True


# -- Status -------------------------------------------------------------------

def test_status_returns_only_public_fields():
    app_id, _ = _submit()
    resp = get_status(_event(path={"application_id": app_id}), None)
    assert resp["statusCode"] == 200
    assert set(_body(resp)) == {"application_id", "status", "submitted_at", "reviewed_at", "rejection_reason"}
    assert _body(resp)["status"] == "pending"


def test_status_unknown_id_404():
    assert get_status(_event(path={"application_id": str(uuid.uuid4())}), None)["statusCode"] == 404


# -- Admin review ---------------------------------------------------------------

@pytest.mark.parametrize("groups", [None, "Patient", "Doctor", "Operator"])
def test_admin_routes_require_admin(groups):
    app_id, _ = _submit()
    path = {"application_id": app_id}
    for fn, body in [(list_applications, None), (get_application, None), (put_application, {"checks": ALL_CHECKS}),
                     (approve, {}), (reject, {"reason": "x"}), (resend_invite, {})]:
        resp = fn(_event(path=path, body=body, groups=groups, sub="user-1" if groups else None), None)
        assert resp["statusCode"] in (401, 403), fn.__module__
    assert _table().get_item(Key={"application_id": app_id})["Item"]["status"] == "pending"


def test_list_by_status():
    first, _ = _submit()
    second, _ = _submit(email="other@example.org", onmc_number="22222/2021")
    reject(_admin(path={"application_id": second}, body={"reason": "Forged degree"}), None)
    pending = _body(list_applications(_admin(), None))
    assert [a["application_id"] for a in pending["applications"]] == [first]
    assert "documents" not in pending["applications"][0]
    rejected = _body(list_applications(_admin(query={"status": "rejected"}), None))
    assert [a["application_id"] for a in rejected["applications"]] == [second]
    assert list_applications(_admin(query={"status": "bogus"}), None)["statusCode"] == 400


def test_get_includes_document_urls_and_duplicates():
    first, _ = _submit()
    second, _ = _submit(email="impostor@example.org")
    body = _body(get_application(_admin(path={"application_id": second}), None))
    assert set(body["document_urls"]) == set(DOCS)
    assert body["document_urls"]["selfie_with_ids"].startswith("https://")
    assert body["duplicates"]["onmc_number"] == [{"application_id": first, "status": "pending"}]
    assert body["duplicates"]["email"] == []


def test_put_moves_to_under_review_and_sets_checks():
    app_id, _ = _submit()
    resp = put_application(_admin(path={"application_id": app_id},
                                  body={"admin_notes": "Called ONMC", "checks": {"selfie_matches": True}}), None)
    assert resp["statusCode"] == 200
    item = _table().get_item(Key={"application_id": app_id})["Item"]
    assert item["status"] == "under_review"
    assert item["reviewer_id"] == "admin-1"
    assert item["admin_notes"] == "Called ONMC"
    assert item["checks"] == {"onmc_register_verified": False, "documents_consistent": False, "selfie_matches": True}


@pytest.mark.parametrize("body", [{"checks": {"unknown": True}}, {"checks": {"selfie_matches": "yes"}},
                                  {"admin_notes": 5}, {}])
def test_put_validates_body(body):
    app_id, _ = _submit()
    assert put_application(_admin(path={"application_id": app_id}, body=body), None)["statusCode"] == 400


def test_put_refused_after_decision():
    app_id = _reviewed()
    approve(_admin(path={"application_id": app_id}, body={}), None)
    resp = put_application(_admin(path={"application_id": app_id}, body={"admin_notes": "late"}), None)
    assert resp["statusCode"] == 409


def test_approve_requires_all_checks():
    app_id, _ = _submit()
    put_application(_admin(path={"application_id": app_id}, body={"checks": {"selfie_matches": True}}), None)
    resp = approve(_admin(path={"application_id": app_id}, body={}), None)
    assert resp["statusCode"] == 409
    assert _table().get_item(Key={"application_id": app_id})["Item"]["status"] == "under_review"


def test_approve_creates_doctor():
    app_id = _reviewed()
    resp = approve(_admin(path={"application_id": app_id}, body={}), None)
    assert resp["statusCode"] == 200
    assert _body(resp) == {"approved": app_id, "email": "ambe.tanyi@example.org"}
    idp = boto3.client("cognito-idp", region_name=_REGION)
    pool = os.environ["STAFF_USER_POOL_ID"]
    user = idp.admin_get_user(UserPoolId=pool, Username="ambe.tanyi@example.org")
    attrs = {a["Name"]: a["Value"] for a in user["UserAttributes"]}
    assert attrs["name"] == "Dr Ambe Tanyi"
    groups = idp.admin_list_groups_for_user(UserPoolId=pool, Username="ambe.tanyi@example.org")["Groups"]
    assert [g["GroupName"] for g in groups] == ["Doctor"]
    item = _table().get_item(Key={"application_id": app_id})["Item"]
    assert item["status"] == "approved"
    assert item["doctor_user_id"] == attrs["sub"]
    profile = boto3.resource("dynamodb", region_name=_REGION).Table(_TEST_ENV["PROFILE_TABLE"]).get_item(
        Key={"user_id": attrs["sub"]})["Item"]
    assert profile["role"] == "doctor"
    assert profile["display_name"] == "Dr Ambe Tanyi"
    assert profile["specialty"] == "pediatrics"
    assert profile["onmc_number"] == "12345/2019"


def test_approve_is_retry_safe():
    app_id = _reviewed()
    boto3.client("cognito-idp", region_name=_REGION).admin_create_user(
        UserPoolId=os.environ["STAFF_USER_POOL_ID"], Username="ambe.tanyi@example.org", MessageAction="SUPPRESS",
        UserAttributes=[{"Name": "email", "Value": "ambe.tanyi@example.org"}])  # first attempt got this far
    resp = approve(_admin(path={"application_id": app_id}, body={}), None)
    assert resp["statusCode"] == 200
    assert approve(_admin(path={"application_id": app_id}, body={}), None)["statusCode"] == 409


def test_approve_refuses_onmc_already_approved():
    first = _reviewed()
    assert approve(_admin(path={"application_id": first}, body={}), None)["statusCode"] == 200
    second = _reviewed(email="impostor@example.org")
    resp = approve(_admin(path={"application_id": second}, body={}), None)
    assert resp["statusCode"] == 409
    assert "ONMC" in _body(resp)["error"]


def test_reject_requires_reason_and_tags_documents():
    app_id, _ = _submit()
    assert reject(_admin(path={"application_id": app_id}, body={"reason": "  "}), None)["statusCode"] == 400
    assert reject(_admin(path={"application_id": app_id}, body={"reason": "x" * 501}), None)["statusCode"] == 400
    resp = reject(_admin(path={"application_id": app_id}, body={"reason": "Selfie does not match the CNI"}), None)
    assert resp["statusCode"] == 200
    item = _table().get_item(Key={"application_id": app_id})["Item"]
    assert item["status"] == "rejected"
    assert item["rejection_reason"] == "Selfie does not match the CNI"
    for doc in DOCS:
        tags = _s3().get_object_tagging(Bucket=_BUCKET, Key=f"doctor-applications/{app_id}/{doc}")["TagSet"]
        assert tags == [{"Key": "state", "Value": "rejected"}]
    status = _body(get_status(_event(path={"application_id": app_id}), None))
    assert status["rejection_reason"] == "Selfie does not match the CNI"
    assert reject(_admin(path={"application_id": app_id}, body={"reason": "again"}), None)["statusCode"] == 409


def test_resend_invite_only_for_unconfirmed():
    pending, _ = _submit(email="pending@example.org", onmc_number="33333/2020")
    assert resend_invite(_admin(path={"application_id": pending}, body={}), None)["statusCode"] == 409
    app_id = _reviewed()
    approve(_admin(path={"application_id": app_id}, body={}), None)
    resp = resend_invite(_admin(path={"application_id": app_id}, body={}), None)
    assert resp["statusCode"] == 200
    assert _body(resp) == {"resent": app_id}


# -- Final-review fixes -----------------------------------------------------------

def test_reject_refused_while_approving_and_approve_resumes():
    # Approve got as far as creating the account (invite sent) and then failed: a reject must not
    # leave a live Doctor account on a rejected application; the admin finishes the approval instead.
    import approve_application
    app_id = _reviewed()
    real_profile_put = approve_application.boto3.resource

    class Boom(Exception):
        pass

    def failing_resource(name, **kw):
        res = real_profile_put(name, **kw)
        if name == "dynamodb":
            table = res.Table(_TEST_ENV["PROFILE_TABLE"])
            def put_item(**_):
                raise Boom()
            table.put_item = put_item
            res.Table = lambda n: table if n == _TEST_ENV["PROFILE_TABLE"] else real_profile_put(name).Table(n)
        return res

    approve_application.boto3.resource = failing_resource
    try:
        assert approve(_admin(path={"application_id": app_id}, body={}), None)["statusCode"] == 500
    finally:
        approve_application.boto3.resource = real_profile_put
    assert _table().get_item(Key={"application_id": app_id})["Item"]["status"] == "approving"
    assert reject(_admin(path={"application_id": app_id}, body={"reason": "late"}), None)["statusCode"] == 409
    assert put_application(_admin(path={"application_id": app_id}, body={"admin_notes": "x"}), None)["statusCode"] == 409
    assert approve(_admin(path={"application_id": app_id}, body={}), None)["statusCode"] == 200
    assert _table().get_item(Key={"application_id": app_id})["Item"]["status"] == "approved"


def test_reject_wins_race_before_any_account_is_created():
    app_id = _reviewed()
    reject(_admin(path={"application_id": app_id}, body={"reason": "Forged"}), None)
    assert approve(_admin(path={"application_id": app_id}, body={}), None)["statusCode"] == 409
    idp = boto3.client("cognito-idp", region_name=_REGION)
    users = idp.list_users(UserPoolId=os.environ["STAFF_USER_POOL_ID"])["Users"]
    assert users == []


def test_submit_and_uploads_refused_when_review_queue_full(monkeypatch):
    import app_util
    monkeypatch.setattr(app_util, "MAX_OPEN_APPLICATIONS", 1)
    _submit()
    _, resp = _submit(email="second@example.org", onmc_number="44444/2020")
    assert resp["statusCode"] == 503
    resp = post_uploads(_event(body={"documents": {d: ct for d, (ct, _) in DOCS.items()}}), None)
    assert resp["statusCode"] == 503


def test_upload_size_limit_is_5_mb():
    body = _body(post_uploads(_event(body={"documents": {d: ct for d, (ct, _) in DOCS.items()}}), None))
    import base64
    policy = json.loads(base64.b64decode(body["uploads"]["onmc_card"]["fields"]["policy"]))
    assert ["content-length-range", 1, 5 * 1024 * 1024] in policy["conditions"]


def test_submit_checks_documents_before_revealing_accounts():
    boto3.client("cognito-idp", region_name=_REGION).admin_create_user(
        UserPoolId=os.environ["STAFF_USER_POOL_ID"], Username="admin@example.org", MessageAction="SUPPRESS",
        UserAttributes=[{"Name": "email", "Value": "admin@example.org"}])
    resp = post_application(_event(body=_fields(str(uuid.uuid4()), email="admin@example.org")), None)
    assert resp["statusCode"] == 400  # no documents: nothing learnt about the email
    _, staff = _submit(email="admin@example.org")
    _submit(email="busy@example.org", onmc_number="55555/2020")
    _, active = _submit(email="busy@example.org", onmc_number="66666/2020")
    assert staff["statusCode"] == active["statusCode"] == 409
    assert _body(staff) == _body(active)  # one generic message: staff accounts are not enumerable


def test_reject_tags_documents_before_status_change(monkeypatch):
    import reject_application
    app_id, _ = _submit()
    real_client = reject_application.boto3.client

    def failing_client(name, **kw):
        c = real_client(name, **kw)
        if name == "s3":
            def boom(**_):
                raise RuntimeError("throttled")
            c.put_object_tagging = boom
        return c

    monkeypatch.setattr(reject_application.boto3, "client", failing_client)
    assert reject(_admin(path={"application_id": app_id}, body={"reason": "x"}), None)["statusCode"] == 500
    assert _table().get_item(Key={"application_id": app_id})["Item"]["status"] == "pending"  # retry possible


def test_submit_strips_onmc_leading_zeros():
    app_id, resp = _submit(onmc_number="0012345/2019")
    assert resp["statusCode"] == 201
    assert _table().get_item(Key={"application_id": app_id})["Item"]["onmc_number"] == "12345/2019"


@pytest.mark.parametrize("override", [{"specialty": ["pediatrics"]}, {"identity_document_type": {"a": 1}},
                                      {"onmc_number": 12345}])
def test_submit_malformed_types_return_400(override):
    _, resp = _submit(**override)
    assert resp["statusCode"] == 400


def test_uploads_malformed_types_return_400():
    documents = {d: ct for d, (ct, _) in DOCS.items()} | {"onmc_card": ["image/jpeg"]}
    assert post_uploads(_event(body={"documents": documents}), None)["statusCode"] == 400


def test_reject_losing_race_to_approve_leaves_documents_untagged(monkeypatch):
    from health_track.lambdas.doctor_application import reject_application
    app_id = _reviewed()
    stale = _table().get_item(Key={"application_id": app_id})["Item"]  # reject read it while still open
    approve(_admin(path={"application_id": app_id}, body={}), None)
    monkeypatch.setattr(reject_application, "admin_application", lambda event: ("admin-2", stale, None))
    resp = reject(_admin(path={"application_id": app_id}, body={"reason": "x"}), None)
    assert resp["statusCode"] == 409
    for doc in DOCS:
        assert _s3().get_object_tagging(Bucket=_BUCKET, Key=f"doctor-applications/{app_id}/{doc}")["TagSet"] == []
