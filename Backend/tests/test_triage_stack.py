import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.triage_stack import TriageStack

@pytest.fixture(scope="module")
def triage_stack_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    auth = AuthStack(app, "Auth", env=env, config=config, shared_stack=shared)
    triage = TriageStack(app, "Triage", env=env, config=config,
                         shared_stack=shared, auth_stack=auth)
    return Template.from_stack(triage)

def test_triage_table_exists(triage_stack_template):
    triage_stack_template.resource_count_is("AWS::DynamoDB::Table", 1)

def test_triage_table_pitr(triage_stack_template):
    triage_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True}
    })

def test_triage_table_deletion_policy(triage_stack_template):
    triage_stack_template.has_resource("AWS::DynamoDB::Table", {
        "DeletionPolicy": "Delete"
    })

def test_triage_table_gsi(triage_stack_template):
    triage_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "GlobalSecondaryIndexes": [{"IndexName": "UserIndex"}]
    })

def test_lambda_count(triage_stack_template):
    triage_stack_template.resource_count_is("AWS::Lambda::Function", 3)

def test_all_lambdas_python_312(triage_stack_template):
    triage_stack_template.has_resource_properties("AWS::Lambda::Function", {
        "Runtime": "python3.12"
    })

def test_triage_api_exists(triage_stack_template):
    triage_stack_template.resource_count_is("AWS::ApiGateway::RestApi", 1)

def test_all_triage_routes_cognito_auth(triage_stack_template):
    triage_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "AuthorizationType": "COGNITO_USER_POOLS",
    })
