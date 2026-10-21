import boto3
import os
import time


def handler(event, context):
    ddb = boto3.client("dynamodb")
    sub = event["request"]["userAttributes"]["sub"]
    email = event["request"]["userAttributes"].get("email", "")
    phone = event["request"]["userAttributes"].get("phone_number", "")
    now = int(time.time() * 1000)
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
    cognito_client = boto3.client("cognito-idp")
    cognito_client.admin_add_user_to_group(
        UserPoolId=event["userPoolId"],
        Username=event["userName"],
        GroupName="Patient",
    )
    return event
