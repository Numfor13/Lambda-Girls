import boto3
import os
import time
from botocore.config import Config

# Short timeouts so both calls fit inside the trigger's 10 s function timeout.
_CONFIG = Config(connect_timeout=2, read_timeout=2, retries={"max_attempts": 1})


def handler(event, context):
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    ddb = boto3.client("dynamodb", config=_CONFIG)
    sub   = event["request"]["userAttributes"]["sub"]
    email = event["request"]["userAttributes"].get("email", "")
    phone = event["request"]["userAttributes"].get("phone_number", "")
    now   = int(time.time() * 1000)

    try:
        ddb.put_item(
            TableName=os.environ["PROFILE_TABLE"],
            Item={
                "user_id":            {"S": sub},
                "email":              {"S": email},
                "phone":              {"S": phone},
                "display_name":       {"S": ""},
                "locale":             {"S": "en"},
                "on_behalf_profiles": {"L": []},
                "created_at":         {"N": str(now)},
            },
            ConditionExpression="attribute_not_exists(user_id)",
        )
    except ddb.exceptions.ConditionalCheckFailedException:
        pass  # profile already exists — idempotent

    boto3.client("cognito-idp", config=_CONFIG).admin_add_user_to_group(
        UserPoolId=event["userPoolId"],
        Username=event["userName"],
        GroupName="Patient",
    )
    return event
