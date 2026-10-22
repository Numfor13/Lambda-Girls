import boto3, logging, os
from botocore.exceptions import ClientError
from health_track_common.auth import require_group
from health_track_common.response import ok, err
from extended_util import path_param

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    try:
        _, error = require_group(event, "Admin")
        if error:
            return error

        tip_id = path_param(event, "tip_id")
        if not tip_id:
            return err(400, "tip_id is required")

        table = boto3.resource("dynamodb").Table(os.environ["HEALTH_TIP_TABLE"])
        try:
            table.delete_item(Key={"tip_id": tip_id},
                              ConditionExpression="attribute_exists(tip_id)")
        except ClientError as ce:
            if ce.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return err(404, "Health tip not found")
            raise

        return ok({"deleted": tip_id})

    except Exception as e:
        logger.error("Unhandled error in delete_health_tip: %s", str(e))
        return err(500, "Internal server error")
