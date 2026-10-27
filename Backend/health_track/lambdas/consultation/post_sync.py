import boto3, json, logging, os, time, uuid
from decimal import Decimal
from botocore.exceptions import ClientError
from health_track_common import access
from health_track_common.response import ok, err
from health_track_common.rules.rule_engine import evaluate

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_ITEMS = 50
MAX_TEXT_CHARS = 4000


def _conditional_failed(e) -> bool:
    return isinstance(e, ClientError) and e.response["Error"]["Code"] == "ConditionalCheckFailedException"


def handler(event, context):
    """
    Bulk offline write queue endpoint.
    Body: { "triage_results": [...], "messages": [...] }
    Each item processed independently; returns per-item success/failure.
    """
    try:
        ddb = boto3.resource("dynamodb")
        consultation_table = ddb.Table(os.environ["CONSULTATION_TABLE"])
        message_table = ddb.Table(os.environ["MESSAGE_TABLE"])
        triage_table = ddb.Table(os.environ["TRIAGE_TABLE"])

        user_id = access.claims_of(event).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        try:
            body = json.loads(event.get("body") or "{}", parse_float=Decimal)
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        triage_results = body.get("triage_results") or []
        messages = body.get("messages") or []
        if not isinstance(triage_results, list) or not isinstance(messages, list):
            return err(400, "triage_results and messages must be lists")
        if len(triage_results) > MAX_ITEMS or len(messages) > MAX_ITEMS:
            return err(400, f"At most {MAX_ITEMS} triage_results and {MAX_ITEMS} messages per sync")

        results = {"triage_results": [], "messages": []}
        has_red = False

        for tr in triage_results:
            result_id = tr.get("result_id") if isinstance(tr, dict) else None
            try:
                if not isinstance(tr, dict):
                    raise ValueError("triage result must be an object")
                result_id = result_id or str(uuid.uuid4())
                symptom_payload = tr.get("symptom_payload", {})
                if not isinstance(symptom_payload, dict):
                    raise ValueError("symptom_payload must be an object")
                age_months = symptom_payload.get("age_months")
                if isinstance(age_months, bool) or not isinstance(age_months, (int, Decimal, type(None))):
                    raise ValueError("age_months must be a number")
                if age_months is None:
                    symptom_payload.pop("age_months", None)  # rule engine defaults to adult
                queued_at = tr.get("queued_at") or int(time.time() * 1000)
                urgency, rules_fired, recommendation, facility_type_needed = evaluate(symptom_payload)
                item = {
                    "result_id":            result_id,
                    "user_id":              user_id,
                    "urgency":              urgency,
                    "recommendation":       recommendation,
                    "facility_type_needed": facility_type_needed,
                    "rules_fired":          rules_fired,
                    "symptom_payload":      symptom_payload,
                    "on_behalf_member_id":  tr.get("on_behalf_member_id"),
                    "synced_from_offline":  True,
                    "created_at":           int(queued_at),
                }
                # Same user re-syncing is idempotent; another user's result_id is a conflict.
                triage_table.put_item(
                    Item=item,
                    ConditionExpression="attribute_not_exists(result_id) OR user_id = :me",
                    ExpressionAttributeValues={":me": user_id},
                )
                if item["urgency"] == "RED":
                    has_red = True
                results["triage_results"].append({"result_id": result_id, "status": "ok"})
            except Exception as e:
                if _conditional_failed(e):
                    results["triage_results"].append({"result_id": result_id, "status": "conflict"})
                else:
                    logger.error("Error syncing triage result: %s", str(e))
                    results["triage_results"].append({"result_id": result_id, "status": "error"})

        for msg in messages:
            message_id = msg.get("message_id") if isinstance(msg, dict) else None
            try:
                if not isinstance(msg, dict):
                    raise ValueError("message must be an object")
                consultation_id = msg.get("consultation_id")
                if not isinstance(consultation_id, str) or not consultation_id:
                    raise ValueError("consultation_id is required")
                consultation = consultation_table.get_item(
                    Key={"consultation_id": consultation_id}).get("Item")
                sender_role = access.writer_role(event, consultation, user_id) if consultation else None
                if not sender_role:
                    raise PermissionError("not a writer of this consultation")
                if sender_role == "doctor" and consultation.get("status") != "open":
                    raise PermissionError("consultation is not open")
                if not access.voice_note_key_ok(consultation_id, msg.get("voice_note_key")):
                    raise ValueError("voice_note_key does not belong to this consultation")
                text_body = msg.get("text_body")
                if text_body is not None and (not isinstance(text_body, str) or len(text_body) > MAX_TEXT_CHARS):
                    raise ValueError("invalid text_body")

                client_message_id = msg.get("client_message_id") or str(uuid.uuid4())
                # Fall back to client_message_id so the same offline message maps to the same SK.
                message_id = msg.get("message_id") or client_message_id
                now = msg.get("created_at") or int(time.time() * 1000)
                item = {
                    "consultation_id":   consultation_id,
                    "message_id":        message_id,
                    "sender_id":         user_id,
                    "sender_role":       sender_role,
                    "content_type":      msg.get("content_type", "text"),
                    "text_body":         text_body,
                    "voice_note_key":    msg.get("voice_note_key"),
                    "duration_seconds":  msg.get("duration_seconds"),
                    "client_message_id": client_message_id,
                    "created_at":        int(now),
                }
                message_table.put_item(
                    Item=item,
                    ConditionExpression="attribute_not_exists(client_message_id)",
                )
                results["messages"].append({"message_id": message_id, "status": "ok"})
            except Exception as e:
                if _conditional_failed(e):
                    results["messages"].append({"message_id": message_id, "status": "duplicate"})
                else:
                    logger.error("Error syncing message: %s", str(e))
                    results["messages"].append({"message_id": message_id, "status": "error"})

        # If any RED triage result synced, note it for downstream (Phase 6 will handle EventBridge)
        return ok({"synced": True, "has_red_triage": has_red, "results": results})

    except Exception as e:
        logger.error("Unhandled error in post_sync: %s", str(e))
        return err(500, "Internal server error")
