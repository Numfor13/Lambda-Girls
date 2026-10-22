import json
import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lambda_layers", "common", "python"))
_ENV = {"CONSULTATION_TABLE": "c", "MESSAGE_TABLE": "m", "TRIAGE_TABLE": "t"}


def test_sync_recomputes_triage_from_symptom_payload():
    """POST /sync with symptom_payload should run rule engine, not store client urgency."""
    from health_track.lambdas.consultation.post_sync import handler

    event = {
        "requestContext": {"authorizer": {"claims": {"sub": "user-1"}}},
        "body": json.dumps({
            "triage_results": [{
                "result_id": "tr-1",
                "urgency": "GREEN",
                "symptom_payload": {
                    "age_months": 3,
                    "is_pregnant": False,
                    "symptoms": ["convulsions"],
                    "vitals": {},
                },
                "queued_at": 1700000000000,
            }],
            "messages": [],
        }),
    }

    put_items = []
    mock_table = MagicMock()
    mock_table.put_item = lambda **kw: put_items.append(kw["Item"])

    with patch.dict(os.environ, _ENV), patch("boto3.resource") as mock_ddb:
        mock_ddb.return_value.Table.return_value = mock_table
        result = handler(event, None)

    body = json.loads(result["body"])
    assert body["synced"] is True
    assert len(put_items) == 1
    stored = put_items[0]
    assert stored["urgency"] == "RED"
    assert len(stored["rules_fired"]) > 0
    assert stored["recommendation"] != ""
