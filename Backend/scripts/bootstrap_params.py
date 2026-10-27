"""Create the runtime parameters the Lambdas read from SSM Parameter Store (idempotent).

CloudFormation cannot create SecureString parameters, so this runs once per environment
after the Data stack exists (it encrypts with the health-data KMS key). Existing values
are never overwritten unless --rotate is given for that parameter.

  python scripts/bootstrap_params.py --env dev
  python scripts/bootstrap_params.py --env dev --fapshi "apiuser:apikey"   # enable real payments
  python scripts/bootstrap_params.py --env dev --rotate channels/gateway-token

Standard-tier parameters are free (they replace Secrets Manager at $0.40/secret/month).
"""

import argparse
import base64
import secrets

import boto3
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def vapid_keypair() -> tuple:
    """(public, private) as the browser (applicationServerKey) and pywebpush expect them."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(serialization.Encoding.X962,
                                           serialization.PublicFormat.UncompressedPoint)
    return b64url(public), b64url(private)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", default="dev", choices=["dev", "staging", "prod"])
    parser.add_argument("--fapshi", help='Fapshi credentials "apiuser:apikey" (default: UNSET = simulated)')
    parser.add_argument("--rotate", action="append", default=[], help="parameter to overwrite")
    args = parser.parse_args()

    ssm = boto3.client("ssm", region_name="us-east-1")
    prefix = f"/health-track/{args.env}"
    key_id = f"alias/health-track-{args.env}"

    def exists(name):
        try:
            ssm.get_parameter(Name=f"{prefix}/{name}")
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "ParameterNotFound":
                return False
            raise

    def put(name, value, secure=True, force=False):
        if exists(name) and not force and name not in args.rotate:
            print(f"kept     {prefix}/{name}")
            return
        kwargs = {"Type": "SecureString", "KeyId": key_id} if secure else {"Type": "String"}
        ssm.put_parameter(Name=f"{prefix}/{name}", Value=value, Overwrite=True, Tier="Standard", **kwargs)
        print(f"written  {prefix}/{name}")

    put("fapshi/credentials", args.fapshi or "UNSET", force=bool(args.fapshi))
    put("channels/gateway-token", secrets.token_urlsafe(32))
    if not exists("push/vapid-private-key") or "push/vapid-private-key" in args.rotate:
        public, private = vapid_keypair()  # the pair is only ever (re)written together
        put("push/vapid-private-key", private, force=True)
        put("push/vapid-public-key", public, secure=False, force=True)
    else:
        print(f"kept     {prefix}/push/vapid-private-key and push/vapid-public-key")


if __name__ == "__main__":
    main()
