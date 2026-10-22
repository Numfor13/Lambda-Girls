"""Small helpers shared by the Phase 10 anonymous-mode handlers.

These routes are public (no Cognito authorizer): each handler enforces the
X-Anonymous-Session header itself via health_track_common.anonymous.load_session.
Never log the raw token or the request headers.
"""

import json
import os

import boto3
from health_track_common.anonymous import load_session
from health_track_common.locale import locale_headers, resolve_locale
from health_track_common.response import err

MAX_COMPLAINT_CHARS = 2000
MAX_MESSAGE_CHARS = 4000
MAX_ID_CHARS = 128
URGENCIES = ("RED", "AMBER", "GREEN")


def table(env_var):
    return boto3.resource("dynamodb").Table(os.environ[env_var])


def response_headers(event):
    return locale_headers(resolve_locale(event))


def start(event, headers):
    """Return (anon_id, None) or (None, 401 response)."""
    return load_session(event, table("ANON_SESSION_TABLE"), headers=headers)


def parse_body(event, headers):
    """Return (body_dict, None) or (None, 400 response)."""
    try:
        body = json.loads((event or {}).get("body") or "{}")
    except (json.JSONDecodeError, ValueError, TypeError):
        return None, err(400, "Invalid JSON in request body", headers=headers)
    if not isinstance(body, dict):
        return None, err(400, "Request body must be a JSON object", headers=headers)
    return body, None


def optional_id(value):
    """True if value is None or a non-empty string of sane length."""
    return value is None or (isinstance(value, str) and 0 < len(value) <= MAX_ID_CHARS)


def path_param(event, name):
    value = ((event or {}).get("pathParameters") or {}).get(name)
    return value if isinstance(value, str) and 0 < len(value) <= MAX_ID_CHARS else None


def get_own_consultation(consultation_table, consultation_id, anon_id):
    """Return the consultation only if it belongs to this anonymous session.

    Same None (-> 404) for "missing" and "not yours", so there is no existence oracle.
    """
    item = consultation_table.get_item(Key={"consultation_id": consultation_id}).get("Item")
    if not item or item.get("patient_id") != anon_id:
        return None
    return item
