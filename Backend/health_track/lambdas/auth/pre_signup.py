import os


def handler(event, context):
    phone = event.get("request", {}).get("userAttributes", {}).get("phone_number", "")
    if phone and not phone.startswith("+"):
        phone = "+237" + phone.lstrip("0")
        event["request"]["userAttributes"]["phone_number"] = phone
    if os.environ.get("ENV_NAME") == "dev":
        event["response"]["autoConfirmUser"] = True
        event["response"]["autoVerifyEmail"] = True
    return event
