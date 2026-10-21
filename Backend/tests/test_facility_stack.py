import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.facility_stack import FacilityStack


@pytest.fixture(scope="module")
def facility_stack_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    auth = AuthStack(app, "Auth", env=env, config=config, shared_stack=shared)
    facility = FacilityStack(app, "Facility", env=env, config=config,
                             shared_stack=shared, auth_stack=auth)
    return Template.from_stack(facility)


def test_facility_table_exists(facility_stack_template):
    facility_stack_template.resource_count_is("AWS::DynamoDB::Table", 1)


def test_facility_table_pitr(facility_stack_template):
    facility_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True}
    })


def test_facility_table_deletion_policy(facility_stack_template):
    facility_stack_template.has_resource("AWS::DynamoDB::Table", {
        "DeletionPolicy": "Delete"  # dev env
    })


def test_facility_table_gsis(facility_stack_template):
    facility_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "GlobalSecondaryIndexes": [
            {"IndexName": "RegionIndex"},
            {"IndexName": "CapabilityIndex"},
        ]
    })


def test_lambda_count(facility_stack_template):
    facility_stack_template.resource_count_is("AWS::Lambda::Function", 4)


def test_all_lambdas_python_312(facility_stack_template):
    facility_stack_template.has_resource_properties("AWS::Lambda::Function", {
        "Runtime": "python3.12"
    })


def test_facility_api_exists(facility_stack_template):
    facility_stack_template.resource_count_is("AWS::ApiGateway::RestApi", 1)


def test_public_get_no_auth(facility_stack_template):
    # GET /facilities and GET /facilities/{id} must have NONE authorization
    facility_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "GET",
        "AuthorizationType": "NONE",
    })
