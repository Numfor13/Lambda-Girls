import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)



def _require_doctor(event) -> tuple:
    """Returns (user_id, None) if Doctor, or (None, error_response) if not."""
    claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub")
    if not user_id:
        return None, err(401, "Unauthorized")
    groups = claims.get("cognito:groups", "")
    if "Doctor" not in (groups if isinstance(groups, list) else groups.split(",")):
        return None, err(403, "Doctor group required")
    return user_id, None


def handler(event, context):
    try:
        user_id, error = _require_doctor(event)
        if error:
            return error

        consultation_table = boto3.resource("dynamodb").Table(os.environ["CONSULTATION_TABLE"])

        # Fetch paid + open consultations via StatusUrgencyIndex
        paid = consultation_table.query(
            IndexName="StatusUrgencyIndex",
            KeyConditionExpression=Key("status").eq("paid"),
            ScanIndexForward=False,
            Limit=50,
        ).get("Items", [])

        open_c = consultation_table.query(
            IndexName="StatusUrgencyIndex",
            KeyConditionExpression=Key("status").eq("open"),
            ScanIndexForward=False,
            Limit=50,
        ).get("Items", [])

        # RED first ordering: urgency_created field is "{urgency}#{timestamp}"
        # "RED#..." > "GREEN#..." > "AMBER#..." alphabetically is wrong,
        # so sort by urgency rank then created_at
        URGENCY_RANK = {"RED": 0, "AMBER": 1, "GREEN": 2, None: 3}

        def sort_key(c):
            return (URGENCY_RANK.get(c.get("urgency"), 3), c.get("urgency_created", ""))

        items = sorted(paid + open_c, key=sort_key)

        return ok({"queue": items, "count": len(items)})

    except Exception as e:
        logger.error("Unhandled error in get_queue: %s", str(e))
        return err(500, "Internal server error")
