import pytest
import aws_cdk as cdk
from aws_cdk import assertions
from health_track.secrets_stack import SecretsStack


@pytest.fixture
def secrets_stack(app, config):
    env = cdk.Environment(account=config.account, region=config.region)
    return SecretsStack(app, "TestSecretsStack", env=env, config=config)


@pytest.fixture
def template(secrets_stack):
    return assertions.Template.from_stack(secrets_stack)


class TestSecretsExist:
    def test_four_secrets_exist(self, template):
        template.resource_count_is("AWS::SecretsManager::Secret", 4)

    def test_fapshi_api_key_secret_name(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Name": "/health-track/dev/fapshi/api-key",
        })

    def test_fapshi_webhook_secret_name(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Name": "/health-track/dev/fapshi/webhook-secret",
        })

    def test_vapid_private_key_secret_name(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Name": "/health-track/dev/push/vapid-private-key",
        })

    def test_telco_credentials_secret_name(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Name": "/health-track/dev/telco/sandbox-credentials",
        })


class TestSecretDescriptions:
    def test_fapshi_api_key_description(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Description": "Fapshi payment gateway API key",
        })

    def test_fapshi_webhook_secret_description(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Description": "Fapshi webhook HMAC signing secret",
        })

    def test_vapid_private_key_description(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Description": "VAPID private key for web push notifications",
        })

    def test_telco_credentials_description(self, template):
        template.has_resource_properties("AWS::SecretsManager::Secret", {
            "Description": assertions.Match.string_like_regexp("telco credentials"),
        })


class TestCfnOutputs:
    def test_fapshi_api_key_arn_output_exists(self, template):
        template.has_output("FapshiApiKeyArn", {
            "Export": {
                "Name": "HealthTrack-FapshiApiKeyArn-dev",
            },
        })

    def test_fapshi_webhook_secret_arn_output_exists(self, template):
        template.has_output("FapshiWebhookSecretArn", {
            "Export": {
                "Name": "HealthTrack-FapshiWebhookSecretArn-dev",
            },
        })

    def test_vapid_private_key_arn_output_exists(self, template):
        template.has_output("VapidPrivateKeyArn", {
            "Export": {
                "Name": "HealthTrack-VapidPrivateKeyArn-dev",
            },
        })

    def test_telco_credentials_arn_output_exists(self, template):
        template.has_output("TelcoCredentialsArn", {
            "Export": {
                "Name": "HealthTrack-TelcoCredentialsArn-dev",
            },
        })


class TestStackProperties:
    def test_fapshi_api_key_property_exposed(self, secrets_stack):
        assert secrets_stack.fapshi_api_key is not None

    def test_fapshi_webhook_secret_property_exposed(self, secrets_stack):
        assert secrets_stack.fapshi_webhook_secret is not None

    def test_vapid_private_key_property_exposed(self, secrets_stack):
        assert secrets_stack.vapid_private_key is not None

    def test_telco_credentials_property_exposed(self, secrets_stack):
        assert secrets_stack.telco_credentials is not None
