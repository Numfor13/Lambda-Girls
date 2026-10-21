"""API Gateway response helpers."""

import json
from typing import Any


def ok(body: Any) -> dict:
    """Return a successful API Gateway response (200)."""
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def err(status: int, message: str) -> dict:
    """Return an error API Gateway response."""
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({"error": message}),
    }
