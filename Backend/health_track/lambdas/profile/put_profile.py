import boto3
import os
import json
import logging
import traceback
from botocore.exceptions import ClientError
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

VALID_LOCALES = {"en", "fr", "pid"}


def handler(event, context):
    try:
        # I1: use API Gateway authorizer claims instead of manual JWT decode
        user_id = (
            (event.get("requestContext") or {})
            .get("authorizer", {})
            .get("claims", {})
            .get("sub")
        )
        if not user_id:
            return err(401, "Unauthorized")

        # I7: safe JSON parsing
        try:
            body = json.loads(event.get("body") or "{}")
            if not isinstance(body, dict):
                return err(400, "Request body must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return err(400, "Invalid JSON in request body")

        updates = {}
        if "display_name" in body:
            updates["display_name"] = str(body["display_name"])[:100]
        if "locale" in body:
            if body["locale"] not in VALID_LOCALES:
                return err(400, f"locale must be one of {sorted(VALID_LOCALES)}")
            updates["locale"] = body["locale"]
        if not updates:
            return err(400, "No updatable fields provided")

        ddb = boto3.resource("dynamodb")
        table = ddb.Table(os.environ["PROFILE_TABLE"])
        expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)

        # I6: guard against ghost profile creation
        try:
            table.update_item(
                Key={"user_id": user_id},
                UpdateExpression=expr,
                ExpressionAttributeNames={f"#{k}": k for k in updates},
                ExpressionAttributeValues={f":{k}": v for k, v in updates.items()},
                ConditionExpression="attribute_exists(user_id)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(404, "Profile not found")
            raise

        return ok({"updated": list(updates.keys())})
    except Exception as e:  # noqa: BLE001
        logger.error("Unhandled error: %s", traceback.format_exc())
        return err(500, "Internal server error")
