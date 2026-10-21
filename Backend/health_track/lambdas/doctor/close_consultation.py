import boto3, logging, os, time
from botocore.exceptions import ClientError
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
        consultation_id = (event.get("pathParameters") or {}).get("consultation_id")
        if not consultation_id:
            return err(400, "consultation_id is required")

        now = int(time.time() * 1000)
        try:
            consultation_table.update_item(
                Key={"consultation_id": consultation_id},
                UpdateExpression="SET #s = :closed, updated_at = :ts",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":closed": "closed",
                    ":ts": now,
                    ":open": "open",
                },
                ConditionExpression="#s = :open AND attribute_exists(consultation_id)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(409, "Consultation is not in 'open' status or does not exist")
            raise

        return ok({"consultation_id": consultation_id, "status": "closed"})

    except Exception as e:
        logger.error("Unhandled error in close_consultation: %s", str(e))
        return err(500, "Internal server error")
