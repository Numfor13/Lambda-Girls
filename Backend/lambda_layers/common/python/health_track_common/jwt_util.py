"""JWT utility for decoding token claims without verification.

Verification is performed by the API Gateway authorizer.
This module only decodes the payload for use within Lambda handlers.
"""

import base64
import json
from typing import Any


def decode_claims(token: str) -> dict[str, Any]:
    """Base64-decode the JWT payload and return its claims as a dict.

    Does NOT verify the signature. Signature verification is handled
    by the API Gateway JWT authorizer before the Lambda is invoked.

    Args:
        token: A JWT string in the format header.payload.signature

    Returns:
        A dict containing the decoded claims, e.g.
        {"sub": "user-id", "cognito:groups": ["admin"], ...}

    Raises:
        ValueError: If the token does not have the expected three-part format.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid JWT format: expected 3 parts, got {len(parts)}")

    payload_b64 = parts[1]
    # Add padding so base64 decoding works regardless of token length
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding

    decoded_bytes = base64.urlsafe_b64decode(payload_b64)
    claims: dict[str, Any] = json.loads(decoded_bytes.decode("utf-8"))
    return claims
