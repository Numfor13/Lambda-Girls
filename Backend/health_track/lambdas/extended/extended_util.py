"""Small helpers shared by the Phase 9 extended-services handlers."""

import json
from datetime import datetime
from health_track_common.response import err


def parse_body(event):
    """Return (body_dict, None) or (None, 400 response)."""
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, ValueError):
        return None, err(400, "Invalid JSON in request body")
    if not isinstance(body, dict):
        return None, err(400, "Request body must be a JSON object")
    return body, None


def parse_iso_date(value):
    """Return a date for a strict YYYY-MM-DD string, else None."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def non_empty_str(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def collect_all(operation, **kwargs):
    """Run a DynamoDB query/scan to exhaustion, following LastEvaluatedKey."""
    items = []
    while True:
        resp = operation(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


TIP_LOCALES = {"en", "fr", "pid"}


def validate_tip_fields(body: dict, partial: bool):
    """Validate health-tip fields; return (clean_fields, None) or (None, error message).

    With partial=False title, body, source_name, published_date and locale are required (create).
    With partial=True only supplied fields are checked, but none may be blanked (update).
    """
    clean = {}
    for field in ("title", "body", "source_name"):
        if field in body or not partial:
            if not non_empty_str(body.get(field)):
                return None, f"{field} is required and must be a non-empty string"
            clean[field] = body[field].strip()
    if "published_date" in body or not partial:
        published = parse_iso_date(body.get("published_date"))
        if published is None:
            return None, "published_date is required and must be an ISO date (YYYY-MM-DD)"
        clean["published_date"] = published.isoformat()
    if "locale" in body or not partial:
        if body.get("locale") not in TIP_LOCALES:
            return None, "locale must be one of " + ", ".join(sorted(TIP_LOCALES))
        clean["locale"] = body["locale"]
    if "source_url" in body:
        if body["source_url"] is not None and not isinstance(body["source_url"], str):
            return None, "source_url must be a string"
        clean["source_url"] = body["source_url"]
    if "tags" in body:
        tags = body["tags"]
        if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
            return None, "tags must be a list of strings"
        clean["tags"] = tags
    if "is_active" in body:
        if not isinstance(body["is_active"], bool):
            return None, "is_active must be a boolean"
        clean["is_active"] = body["is_active"]
    return clean, None


def path_param(event, name):
    return (event.get("pathParameters") or {}).get(name)


def query_param(event, name):
    return (event.get("queryStringParameters") or {}).get(name)
