"""Documented, deliberate exceptions to the AWS Solutions (cdk-nag) rule pack.

Each one is a trade-off against the $3/month budget or a route that is public by design.
"""

from cdk_nag import NagSuppressions

PUBLIC_BY_DESIGN = (
    "Public by design: offline-first directory, pharmacy/facility code lookups, translations, the "
    "VAPID public key, doctor applications (no account exists until an admin approves them), and "
    "webhooks from Fapshi/telco gateways (verified in the handler: Fapshi status "
    "API / gateway token). Anonymous routes authenticate the X-Anonymous-Session token in the handler. "
    "Every public route has a per-method throttle."
)


def apply(app) -> None:
    for stack in app.node.children:
        name = getattr(stack, "stack_name", "")
        if name.startswith("HealthTrack-Api-"):
            NagSuppressions.add_stack_suppressions(stack, [
                {"id": "AwsSolutions-APIG4", "reason": PUBLIC_BY_DESIGN},
                {"id": "AwsSolutions-COG4", "reason": PUBLIC_BY_DESIGN},
                {"id": "AwsSolutions-APIG3", "reason":
                    "AWS WAF costs $5+/month (web ACL) plus rules, over the $3/month budget. Abuse is limited by "
                    "stage throttling (10 rps) and tighter per-route throttles on every public route."},
                {"id": "AwsSolutions-SQS3", "reason": "This queue IS the dead-letter queue for the push pipeline."},
                {"id": "AwsSolutions-IAM4", "reason":
                    "AWSLambdaBasicExecutionRole / API Gateway CloudWatch role are AWS-managed logging-only policies."},
                {"id": "AwsSolutions-IAM5", "reason":
                    "Wildcards are CDK grant suffixes scoped to one table's indexes (table/X/index/*), one bucket "
                    "prefix (voice-notes/*, i18n/*, drafts/*, doctor-applications/*), KMS GenerateDataKey* on the "
                    "single health-data key, and X-Ray."},
            ])
        if name.startswith("HealthTrack-Auth-"):
            NagSuppressions.add_stack_suppressions(stack, [
                {"id": "AwsSolutions-COG1", "reason":
                    "NIST SP 800-63B: 12-character minimum without composition rules, for low-literacy users."},
                {"id": "AwsSolutions-COG2", "reason":
                    "TOTP MFA is optional in the patient pool (offline-first, shared phones). Doctor/Operator/Admin "
                    "accounts live in the separate staff pool, where TOTP MFA is required."},
                {"id": "AwsSolutions-COG8", "reason":
                    "Cognito Plus (threat protection) is $0.02/MAU, over the $3/month budget at launch."},
                {"id": "AwsSolutions-IAM4", "reason": "AWSLambdaBasicExecutionRole is an AWS-managed logging policy."},
                {"id": "AwsSolutions-IAM5", "reason":
                    "Triggers can't reference their own user pool ARN (circular), so they are scoped to this "
                    "account's pools in us-east-1; plus X-Ray and KMS GenerateDataKey* on the health-data key."},
            ])
        if name.startswith(("HealthTrack-Data-", "HealthTrack-Governance-")):
            NagSuppressions.add_stack_suppressions(stack, [
                {"id": "AwsSolutions-IAM4", "reason": "CDK auto-delete-objects custom resource (dev only)."},
                {"id": "AwsSolutions-IAM5", "reason": "CDK auto-delete-objects custom resource (dev only)."},
                {"id": "AwsSolutions-L1", "reason": "CDK-managed custom resource runtime (auto-delete-objects)."},
                {"id": "AwsSolutions-S1", "reason": "This is the access-log destination bucket; it cannot log to itself."},
            ])
