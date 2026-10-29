import boto3, logging, os, time
from botocore.exceptions import ClientError
from health_track_common import events
from health_track_common.response import ok, err
from app_util import CHECKS, OPEN, admin_application, query_index, staff_user_pool, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _create_doctor(idp, item) -> str:
    """Create the staff user (Cognito emails the temporary password) and return its sub.

    Retry-safe: if an earlier attempt already created the user, reuse it.
    """
    pool, email = staff_user_pool(), item["email"]
    try:
        user = idp.admin_create_user(
            UserPoolId=pool,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": item["full_name"]},
                {"Name": "phone_number", "Value": item["phone"]},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )["User"]
        attributes = user["Attributes"]
    except idp.exceptions.UsernameExistsException:
        attributes = idp.admin_get_user(UserPoolId=pool, Username=email)["UserAttributes"]
    idp.admin_add_user_to_group(UserPoolId=pool, Username=email, GroupName="Doctor")
    return next(a["Value"] for a in attributes if a["Name"] == "sub")


def handler(event, context):
    """Admin: approve a fully checked application and create the doctor's staff account."""
    try:
        admin_id, item, error = admin_application(event)
        if error:
            return error
        if item["status"] not in OPEN + ("approving",):
            return err(409, f"Application is already {item['status']}")
        if not all(item["checks"].get(c) for c in CHECKS):
            return err(409, "Confirm every verification check before approving: " + ", ".join(CHECKS))
        application_id = item["application_id"]
        if any(a["status"] in ("approving", "approved") and a["application_id"] != application_id
               for a in query_index("OnmcIndex", "onmc_number", item["onmc_number"])):
            return err(409, "Another application with this ONMC number is already approved")

        # Claim the decision before creating anything: from "approving" no reject or edit can land, so an
        # account (and its emailed invite) never exists for a rejected application. A failed attempt
        # stays "approving" and is finished by approving again.
        if item["status"] != "approving":
            try:
                table().update_item(
                    Key={"application_id": application_id},
                    UpdateExpression="SET #s = :approving, reviewer_id = :admin, updated_at = :now",
                    ConditionExpression="#s IN (:pending, :review)",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":approving": "approving", ":pending": "pending",
                                               ":review": "under_review", ":admin": admin_id,
                                               ":now": int(time.time() * 1000)},
                )
            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    return err(409, "Application was decided meanwhile")
                raise

        user_id = _create_doctor(boto3.client("cognito-idp"), item)
        now = int(time.time() * 1000)
        boto3.resource("dynamodb").Table(os.environ["PROFILE_TABLE"]).put_item(Item={
            "user_id": user_id,
            "email": item["email"],
            "phone": item["phone"],
            "display_name": item["full_name"],
            "role": "doctor",
            "specialty": item["specialty"],
            "onmc_number": item["onmc_number"],
            "locale": "en",
            "created_at": now,
        })
        try:
            table().update_item(
                Key={"application_id": application_id},
                UpdateExpression="SET #s = :approved, reviewed_at = :now, updated_at = :now, "
                                 "reviewer_id = :admin, doctor_user_id = :user",
                ConditionExpression="#s = :approving",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":approved": "approved", ":approving": "approving",
                                           ":now": now, ":admin": admin_id, ":user": user_id},
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "Application was decided meanwhile")
            raise
        events.record("doctor_application.approved")
        return ok({"approved": application_id, "email": item["email"]})

    except Exception as e:
        logger.error("Unhandled error in approve_application: %s", str(e))
        return err(500, "Internal server error")
