import base64, binascii, boto3, json, logging, os
from boto3.dynamodb.conditions import Key, Attr
from health_track_common.response import ok, err
from extended_util import TIP_LOCALES, query_param

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def _encode_token(key: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode()


def _decode_token(token: str):
    try:
        key = json.loads(base64.urlsafe_b64decode(token.encode()))
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return None
    if not isinstance(key, dict) or not all(isinstance(v, str) for v in key.values()):
        return None
    return key


def handler(event, context):
    """Public, paginated feed of active health tips (optional locale / tag filters)."""
    try:
        raw_limit = query_param(event, "limit")
        if raw_limit is None:
            limit = DEFAULT_LIMIT
        else:
            try:
                limit = int(raw_limit)
            except ValueError:
                return err(400, "limit must be an integer")
            if not 1 <= limit <= MAX_LIMIT:
                return err(400, f"limit must be between 1 and {MAX_LIMIT}")

        locale = query_param(event, "locale")
        if locale is not None and locale not in TIP_LOCALES:
            return err(400, "locale must be one of " + ", ".join(sorted(TIP_LOCALES)))

        start_key = None
        token = query_param(event, "next_token")
        if token:
            start_key = _decode_token(token)
            if start_key is None:
                return err(400, "Invalid next_token")

        filter_expr = Attr("is_active").eq(True)
        tag = query_param(event, "tag")
        if tag:
            filter_expr = filter_expr & Attr("tags").contains(tag)

        table = boto3.resource("dynamodb").Table(os.environ["HEALTH_TIP_TABLE"])
        if locale:
            operation = table.query
            kwargs = {"IndexName": "LocaleIndex",
                      "KeyConditionExpression": Key("locale").eq(locale),
                      "ScanIndexForward": False}
        else:
            operation = table.scan
            kwargs = {}

        # DynamoDB applies Limit before FilterExpression. Asking only for the number of
        # items still missing guarantees we never read past the last item we return, so
        # LastEvaluatedKey is always a correct resume point for the next page.
        tips, last_key = [], start_key
        while len(tips) < limit:
            call = {**kwargs, "FilterExpression": filter_expr, "Limit": limit - len(tips)}
            if last_key:
                call["ExclusiveStartKey"] = last_key
            resp = operation(**call)
            tips.extend(resp.get("Items", []))
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break

        body = {"tips": tips, "count": len(tips)}
        if last_key:
            body["next_token"] = _encode_token(last_key)
        return ok(body)

    except Exception as e:
        logger.error("Unhandled error in list_health_tips: %s", str(e))
        return err(500, "Internal server error")
