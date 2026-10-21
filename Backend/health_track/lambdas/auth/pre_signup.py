import os


def handler(event, context):
    if os.environ.get("ENV_NAME") == "dev":
        event["response"]["autoConfirmUser"] = True
        event["response"]["autoVerifyEmail"] = True
    return event
