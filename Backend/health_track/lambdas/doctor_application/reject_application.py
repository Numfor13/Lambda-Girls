import boto3, logging, os, time
from botocore.exceptions import ClientError
from health_track_common import events
from health_track_common.response import ok, err
from app_util import OPEN, admin_application, parse_body, send_email, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """Admin: reject with a reason; the documents are tagged so S3 deletes them after 90 days."""
    try:
        admin_id, item, error = admin_application(event)
        if error:
            return error
        body, error = parse_body(event)
        if error:
            return error
        reason = body.get("reason")
        if not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > 500:
            return err(400, "reason is required (at most 500 characters)")
        reason = reason.strip()
        if item["status"] not in OPEN:
            return err(409, f"Application is already {item['status']}")

        # Tag first (idempotent): if this fails the application stays open and reject can simply be retried,
        # instead of leaving untagged identity documents that never expire.
        s3 = boto3.client("s3")
        for doc in item["documents"].values():
            s3.put_object_tagging(Bucket=os.environ["DOCUMENTS_BUCKET"], Key=doc["key"],
                                  Tagging={"TagSet": [{"Key": "state", "Value": "rejected"}]})

        application_id, now = item["application_id"], int(time.time() * 1000)
        try:
            table().update_item(
                Key={"application_id": application_id},
                UpdateExpression="SET #s = :rejected, rejection_reason = :reason, reviewed_at = :now, "
                                 "updated_at = :now, reviewer_id = :admin",
                ConditionExpression="#s IN (:pending, :review)",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":rejected": "rejected", ":reason": reason, ":now": now,
                                           ":admin": admin_id, ":pending": "pending", ":review": "under_review"},
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                # Approve won the race: untag, or the approved doctor's documents would expire.
                for doc in item["documents"].values():
                    s3.delete_object_tagging(Bucket=os.environ["DOCUMENTS_BUCKET"], Key=doc["key"])
                return err(409, "Application was decided meanwhile")
            raise
        events.record("doctor_application.rejected")
        send_email(item["email"], "Your CareBridge application",
                   f"Hello {item['full_name']},\n\nWe could not approve your application to join CareBridge "
                   f"as a doctor.\n\nReason: {reason}\n\nYou may apply again with corrected documents.\n")
        return ok({"rejected": application_id})

    except Exception as e:
        logger.error("Unhandled error in reject_application: %s", str(e))
        return err(500, "Internal server error")
