import logging, os

import boto3
from botocore.exceptions import ClientError
from health_track_common.locale import SUPPORTED_LOCALES, get_header
from health_track_common.response import err

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CACHE_CONTROL = "public, max-age=604800"  # 7 days
EXPOSE_HEADERS = "Content-Language, ETag"


def _etag_matches(if_none_match, etag):
    """RFC 7232 weak comparison against an If-None-Match list (or '*')."""
    if not if_none_match or not etag:
        return False
    for candidate in if_none_match.split(",")[:20]:
        candidate = candidate.strip()
        if candidate == "*":
            return True
        if candidate.startswith("W/"):
            candidate = candidate[2:]
        if candidate == etag:
            return True
    return False


def handler(event, context):
    """GET /i18n/{locale} -- serve i18n/{locale}.json from S3 with 7-day caching and ETag/304."""
    try:
        locale = ((event or {}).get("pathParameters") or {}).get("locale")
        if locale not in SUPPORTED_LOCALES:
            return err(400, f"locale must be one of: {', '.join(SUPPORTED_LOCALES)}")

        try:
            obj = boto3.client("s3").get_object(
                Bucket=os.environ["I18N_BUCKET"], Key=f"i18n/{locale}.json")
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                return err(404, "Translations not found", headers={"Content-Language": locale})
            raise

        etag = obj.get("ETag", "")  # S3's content MD5 for single-part uploads: deterministic
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": EXPOSE_HEADERS,
            "Cache-Control": CACHE_CONTROL,
            "Content-Language": locale,
            "ETag": etag,
        }
        if _etag_matches(get_header(event, "If-None-Match"), etag):
            obj["Body"].close()
            return {"statusCode": 304, "headers": headers, "body": ""}

        # API Gateway proxy integrations cannot stream; translation files are small.
        return {"statusCode": 200, "headers": headers, "body": obj["Body"].read().decode("utf-8")}

    except Exception:
        logger.exception("Unhandled error in get_locale")
        return err(500, "Internal server error")
