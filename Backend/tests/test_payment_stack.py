import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.secrets_stack import SecretsStack
from health_track.auth_stack import AuthStack
from health_track.payment_stack import PaymentStack

@pytest.fixture(scope="module")
def payment_stack_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    secrets = SecretsStack(app, "Secrets", env=env, config=config)
    auth = AuthStack(app, "Auth", env=env, config=config, shared_stack=shared)
    payment = PaymentStack(app, "Payment", env=env, config=config,
                           shared_stack=shared, auth_stack=auth, secrets_stack=secrets)
    return Template.from_stack(payment)

def test_payment_table_exists(payment_stack_template):
    payment_stack_template.resource_count_is("AWS::DynamoDB::Table", 1)

def test_payment_table_pitr(payment_stack_template):
    payment_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True}
    })

def test_payment_table_gsis(payment_stack_template):
    payment_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "GlobalSecondaryIndexes": [
            {"IndexName": "ConsultationIndex"},
            {"IndexName": "PayerIndex"},
        ]
    })

def test_lambda_count(payment_stack_template):
    payment_stack_template.resource_count_is("AWS::Lambda::Function", 4)

def test_all_lambdas_python_312(payment_stack_template):
    payment_stack_template.has_resource_properties("AWS::Lambda::Function", {
        "Runtime": "python3.12"
    })

def test_payment_api_exists(payment_stack_template):
    payment_stack_template.resource_count_is("AWS::ApiGateway::RestApi", 1)

def test_webhook_has_no_auth(payment_stack_template):
    payment_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "POST",
        "AuthorizationType": "NONE",
    })

def test_initiate_has_cognito_auth(payment_stack_template):
    payment_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "POST",
        "AuthorizationType": "COGNITO_USER_POOLS",
    })
