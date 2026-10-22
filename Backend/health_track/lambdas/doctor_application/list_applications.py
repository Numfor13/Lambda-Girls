import boto3, logging, os
from boto3.dynamodb.conditions import Key
from health_track_common.auth import require_group
from health_track_common.response import ok, err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

STATUS_ORDER = {"pending": 0, "under_review": 1, "approved": 2, "rejected": 3}


def handler(event, context):
    try:
        user_id, error = require_group(event, "Admin")
        if error:
            return error

        params = event.get("queryStringParameters") or {}
        status_filter = params.get("status")  # optional filter

        table = boto3.resource("dynamodb").Table(os.environ["APPLICATIONS_TABLE"])

        if status_filter:
            items = table.query(
                IndexName="StatusSubmittedIndex",
                KeyConditionExpression=Key("status").eq(status_filter),
                ScanIndexForward=False,
                Limit=100,
            ).get("Items", [])
        else:
            # Scan all — applications table is small enough
            items = table.scan(Limit=200).get("Items", [])
            items.sort(key=lambda x: (STATUS_ORDER.get(x.get("status"), 9), x.get("submitted_at", "")))

        # Strip large fields from list view
        summarized = []
        for item in items:
            summarized.append({
                "application_id": item["application_id"],
                "full_name": item["full_name"],
                "email": item["email"],
                "specialty": item["specialty"],
                "years_experience": item.get("years_experience"),
                "graduation_year": item.get("graduation_year"),
                "status": item["status"],
                "called_hospital": item.get("called_hospital", False),
                "submitted_at": item["submitted_at"],
                "reviewed_at": item.get("reviewed_at"),
            })

        return ok({"applications": summarized, "count": len(summarized)})

    except Exception as e:
        logger.error("Error in list_applications: %s", e)
        return err(500, "Internal server error")
