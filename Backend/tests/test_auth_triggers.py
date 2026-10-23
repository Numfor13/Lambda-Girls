import importlib.util, os
from decimal import Decimal

import pytest

import health_track.lambdas.auth.pre_token_generation as ptg


def _event(groups):
    return {
        "version": "1",
        "triggerSource": "TokenGeneration_Authentication",
        "userPoolId": "us-east-1_test",
        "userName": "staff-user",
        "request": {
            "userAttributes": {"sub": "s1"},
            "groupConfiguration": {"groupsToOverride": groups, "iamRolesToOverride": [], "preferredRole": None},
        },
        "response": {"claimsOverrideDetails": None},
    }


@pytest.fixture
def cognito(monkeypatch):
    """Fake cognito-idp client; set .mfa to the user's UserMFASettingList."""
    class FakeCognito:
        mfa = []
        calls = []

        def admin_get_user(self, **kwargs):
            self.calls.append(kwargs)
            return {"Username": kwargs["Username"], "UserMFASettingList": self.mfa}

    fake = FakeCognito()
    fake.calls = []
    monkeypatch.setattr(ptg.boto3, "client", lambda service, **kwargs: fake)
    return fake


def test_patient_only_untouched_and_no_lookup(cognito):
    event = _event(["Patient"])
    assert ptg.handler(event, None)["response"]["claimsOverrideDetails"] is None
    assert cognito.calls == []


def test_staff_without_mfa_loses_staff_groups(cognito):
    cognito.mfa = []
    event = ptg.handler(_event(["Patient", "Doctor", "Admin"]), None)
    assert event["response"]["claimsOverrideDetails"] == {
        "groupOverrideDetails": {"groupsToOverride": ["Patient"]}}
    assert cognito.calls == [{"UserPoolId": "us-east-1_test", "Username": "staff-user"}]


def test_staff_with_sms_mfa_only_loses_staff_groups(cognito):
    cognito.mfa = ["SMS_MFA"]
    event = ptg.handler(_event(["Operator"]), None)
    assert event["response"]["claimsOverrideDetails"]["groupOverrideDetails"]["groupsToOverride"] == []


def test_staff_with_totp_keeps_groups(cognito):
    cognito.mfa = ["SOFTWARE_TOKEN_MFA"]
    event = ptg.handler(_event(["Patient", "Doctor"]), None)
    assert event["response"]["claimsOverrideDetails"] is None


# -- Seed script: DynamoDB rejects float, so every number must be Decimal ------

def _load_seed_facilities():
    path = os.path.join(os.path.dirname(__file__), "..", "scripts", "seed_facilities.py")
    spec = importlib.util.spec_from_file_location("seed_facilities", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _floats(value):
    if isinstance(value, float):
        return [value]
    if isinstance(value, dict):
        return [f for v in value.values() for f in _floats(v)]
    if isinstance(value, (list, set)):
        return [f for v in value for f in _floats(v)]
    return []


def test_seed_facilities_decimal_conversion_leaves_no_floats():
    seed = _load_seed_facilities()
    converted = seed.to_decimal(seed.FACILITIES)
    assert _floats(seed.FACILITIES)  # the source data really does contain floats
    assert _floats(converted) == []
    assert converted[0]["latitude"] == Decimal("4.1527")
