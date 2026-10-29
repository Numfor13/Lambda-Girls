import logging
from health_track_common.response import ok, err
from app_util import path_param, table

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PUBLIC_FIELDS = ("application_id", "status", "submitted_at", "reviewed_at", "rejection_reason")


def handler(event, context):
    """Public status page: the unguessable application ID is the only credential, so return status only."""
    try:
        application_id = path_param(event, "application_id")
        if not application_id:
            return err(400, "application_id is required")
        item = table().get_item(Key={"application_id": application_id}).get("Item")
        if not item:
            return err(404, "Application not found")
        return ok({f: item.get(f) for f in PUBLIC_FIELDS})

    except Exception as e:
        logger.error("Unhandled error in get_application_status: %s", str(e))
        return err(500, "Internal server error")
