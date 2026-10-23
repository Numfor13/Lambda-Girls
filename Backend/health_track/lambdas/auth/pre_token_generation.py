"""Cognito Pre Token Generation trigger (V1): staff groups only appear in tokens of users with TOTP MFA."""

import boto3
from botocore.config import Config

STAFF_GROUPS = {"Doctor", "Operator", "Admin"}

_CONFIG = Config(connect_timeout=2, read_timeout=2, retries={"max_attempts": 1})


def handler(event, context):
    groups = ((event.get("request") or {}).get("groupConfiguration") or {}).get("groupsToOverride") or []
    if not STAFF_GROUPS.intersection(groups):
        return event

    user = boto3.client("cognito-idp", config=_CONFIG).admin_get_user(
        UserPoolId=event["userPoolId"],
        Username=event["userName"],
    )
    if "SOFTWARE_TOKEN_MFA" not in (user.get("UserMFASettingList") or []):
        event["response"]["claimsOverrideDetails"] = {
            "groupOverrideDetails": {"groupsToOverride": [g for g in groups if g not in STAFF_GROUPS]},
        }
    return event
