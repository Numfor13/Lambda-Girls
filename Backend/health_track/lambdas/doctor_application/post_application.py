import boto3, logging, os, time, uuid
from botocore.exceptions import ClientError
from health_track_common import events
from health_track_common.response import ok, err
import app_util
from app_util import (ACTIVE, CHECKS, DOC_TYPES, QUEUE_FULL, draft_key, frozen_key, matches_magic, parse_body,
                      query_index, send_email, table, validate_application)

# One message for every "email already used" case, so the form cannot be used to find staff accounts.
EMAIL_IN_USE = "This email already has an application in progress or an account. Contact support if this is wrong."

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _verified_drafts(s3, bucket, application_id):
    """Return ({doc_type: (content_type, etag)}, None) or (None, error message) for the uploaded drafts."""
    drafts = {}
    for doc_type, allowed in DOC_TYPES.items():
        key = draft_key(application_id, doc_type)
        try:
            head = s3.head_object(Bucket=bucket, Key=key)
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return None, f"{doc_type} has not been uploaded"
            raise
        content_type = head.get("ContentType", "")
        if content_type not in allowed:
            return None, f"{doc_type} must be one of: {', '.join(sorted(allowed))}"
        first = s3.get_object(Bucket=bucket, Key=key, Range="bytes=0-7", IfMatch=head["ETag"])["Body"].read()
        if not matches_magic(content_type, first):
            return None, f"{doc_type} is not a valid {content_type.split('/')[1].upper()} file"
        drafts[doc_type] = (content_type, head["ETag"])
    return drafts, None


def handler(event, context):
    """Submit a doctor application: validate fields, verify and freeze the uploaded documents."""
    try:
        body, error = parse_body(event)
        if error:
            return error
        application_id = body.get("application_id")
        try:
            uuid.UUID(str(application_id))
        except ValueError:
            return err(400, "application_id must be the ID returned by POST /doctor-applications/uploads")
        fields, message = validate_application(body)
        if message:
            return err(400, message)

        applications = table()
        if "Item" in applications.get_item(Key={"application_id": application_id}):
            return err(409, "This application has already been submitted")
        if app_util.review_queue_full():
            return err(503, QUEUE_FULL)

        # Documents first: only someone who really uploaded all five gets to learn anything about the email.
        s3 = boto3.client("s3")
        bucket = os.environ["DOCUMENTS_BUCKET"]
        drafts, message = _verified_drafts(s3, bucket, application_id)
        if message:
            return err(400, message)
        if any(a["status"] in ACTIVE for a in query_index("EmailIndex", "email", fields["email"])):
            return err(409, EMAIL_IN_USE)
        idp = boto3.client("cognito-idp")
        try:
            idp.admin_get_user(UserPoolId=os.environ["STAFF_USER_POOL_ID"], Username=fields["email"])
            return err(409, EMAIL_IN_USE)
        except idp.exceptions.UserNotFoundException:
            pass
        documents = {}
        for doc_type, (content_type, etag) in drafts.items():
            # CopySourceIfMatch: the frozen copy is exactly the bytes checked above, even if the
            # still-valid upload form is used again in the meantime.
            s3.copy_object(Bucket=bucket, Key=frozen_key(application_id, doc_type),
                           CopySource={"Bucket": bucket, "Key": draft_key(application_id, doc_type)},
                           CopySourceIfMatch=etag)
            documents[doc_type] = {"key": frozen_key(application_id, doc_type), "content_type": content_type}

        now = int(time.time() * 1000)
        item = {
            "application_id": application_id,
            "status": "pending",
            **fields,
            "documents": documents,
            "checks": {c: False for c in CHECKS},
            # Flagged, not blocked: blocking would let an impostor lock the real doctor out by applying first.
            "duplicate_onmc": bool(query_index("OnmcIndex", "onmc_number", fields["onmc_number"])),
            "admin_notes": "",
            "submitted_at": now,
            "updated_at": now,
        }
        try:
            applications.put_item(Item=item, ConditionExpression="attribute_not_exists(application_id)")
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "This application has already been submitted")
            raise

        events.record("doctor_application.submitted")
        try:  # reviewers get the ID only: no personal data in email
            boto3.client("sns").publish(
                TopicArn=os.environ["REVIEWER_TOPIC_ARN"],
                Subject="New doctor application to review",
                Message=f"A doctor application is waiting for review.\nApplication ID: {application_id}",
            )
        except Exception:
            logger.exception("Reviewer alert failed for %s", application_id)
        send_email(fields["email"], "We received your CareBridge application",
                   f"Hello {fields['full_name']},\n\nWe received your application to join CareBridge as a doctor. "
                   f"We usually review applications within 24 hours.\n\nApplication ID: {application_id}\n\n"
                   "If it is approved you will receive a second email with your temporary password.\n")
        return ok({"application_id": application_id, "status": "pending"}, status_code=201)

    except Exception as e:
        logger.error("Unhandled error in post_application: %s", str(e))
        return err(500, "Internal server error")
