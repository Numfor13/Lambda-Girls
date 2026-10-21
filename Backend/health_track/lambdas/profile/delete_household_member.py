import boto3
import os
from health_track_common.response import ok, err
from health_track_common.jwt_util import decode_claims


def handler(event, context):
    claims = decode_claims(event["headers"].get("Authorization", "").replace("Bearer ", ""))
    user_id = claims.get("sub")
    if not user_id:
        return err(401, "Unauthorized")
    member_id = (event.get("pathParameters") or {}).get("member_id")
    if not member_id:
        return err(400, "member_id path parameter required")
    ddb = boto3.resource("dynamodb")
    table = ddb.Table(os.environ["PROFILE_TABLE"])
    resp = table.get_item(Key={"user_id": user_id})
    item = resp.get("Item", {})
    profiles = [m for m in item.get("on_behalf_profiles", []) if m.get("member_id") != member_id]
    table.update_item(
        Key={"user_id": user_id},
        UpdateExpression="SET on_behalf_profiles = :profiles",
        ExpressionAttributeValues={":profiles": profiles},
    )
    return ok({"deleted": member_id})
