import json, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

from health_track_common.auth import require_group, get_groups


def _event(sub="u1", groups=None):
    claims = {}
    if sub:
        claims["sub"] = sub
    if groups is not None:
        claims["cognito:groups"] = groups
    return {"requestContext": {"authorizer": {"claims": claims}}}


def test_missing_sub_returns_401():
    user_id, error = require_group(_event(sub=None, groups="Admin"), "Admin")
    assert user_id is None
    assert error["statusCode"] == 401


def test_missing_request_context_returns_401():
    user_id, error = require_group({}, "Admin")
    assert user_id is None
    assert error["statusCode"] == 401


def test_wrong_group_returns_403():
    user_id, error = require_group(_event(groups="Patient"), "Admin", "Operator")
    assert user_id is None
    assert error["statusCode"] == 403
    assert "error" in json.loads(error["body"])


def test_no_groups_claim_returns_403():
    _, error = require_group(_event(), "Admin")
    assert error["statusCode"] == 403


def test_comma_string_groups_match():
    user_id, error = require_group(_event(groups="Patient,Operator"), "Admin", "Operator")
    assert error is None
    assert user_id == "u1"


def test_list_groups_match():
    user_id, error = require_group(_event(groups=["Doctor"]), "Doctor")
    assert error is None
    assert user_id == "u1"


def test_no_groups_required_only_checks_authentication():
    user_id, error = require_group(_event(groups="Patient"))
    assert error is None and user_id == "u1"
    _, error = require_group(_event(sub=None))
    assert error["statusCode"] == 401


def test_get_groups_normalises():
    assert get_groups(_event(groups="A, B")) == {"A", "B"}
    assert get_groups(_event(groups=["A"])) == {"A"}
    assert get_groups(_event()) == set()


def test_staff_groups_only_trusted_from_staff_pool(monkeypatch):
    staff = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_staff"
    monkeypatch.setenv("STAFF_POOL_ISSUER", staff)
    patient_token = _event(groups="Patient,Admin")
    patient_token["requestContext"]["authorizer"]["claims"]["iss"] = "https://cognito-idp.us-east-1.amazonaws.com/x"
    assert get_groups(patient_token) == {"Patient"}
    assert require_group(patient_token, "Admin")[1]["statusCode"] == 403
    staff_token = _event(groups="Admin")
    staff_token["requestContext"]["authorizer"]["claims"]["iss"] = staff
    assert require_group(staff_token, "Admin") == ("u1", None)
