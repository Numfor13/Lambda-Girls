"""Domain events on the default EventBridge bus (consumed by the push sender)."""

import json
import logging

import boto3

logger = logging.getLogger()

SOURCE = "health-track"


def record(name: str) -> None:
    """Business KPI as a structured log line (counted by a Logs Insights widget; no paid custom metrics)."""
    logger.info("business_event %s", name, extra={"business_event": name})


def publish(detail_type: str, detail: dict) -> None:
    """Best effort: a failed notification must never fail the request that caused it."""
    record(detail_type)
    try:
        boto3.client("events").put_events(Entries=[{
            "Source": SOURCE,
            "DetailType": detail_type,
            "Detail": json.dumps(detail, default=str),
        }])
    except Exception:
        logger.exception("EventBridge publish failed for %s", detail_type)
