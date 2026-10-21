import boto3
import os
import json
from health_track_common.response import ok, err
from health_track_common.jwt_util import decode_claims

VALID_LOCALES = {"en", "fr", "pid"}


def handler(event, context):
    claims = decode_claims(event["headers"].get("Authorization", "").replace("Bearer ", ""))
    user_id = claims.get("sub")
    if not user_id:
        return err(401, "Unauthorized")
    body = json.loads(event.get("body") or "{}")
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
    table.update_item(
        Key={"user_id": user_id},
        UpdateExpression=expr,
        ExpressionAttributeNames={f"#{k}": k for k in updates},
        ExpressionAttributeValues={f":{k}": v for k, v in updates.items()},
    )
    return ok({"updated": list(updates.keys())})
