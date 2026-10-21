import boto3
import os
import json
import uuid
from health_track_common.response import ok, err
from health_track_common.jwt_util import decode_claims

REQUIRED = {"name", "dob", "sex", "relationship"}


def handler(event, context):
    claims = decode_claims(event["headers"].get("Authorization", "").replace("Bearer ", ""))
    user_id = claims.get("sub")
    if not user_id:
        return err(401, "Unauthorized")
    body = json.loads(event.get("body") or "{}")
    missing = REQUIRED - body.keys()
    if missing:
        return err(400, f"Missing required fields: {sorted(missing)}")
    member = {
        "member_id":    str(uuid.uuid4()),
        "name":         str(body["name"])[:100],
        "dob":          str(body["dob"]),
        "sex":          str(body["sex"]),
        "relationship": str(body["relationship"])[:50],
    }
    ddb = boto3.resource("dynamodb")
    table = ddb.Table(os.environ["PROFILE_TABLE"])
    table.update_item(
        Key={"user_id": user_id},
        UpdateExpression="SET on_behalf_profiles = list_append(if_not_exists(on_behalf_profiles, :empty), :member)",
        ExpressionAttributeValues={":member": [member], ":empty": []},
    )
    return ok(member)
