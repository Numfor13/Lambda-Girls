import boto3, json, logging, os, base64
from boto3.dynamodb.conditions import Key, Attr
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PAGE_SIZE = 50


def encode_key(key):
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode() if key else None


def decode_key(s):
    try:
        return json.loads(base64.urlsafe_b64decode(s.encode())) if s else None
    except Exception:
        return None


def handler(event, context):
    try:
        table = boto3.resource("dynamodb").Table(os.environ["FACILITY_TABLE"])

        params = event.get("queryStringParameters") or {}
        region = params.get("region")
        capability = params.get("capability")
        has_backup_power = params.get("has_backup_power")
        accepts_csu_card = params.get("accepts_csu_card")
        last_key_str = params.get("last_key")

        exclusive_start_key = decode_key(last_key_str) if last_key_str else None
        kwargs = {"Limit": PAGE_SIZE}
        if exclusive_start_key:
            kwargs["ExclusiveStartKey"] = exclusive_start_key

        if region:
            # Query using RegionIndex GSI
            kwargs["IndexName"] = "RegionIndex"
            kwargs["KeyConditionExpression"] = Key("region").eq(region)
            kwargs["FilterExpression"] = Attr("is_active").eq(True)
            response = table.query(**kwargs)
        else:
            # Scan with is_active filter
            kwargs["FilterExpression"] = Attr("is_active").eq(True)
            response = table.scan(**kwargs)

        items = response.get("Items", [])
        next_key = encode_key(response.get("LastEvaluatedKey"))

        # Apply boolean filters in Python
        if has_backup_power is not None:
            flag = has_backup_power.lower() == "true"
            items = [i for i in items if bool(i.get("has_backup_power", False)) == flag]

        if accepts_csu_card is not None:
            flag = accepts_csu_card.lower() == "true"
            items = [i for i in items if bool(i.get("accepts_csu_card", False)) == flag]

        # Apply capability filter
        if capability:
            items = [i for i in items if capability in i.get("capabilities", set())]

        return ok({"facilities": items, "next_key": next_key})

    except Exception as e:
        logger.error("Unexpected error in list_facilities: %s", e, exc_info=True)
        return err(500, "Internal server error")
