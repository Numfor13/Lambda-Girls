import boto3, json, logging, os
from datetime import datetime, timezone
from health_track_common.auth import require_group
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        user_id, error = require_group(event, "Admin")
        if error:
            return error

        application_id = (event.get("pathParameters") or {}).get("application_id", "")
        if not application_id:
            return err(400, "Missing application_id")

        table = boto3.resource("dynamodb").Table(os.environ["APPLICATIONS_TABLE"])
        result = table.get_item(Key={"application_id": application_id})
        item = result.get("Item")
        if not item:
            return err(404, "Application not found")

        if item["status"] == "approved":
            return err(409, "Already approved")

        cognito = boto3.client("cognito-idp")
        user_pool_id = os.environ["USER_POOL_ID"]
        email = item["email"]

        # Create the Cognito user (or get existing)
        try:
            cognito.admin_get_user(UserPoolId=user_pool_id, Username=email)
        except cognito.exceptions.UserNotFoundException:
            cognito.admin_create_user(
                UserPoolId=user_pool_id,
                Username=email,
                UserAttributes=[
                    {"Name": "email", "Value": email},
                    {"Name": "email_verified", "Value": "true"},
                    {"Name": "name", "Value": item["full_name"]},
                    {"Name": "phone_number", "Value": item.get("phone", "")},
                ],
                DesiredDeliveryMediums=["EMAIL"],
            )

        # Add to Doctor group
        cognito.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=email,
            GroupName="Doctor",
        )

        # Update application record
        now = datetime.now(timezone.utc).isoformat()
        table.update_item(
            Key={"application_id": application_id},
            UpdateExpression="SET #status = :s, reviewed_at = :t, reviewed_by = :by",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":s": "approved", ":t": now, ":by": user_id},
        )

        logger.info("Doctor application approved: %s -> %s", application_id, email)
        return ok({"approved": application_id, "email": email})

    except Exception as e:
        logger.error("Error in approve_application: %s", e)
        return err(500, "Internal server error")
