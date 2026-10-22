"""API Gateway response helpers."""

import decimal
import json
from typing import Any, Optional


def _json_default(obj):
    if isinstance(obj, decimal.Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _headers(extra: Optional[dict]) -> dict:
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    }
    if extra:
        headers.update(extra)
    return headers


def ok(body: Any, status_code: int = 200, headers: Optional[dict] = None) -> dict:
    """Return a successful API Gateway response. `headers` are merged over the defaults."""
    return {
        "statusCode": status_code,
        "headers": _headers(headers),
        "body": json.dumps(body, default=_json_default),
    }


def err(status: int, message: str, headers: Optional[dict] = None) -> dict:
    """Return an error API Gateway response. `headers` are merged over the defaults."""
    return {
        "statusCode": status,
        "headers": _headers(headers),
        "body": json.dumps({"error": message}),
    }
