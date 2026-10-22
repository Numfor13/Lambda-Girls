"""Anonymous-session helpers shared by the anonymous handlers and doctor views.

The raw session token is the anonymous patient's bearer secret. It is only ever
used as the AnonymousSessionTable key; everything persisted elsewhere (consultations,
messages, payments) and everything a doctor sees uses the one-way hashed id.
Never log the raw token or request headers.
"""

import hashlib
import time
import uuid

from health_track_common.locale import get_header
from health_track_common.response import err

SESSION_HEADER = "X-Anonymous-Session"
ANON_PREFIX = "anon#"
ANONYMOUS_LABEL = "anonymous"
SESSION_TTL_SECONDS = 7 * 86400

# Fields that could identify a person; never shown to doctors for anon consultations.
_IDENTITY_FIELDS = ("name", "patient_name", "phone", "phone_number", "email")


def hash_session_token(token: str) -> str:
    """Return the opaque patient id for a session token: "anon#" + sha256 hex."""
    return ANON_PREFIX + hashlib.sha256(token.encode("utf-8")).hexdigest()


def is_anonymous_id(value) -> bool:
    return isinstance(value, str) and value.startswith(ANON_PREFIX)


def _canonical_token(raw):
    """Return the canonical UUID string, or None if `raw` is not a UUID."""
    if not isinstance(raw, str) or len(raw) > 64:
        return None
    try:
        return str(uuid.UUID(raw.strip()))
    except ValueError:
        return None


def load_session(event, session_table, headers=None):
    """Validate the X-Anonymous-Session header.

    Returns (anon_id, None) for a known, unexpired session, else (None, 401 response).
    `ttl > now` is checked here because DynamoDB TTL deletion can lag by hours.
    """
    token = _canonical_token(get_header(event, SESSION_HEADER))
    if not token:
        return None, err(401, "Valid X-Anonymous-Session header required", headers=headers)
    item = session_table.get_item(Key={"session_token": token}).get("Item")
    if not item or int(item.get("ttl", 0)) <= int(time.time()):
        return None, err(401, "Anonymous session not found or expired", headers=headers)
    return hash_session_token(token), None


def redact_for_doctor(consultation: dict) -> dict:
    """Return a doctor-safe copy of an anonymous consultation; others pass through unchanged."""
    if not consultation or not is_anonymous_id(consultation.get("patient_id")):
        return consultation
    safe = {k: v for k, v in consultation.items() if k not in _IDENTITY_FIELDS}
    safe["patient_id"] = ANONYMOUS_LABEL
    safe["phone_owner_id"] = ANONYMOUS_LABEL
    safe["on_behalf_member_id"] = None
    safe["is_anonymous"] = True
    return safe


def redact_message_for_doctor(message: dict) -> dict:
    if message and is_anonymous_id(message.get("sender_id")):
        return {**message, "sender_id": ANONYMOUS_LABEL}
    return message
