import boto3, json, logging, os, time, uuid
from botocore.exceptions import ClientError
from health_track_common.response import ok, err
from health_track_common.rules.rule_engine import evaluate

logger = logging.getLogger()
logger.setLevel(logging.INFO)


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

        user_id = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {}).get("sub")
        if not user_id:
            return err(401, "Unauthorized")

        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        triage_results = body.get("triage_results", [])
        messages = body.get("messages", [])
        results = {"triage_results": [], "messages": []}
        has_red = False

        for tr in triage_results:
            try:
                result_id = tr.get("result_id") or str(uuid.uuid4())
                queued_at = tr.get("queued_at") or int(time.time() * 1000)
                symptom_payload = tr.get("symptom_payload", {})
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
                triage_table.put_item(Item=item)
                if item["urgency"] == "RED":
                    has_red = True
                results["triage_results"].append({"result_id": result_id, "status": "ok"})
            except Exception as e:
                logger.error("Error syncing triage result: %s", str(e))
                results["triage_results"].append({"result_id": tr.get("result_id"), "status": "error", "error": str(e)})

        for msg in messages:
            try:
                consultation_id = msg.get("consultation_id")
                client_message_id = msg.get("client_message_id") or str(uuid.uuid4())

                # Idempotency: skip if already exists (don't use query — just attempt put with condition)
                # Fall back to client_message_id so the same offline message maps to the same SK.
                message_id = msg.get("message_id") or client_message_id
                now = msg.get("created_at") or int(time.time() * 1000)
                item = {
                    "consultation_id":   consultation_id,
                    "message_id":        message_id,
                    "sender_id":         user_id,
                    "sender_role":       msg.get("sender_role", "patient"),
                    "content_type":      msg.get("content_type", "text"),
                    "text_body":         msg.get("text_body"),
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
            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    results["messages"].append({"message_id": msg.get("message_id"), "status": "duplicate"})
                else:
                    logger.error("Error syncing message: %s", str(e))
                    results["messages"].append({"message_id": msg.get("message_id"), "status": "error"})

        # If any RED triage result synced, note it for downstream (Phase 6 will handle EventBridge)
        return ok({"synced": True, "has_red_triage": has_red, "results": results})

    except Exception as e:
        logger.error("Unhandled error in post_sync: %s", str(e))
        return err(500, "Internal server error")
