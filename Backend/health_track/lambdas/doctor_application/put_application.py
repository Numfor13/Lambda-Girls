import logging, time
from botocore.exceptions import ClientError
from health_track_common.response import ok, err
from app_util import CHECKS, OPEN, admin_application, parse_body, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """Admin: record review notes and checklist answers; the first edit moves the application to under_review."""
    try:
        admin_id, item, error = admin_application(event)
        if error:
            return error
        body, error = parse_body(event)
        if error:
            return error
        if "admin_notes" not in body and "checks" not in body:
            return err(400, "Provide admin_notes and/or checks")
        notes = body.get("admin_notes", item.get("admin_notes", ""))
        if not isinstance(notes, str) or len(notes) > 2000:
            return err(400, "admin_notes must be a string of at most 2000 characters")
        checks = body.get("checks", {})
        if not isinstance(checks, dict) or not all(k in CHECKS and isinstance(v, bool) for k, v in checks.items()):
            return err(400, f"checks may only set these booleans: {', '.join(CHECKS)}")
        if item["status"] not in OPEN:
            return err(409, f"Application is already {item['status']}")

        merged = {**item["checks"], **checks}
        try:
            table().update_item(
                Key={"application_id": item["application_id"]},
                UpdateExpression="SET #s = :review, admin_notes = :notes, checks = :checks, "
                                 "reviewer_id = :admin, updated_at = :now",
                ConditionExpression="#s IN (:pending, :review)",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":review": "under_review", ":pending": "pending", ":notes": notes,
                                           ":checks": merged, ":admin": admin_id,
                                           ":now": int(time.time() * 1000)},
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "Application was decided meanwhile")
            raise
        return ok({"updated": item["application_id"], "status": "under_review", "checks": merged})

    except Exception as e:
        logger.error("Unhandled error in put_application: %s", str(e))
        return err(500, "Internal server error")
