"""Shared rules for doctor applications: documents, field validation, keys and applicant email."""

import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3
from health_track_common.response import err

logger = logging.getLogger()

_ANY = {"application/pdf", "image/jpeg", "image/png"}
# The selfie must be a photo: a PDF would let someone submit credentials they found or bought online.
DOC_TYPES = {
    "onmc_certificate": _ANY,
    "onmc_card": _ANY,
    "medical_degree": _ANY,
    "identity_document": _ANY,
    "selfie_with_ids": {"image/jpeg", "image/png"},
}
MAX_BYTES = 5 * 1024 * 1024  # a phone photo or scanned PDF; keeps abuse and applicants' data cost down
UPLOAD_EXPIRES = 900
MAGIC = {"application/pdf": b"%PDF", "image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG"}

CHECKS = ("onmc_register_verified", "documents_consistent", "selfie_matches")
# "approving": the staff account is being created; only approve may move it on (to "approved").
STATUSES = ("pending", "under_review", "approving", "approved", "rejected")
OPEN = ("pending", "under_review")
ACTIVE = OPEN + ("approving", "approved")
# Applications are public: past this many awaiting review, new ones are refused until admins catch up.
# ponytail: global cap, not per-sender; add WAF per-IP rate limits when the budget allows.
MAX_OPEN_APPLICATIONS = 200

SPECIALTIES = {
    "general_practice", "internal_medicine", "pediatrics", "surgery", "obstetrics_gynecology", "cardiology",
    "dermatology", "psychiatry", "orthopedics", "ent", "ophthalmology", "neurology", "emergency_medicine",
    "infectious_disease", "urology", "oncology", "radiology", "anesthesiology", "endocrinology", "nephrology",
    "pulmonology",
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+\d{8,15}$")
# ONMC registration number: serial / year of first inscription (permanent, never renewed).
ONMC_RE = re.compile(r"^[A-Z0-9]{1,8}/(\d{4})$")
TEXT_FIELDS = {"full_name": 120, "medical_school": 200, "identity_document_number": 40}


def draft_key(application_id: str, doc_type: str) -> str:
    return f"drafts/{application_id}/{doc_type}"


def frozen_key(application_id: str, doc_type: str) -> str:
    return f"doctor-applications/{application_id}/{doc_type}"


def matches_magic(content_type: str, head: bytes) -> bool:
    magic = MAGIC.get(content_type)
    return bool(magic) and head.startswith(magic)


def validate_application(body: dict):
    """Return (clean_fields, None) or (None, error message naming the field)."""
    year = datetime.now(timezone.utc).year
    clean = {}
    for field, limit in TEXT_FIELDS.items():
        value = body.get(field)
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
            return None, f"{field} is required (at most {limit} characters)"
        clean[field] = value.strip()

    email = body.get("email")
    if not isinstance(email, str) or not EMAIL_RE.match(email.strip()) or len(email) > 254:
        return None, "email must be a valid email address"
    clean["email"] = email.strip().lower()

    phone = body.get("phone")
    if not isinstance(phone, str) or not PHONE_RE.match(phone.strip()):
        return None, "phone must be in international format, e.g. +237677000000"
    clean["phone"] = phone.strip()

    if not isinstance(body.get("specialty"), str) or body["specialty"] not in SPECIALTIES:
        return None, "specialty is not a recognised specialty"
    clean["specialty"] = body["specialty"]

    onmc = body.get("onmc_number")
    match = ONMC_RE.match(onmc.strip().upper()) if isinstance(onmc, str) else None
    if not match or not 1950 <= int(match.group(1)) <= year:
        return None, "onmc_number must look like 12345/2019 (registration number / year of inscription)"
    serial, inscribed = match.group(0).split("/")
    # One number, one key: "012345/2019" must not dodge the duplicate checks for "12345/2019".
    clean["onmc_number"] = f"{serial.lstrip('0') or '0'}/{inscribed}"

    grad = body.get("graduation_year")
    if not isinstance(grad, int) or isinstance(grad, bool) or not 1950 <= grad <= year:
        return None, f"graduation_year must be a year between 1950 and {year}"
    clean["graduation_year"] = grad

    if not isinstance(body.get("identity_document_type"), str) or body["identity_document_type"] not in ("cni", "passport"):
        return None, "identity_document_type must be cni or passport"
    clean["identity_document_type"] = body["identity_document_type"]
    return clean, None


def parse_body(event):
    """Return (body_dict, None) or (None, 400 response)."""
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, ValueError):
        return None, err(400, "Invalid JSON in request body")
    if not isinstance(body, dict):
        return None, err(400, "Request body must be a JSON object")
    return body, None


def path_param(event, name):
    return (event.get("pathParameters") or {}).get(name)


def query_param(event, name):
    return (event.get("queryStringParameters") or {}).get(name)


def table():
    return boto3.resource("dynamodb").Table(os.environ["APPLICATION_TABLE"])


def query_index(index: str, key: str, value: str) -> list:
    from boto3.dynamodb.conditions import Key
    items, kwargs = [], {"IndexName": index, "KeyConditionExpression": Key(key).eq(value)}
    while True:
        resp = table().query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def review_queue_full() -> bool:
    from boto3.dynamodb.conditions import Key
    waiting = sum(table().query(IndexName="StatusIndex", KeyConditionExpression=Key("status").eq(status),
                                Select="COUNT")["Count"] for status in OPEN)
    return waiting >= MAX_OPEN_APPLICATIONS


QUEUE_FULL = "We are not accepting new doctor applications right now. Please try again in a few days."


def send_email(to: str, subject: str, text: str) -> None:
    """Best effort applicant email via SES; skipped until a sender domain is configured."""
    sender = os.environ.get("SENDER_EMAIL")
    if not sender:
        logger.info("email_skipped %s", subject)
        return
    try:
        boto3.client("ses").send_email(
            Source=sender,
            Destination={"ToAddresses": [to]},
            Message={"Subject": {"Data": subject}, "Body": {"Text": {"Data": text}}},
        )
    except Exception:
        logger.exception("Applicant email failed: %s", subject)


def admin_application(event):
    """Return (admin_id, application, None) or (None, None, error response) for /admin/... routes."""
    from health_track_common.auth import require_group
    admin_id, error = require_group(event, "Admin")
    if error:
        return None, None, error
    application_id = path_param(event, "application_id")
    if not application_id:
        return None, None, err(400, "application_id is required")
    item = table().get_item(Key={"application_id": application_id}).get("Item")
    if not item:
        return None, None, err(404, "Application not found")
    return admin_id, item, None


def staff_user_pool() -> str:
    return os.environ["STAFF_USER_POOL_ID"]
