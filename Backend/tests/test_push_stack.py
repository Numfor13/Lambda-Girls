import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.secrets_stack import SecretsStack
from health_track.push_stack import PushStack


@pytest.fixture(scope="module")
def push_stack_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    auth   = AuthStack(app, "Auth",   env=env, config=config, shared_stack=shared)
    secrets = SecretsStack(app, "Secrets", env=env, config=config, shared_stack=shared)
    push   = PushStack(app, "Push",   env=env, config=config,
                       shared_stack=shared, auth_stack=auth, secrets_stack=secrets)
    return Template.from_stack(push)


def test_table_count(push_stack_template):
    push_stack_template.resource_count_is("AWS::DynamoDB::Table", 1)


def test_table_pitr(push_stack_template):
    push_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True}
    })


def test_lambda_count(push_stack_template):
    # get_vapid_public_key, post_subscribe, delete_subscribe, post_send = 4 lambdas
    push_stack_template.resource_count_is("AWS::Lambda::Function", 4)


def test_push_api_exists(push_stack_template):
    push_stack_template.resource_count_is("AWS::ApiGateway::RestApi", 1)


def test_public_vapid_route(push_stack_template):
    push_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "GET",
        "AuthorizationType": "NONE",
    })


def test_subscribe_cognito_auth(push_stack_template):
    push_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "POST",
        "AuthorizationType": "COGNITO_USER_POOLS",
    })


def test_eventbridge_rules(push_stack_template):
    push_stack_template.resource_count_is("AWS::Events::Rule", 2)
