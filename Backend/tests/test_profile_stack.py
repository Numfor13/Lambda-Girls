import pytest
import aws_cdk as cdk
from aws_cdk import assertions
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.profile_stack import ProfileStack


@pytest.fixture
def shared_stack(app, config):
    env = cdk.Environment(account=config.account, region=config.region)
    return SharedStack(app, "TestSharedStackForProfile", env=env, config=config)


@pytest.fixture
def auth_stack(app, config, shared_stack):
    env = cdk.Environment(account=config.account, region=config.region)
    return AuthStack(app, "TestAuthStackForProfile", env=env, config=config, shared_stack=shared_stack)


@pytest.fixture
def profile_stack(app, config, shared_stack, auth_stack):
    env = cdk.Environment(account=config.account, region=config.region)
    return ProfileStack(app, "TestProfileStack", env=env, config=config,
                        shared_stack=shared_stack, auth_stack=auth_stack)


@pytest.fixture
def template(profile_stack):
    return assertions.Template.from_stack(profile_stack)


class TestProfileTable:
    def test_dynamodb_table_exists(self, template):
        template.resource_count_is("AWS::DynamoDB::Table", 1)

    def test_table_name(self, template):
        template.has_resource_properties("AWS::DynamoDB::Table", {
            "TableName": "HealthTrack-Profiles-dev",
        })

    def test_partition_key_is_user_id(self, template):
        template.has_resource_properties("AWS::DynamoDB::Table", {
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"},
            ],
        })

    def test_pitr_enabled(self, template):
        template.has_resource_properties("AWS::DynamoDB::Table", {
            "PointInTimeRecoverySpecification": {
                "PointInTimeRecoveryEnabled": True,
            },
        })

    def test_billing_mode_pay_per_request(self, template):
        template.has_resource_properties("AWS::DynamoDB::Table", {
            "BillingMode": "PAY_PER_REQUEST",
        })


class TestApiGateway:
    def test_rest_api_exists(self, template):
        template.resource_count_is("AWS::ApiGateway::RestApi", 1)

    def test_rest_api_name(self, template):
        template.has_resource_properties("AWS::ApiGateway::RestApi", {
            "Name": "health-track-dev",
        })


class TestLambdaFunctions:
    def test_four_lambda_functions_exist(self, template):
        # 4 profile lambdas
        resources = template.find_resources("AWS::Lambda::Function")
        assert len(resources) >= 4

    def test_get_profile_handler(self, template):
        template.has_resource_properties("AWS::Lambda::Function", {
            "Handler": "get_profile.handler",
        })

    def test_put_profile_handler(self, template):
        template.has_resource_properties("AWS::Lambda::Function", {
            "Handler": "put_profile.handler",
        })

    def test_post_household_handler(self, template):
        template.has_resource_properties("AWS::Lambda::Function", {
            "Handler": "post_household.handler",
        })

    def test_delete_household_handler(self, template):
        template.has_resource_properties("AWS::Lambda::Function", {
            "Handler": "delete_household_member.handler",
        })

    def test_all_lambdas_python_312(self, template):
        template.has_resource_properties("AWS::Lambda::Function", {
            "Runtime": "python3.12",
        })


class TestCfnOutputs:
    def test_profile_table_name_output_exists(self, template):
        template.has_output("ProfileTableName", {
            "Export": {
                "Name": "HealthTrack-ProfileTableName-dev",
            },
        })

    def test_api_url_output_exists(self, template):
        template.has_output("ApiUrl", {
            "Export": {
                "Name": "HealthTrack-ApiUrl-dev",
            },
        })


class TestStackProperties:
    def test_profile_table_property_exposed(self, profile_stack):
        assert profile_stack.profile_table is not None

    def test_api_property_exposed(self, profile_stack):
        assert profile_stack.api is not None

    def test_authorizer_property_exposed(self, profile_stack):
        assert profile_stack.authorizer is not None
