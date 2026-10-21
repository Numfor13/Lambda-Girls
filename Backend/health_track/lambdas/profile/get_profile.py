import boto3
import os
import logging
import traceback
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
        ddb = boto3.resource("dynamodb")
        table = ddb.Table(os.environ["PROFILE_TABLE"])
        resp = table.get_item(Key={"user_id": user_id})
        item = resp.get("Item")
        if not item:
            return err(404, "Profile not found")
        return ok(item)
    except Exception as e:  # noqa: BLE001
        logger.error("Unhandled error: %s", traceback.format_exc())
        return err(500, "Internal server error")
