"""Health Track common utilities for Lambda functions."""

try:  # X-Ray subsegments for AWS SDK and HTTP calls; the SDK comes from the xray-deps layer in Lambda.
    from aws_xray_sdk.core import patch_all
    patch_all()
except ImportError:
    pass

from health_track_common.response import ok, err
from health_track_common.errors import AppError

__all__ = ["ok", "err", "AppError"]
