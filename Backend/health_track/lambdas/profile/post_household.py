import boto3
import os
import json
import uuid
import logging
import traceback
from botocore.exceptions import ClientError
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REQUIRED = {"name", "dob", "sex", "relationship"}


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

        missing = REQUIRED - body.keys()
        if missing:
            return err(400, f"Missing required fields: {sorted(missing)}")

        ddb = boto3.resource("dynamodb")
        table = ddb.Table(os.environ["PROFILE_TABLE"])

        # I7: household size limit
        resp = table.get_item(Key={"user_id": user_id})
        item = resp.get("Item", {})
        if not item:
            return err(404, "Profile not found")
        if len(item.get("on_behalf_profiles", [])) >= 10:
            return err(400, "Maximum 10 household members allowed")

        member = {
            "member_id":    str(uuid.uuid4()),
            "name":         str(body["name"])[:100],
            "dob":          str(body["dob"]),
            "sex":          str(body["sex"]),
            "relationship": str(body["relationship"])[:50],
        }

        # I6: guard against ghost profile creation
        try:
            table.update_item(
                Key={"user_id": user_id},
                UpdateExpression="SET on_behalf_profiles = list_append(if_not_exists(on_behalf_profiles, :empty), :member)",
                ExpressionAttributeValues={":member": [member], ":empty": []},
                ConditionExpression="attribute_exists(user_id)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(404, "Profile not found")
            raise

        return ok(member)
    except Exception as e:  # noqa: BLE001
        logger.error("Unhandled error: %s", traceback.format_exc())
        return err(500, "Internal server error")
