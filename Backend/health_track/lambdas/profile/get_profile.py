import boto3
import os
from health_track_common.response import ok, err
from health_track_common.jwt_util import decode_claims


def handler(event, context):
    claims = decode_claims(event["headers"].get("Authorization", "").replace("Bearer ", ""))
    user_id = claims.get("sub")
    if not user_id:
        return err(401, "Unauthorized")
    ddb = boto3.resource("dynamodb")
    table = ddb.Table(os.environ["PROFILE_TABLE"])
    resp = table.get_item(Key={"user_id": user_id})
    item = resp.get("Item")
    if not item:
        return err(404, "Profile not found")
    return ok(item)
