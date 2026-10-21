import boto3
import os
import logging
import traceback
from botocore.exceptions import ClientError
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)


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

        member_id = (event.get("pathParameters") or {}).get("member_id")
        if not member_id:
            return err(400, "member_id path parameter required")

        ddb = boto3.resource("dynamodb")
        table = ddb.Table(os.environ["PROFILE_TABLE"])
        resp = table.get_item(Key={"user_id": user_id})
        item = resp.get("Item")

        # I6: 404 if profile doesn't exist
        if not item:
            return err(404, "Profile not found")

        profiles_before = item.get("on_behalf_profiles", [])
        profiles_after = [m for m in profiles_before if m.get("member_id") != member_id]

        # I6: 404 if member not found
        if len(profiles_after) == len(profiles_before):
            return err(404, "Household member not found")

        # I6: guard with condition expression
        try:
            table.update_item(
                Key={"user_id": user_id},
                UpdateExpression="SET on_behalf_profiles = :profiles",
                ExpressionAttributeValues={":profiles": profiles_after},
                ConditionExpression="attribute_exists(user_id)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(404, "Profile not found")
            raise

        return ok({"deleted": member_id})
    except Exception as e:  # noqa: BLE001
        logger.error("Unhandled error: %s", traceback.format_exc())
        return err(500, "Internal server error")
