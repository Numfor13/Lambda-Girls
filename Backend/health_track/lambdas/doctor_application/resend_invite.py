import boto3, logging
from health_track_common.response import ok, err
from app_util import admin_application, staff_user_pool

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """Admin: re-send the invitation (new temporary password) to an approved doctor who never signed in."""
    try:
        _, item, error = admin_application(event)
        if error:
            return error
        if item["status"] != "approved":
            return err(409, "Only approved applications have an invitation")
        idp = boto3.client("cognito-idp")
        user = idp.admin_get_user(UserPoolId=staff_user_pool(), Username=item["email"])
        if user["UserStatus"] != "FORCE_CHANGE_PASSWORD":
            return err(409, "The doctor has already signed in; use password reset instead")
        idp.admin_create_user(UserPoolId=staff_user_pool(), Username=item["email"], MessageAction="RESEND",
                              DesiredDeliveryMediums=["EMAIL"])
        return ok({"resent": item["application_id"]})

    except Exception as e:
        logger.error("Unhandled error in resend_invite: %s", str(e))
        return err(500, "Internal server error")
