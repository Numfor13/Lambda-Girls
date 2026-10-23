"""
Seed script: upload the base translation files to the i18n bucket as i18n/{locale}.json.

Idempotent: an object whose content is unchanged (same MD5/ETag) is skipped.

Usage:
    python scripts/seed_i18n.py --bucket health-track-i18n-<account>-dev --region us-east-1
    (or set I18N_BUCKET instead of --bucket)
"""

import argparse
import hashlib
import json
import os
import sys

import boto3
from botocore.exceptions import ClientError

LOCALES = ("en", "fr", "pid")
I18N_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "i18n")


def load_locale_files(directory=I18N_DIR) -> dict:
    """Return {locale: raw_bytes}; raises ValueError if a file is not a JSON object."""
    files = {}
    for locale in LOCALES:
        with open(os.path.join(directory, f"{locale}.json"), "rb") as f:
            raw = f.read()
        if not isinstance(json.loads(raw.decode("utf-8")), dict):
            raise ValueError(f"{locale}.json must contain a JSON object")
        files[locale] = raw
    return files


def _current_etag(s3, bucket, key):
    try:
        return s3.head_object(Bucket=bucket, Key=key)["ETag"].strip('"')
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def seed(bucket: str, region: str = None, s3_client=None) -> tuple:
    """Upload changed locale files; returns (uploaded, skipped)."""
    s3 = s3_client or boto3.client("s3", region_name=region)
    uploaded = skipped = 0
    for locale, raw in load_locale_files().items():
        key = f"i18n/{locale}.json"
        if _current_etag(s3, bucket, key) == hashlib.md5(raw).hexdigest():
            skipped += 1
            continue
        s3.put_object(Bucket=bucket, Key=key, Body=raw,
                      ContentType="application/json; charset=utf-8")
        uploaded += 1
    print(f"Uploaded {uploaded} locale files, skipped {skipped} (unchanged)")
    return uploaded, skipped


def main(argv=None):
    parser = argparse.ArgumentParser(description="Seed Health Track translation files (en/fr/pid)")
    parser.add_argument("--bucket", default=os.environ.get("I18N_BUCKET"),
                        help="i18n bucket name (default: $I18N_BUCKET)")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    args = parser.parse_args(argv)
    if not args.bucket:
        parser.error("--bucket or I18N_BUCKET is required")
    seed(args.bucket, args.region)


if __name__ == "__main__":
    main(sys.argv[1:])
