import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.doctor_stack import DoctorStack


@pytest.fixture(scope="module")
def doctor_stack_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    auth = AuthStack(app, "Auth", env=env, config=config, shared_stack=shared)
    doctor = DoctorStack(app, "Doctor", env=env, config=config,
                         shared_stack=shared, auth_stack=auth)
    return Template.from_stack(doctor)


def test_table_count(doctor_stack_template):
    doctor_stack_template.resource_count_is("AWS::DynamoDB::Table", 2)


def test_prescription_table_pitr(doctor_stack_template):
    doctor_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True}
    })


def test_lambda_count(doctor_stack_template):
    doctor_stack_template.resource_count_is("AWS::Lambda::Function", 8)


def test_all_lambdas_python_312(doctor_stack_template):
    doctor_stack_template.has_resource_properties("AWS::Lambda::Function", {
        "Runtime": "python3.12"
    })


def test_doctor_api_exists(doctor_stack_template):
    doctor_stack_template.resource_count_is("AWS::ApiGateway::RestApi", 1)


def test_public_lookup_routes_no_auth(doctor_stack_template):
    doctor_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "GET",
        "AuthorizationType": "NONE",
    })


def test_doctor_queue_route_cognito_auth(doctor_stack_template):
    doctor_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "GET",
        "AuthorizationType": "COGNITO_USER_POOLS",
    })
