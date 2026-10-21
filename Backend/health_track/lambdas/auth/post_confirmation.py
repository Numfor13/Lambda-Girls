import boto3
import os
import time


def handler(event, context):
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    ddb = boto3.client("dynamodb", connect_timeout=5, read_timeout=5)
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

    boto3.client("cognito-idp").admin_add_user_to_group(
        UserPoolId=event["userPoolId"],
        Username=event["userName"],
        GroupName="Patient",
    )
    return event
