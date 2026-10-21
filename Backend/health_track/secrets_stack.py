import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct
from health_track.config import Config


class SecretsStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, config: Config, shared_stack=None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.fapshi_api_key = secretsmanager.Secret(self, "FapshiApiKey",
            secret_name=f"/health-track/{config.env_name}/fapshi/api-key",
            description="Fapshi payment gateway API key",
        )

        self.fapshi_webhook_secret = secretsmanager.Secret(self, "FapshiWebhookSecret",
            secret_name=f"/health-track/{config.env_name}/fapshi/webhook-secret",
            description="Fapshi webhook HMAC signing secret",
        )

        self.vapid_private_key = secretsmanager.Secret(self, "VapidPrivateKey",
            secret_name=f"/health-track/{config.env_name}/push/vapid-private-key",
            description="VAPID private key for web push notifications",
        )

        # Alias for compatibility with PushStack
        self.vapid_secret = self.vapid_private_key

        self.telco_credentials = secretsmanager.Secret(self, "TelcoCredentials",
            secret_name=f"/health-track/{config.env_name}/telco/sandbox-credentials",
            description="SMS/USSD sandbox telco credentials (JSON: {api_key, api_url})",
        )

        # CloudFormation Outputs
        CfnOutput(self, "FapshiApiKeyArn",
            value=self.fapshi_api_key.secret_arn,
            export_name=f"HealthTrack-FapshiApiKeyArn-{config.env_name}",
        )

        CfnOutput(self, "FapshiWebhookSecretArn",
            value=self.fapshi_webhook_secret.secret_arn,
            export_name=f"HealthTrack-FapshiWebhookSecretArn-{config.env_name}",
        )

        CfnOutput(self, "VapidPrivateKeyArn",
            value=self.vapid_private_key.secret_arn,
            export_name=f"HealthTrack-VapidPrivateKeyArn-{config.env_name}",
        )

        CfnOutput(self, "TelcoCredentialsArn",
            value=self.telco_credentials.secret_arn,
            export_name=f"HealthTrack-TelcoCredentialsArn-{config.env_name}",
        )

