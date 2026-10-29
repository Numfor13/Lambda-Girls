import logging
from boto3.dynamodb.conditions import Key
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from app_util import STATUSES, query_param, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """Admin: applications with one status (default pending), newest first, without document keys."""
    try:
        _, error = require_group(event, "Admin")
        if error:
            return error
        status = query_param(event, "status") or "pending"
        if status not in STATUSES:
            return err(400, f"status must be one of: {', '.join(STATUSES)}")
        items, kwargs = [], {"IndexName": "StatusIndex", "KeyConditionExpression": Key("status").eq(status),
                             "ScanIndexForward": False}
        while True:
            resp = table().query(**kwargs)
            items.extend(resp.get("Items", []))
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        applications = [{k: v for k, v in item.items() if k != "documents"} for item in items]
        return ok({"applications": applications, "count": len(applications)})

    except Exception as e:
        logger.error("Unhandled error in list_applications: %s", str(e))
        return err(500, "Internal server error")
