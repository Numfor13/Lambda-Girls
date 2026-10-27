"""Consultation ownership rules shared by consultation, payment and doctor handlers."""

from health_track_common.auth import get_groups


def claims_of(event) -> dict:
    return ((event or {}).get("requestContext") or {}).get("authorizer", {}).get("claims", {}) or {}


def is_doctor(event) -> bool:
    return "Doctor" in get_groups(event)


def is_owner(consultation: dict, user_id: str) -> bool:
    """The phone owner who created it, or the patient themself."""
    return bool(user_id) and user_id in (consultation.get("phone_owner_id"), consultation.get("patient_id"))


def is_assigned_doctor(event, consultation: dict, user_id: str) -> bool:
    return is_doctor(event) and consultation.get("doctor_id") == user_id


def can_read(event, consultation: dict, user_id: str) -> bool:
    """Owners, and any doctor (doctors preview paid cases before claiming)."""
    return is_owner(consultation, user_id) or is_doctor(event)


def writer_role(event, consultation: dict, user_id: str):
    """Return "patient"/"doctor" for a caller allowed to write into the consultation, else None.

    Doctors may write only into a case they have claimed; the role is never client-supplied.
    """
    if is_assigned_doctor(event, consultation, user_id):
        return "doctor"
    if is_owner(consultation, user_id):
        return "patient"
    return None


def voice_note_key_ok(consultation_id: str, key) -> bool:
    """A voice-note key must live under its own consultation's prefix."""
    return key is None or (isinstance(key, str) and key.startswith(f"voice-notes/{consultation_id}/")
                           and ".." not in key)
