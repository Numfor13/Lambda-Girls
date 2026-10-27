"""SSM Parameter Store reads, cached for the life of the Lambda container.

Secrets (Fapshi credentials, VAPID private key, telco gateway token) live in
SecureString parameters created by scripts/bootstrap_params.py, not in the
CloudFormation templates or Lambda environment.
"""

import boto3

_cache = {}

UNSET = "UNSET"


def get_param(name: str) -> str:
    """Return the decrypted value of an SSM parameter (cached per container)."""
    if name not in _cache:
        resp = boto3.client("ssm").get_parameter(Name=name, WithDecryption=True)
        _cache[name] = resp["Parameter"]["Value"]
    return _cache[name]


def is_set(value: str) -> bool:
    return bool(value) and value != UNSET
