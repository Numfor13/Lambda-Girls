import pytest
import aws_cdk as cdk
from aws_cdk import assertions
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack


@pytest.fixture
def shared_stack(app, config):
    env = cdk.Environment(account=config.account, region=config.region)
    return SharedStack(app, "TestSharedStackForAuth", env=env, config=config)


@pytest.fixture
def auth_stack(app, config, shared_stack):
    env = cdk.Environment(account=config.account, region=config.region)
    return AuthStack(app, "TestAuthStack", env=env, config=config, shared_stack=shared_stack)


@pytest.fixture
def template(auth_stack):
    return assertions.Template.from_stack(auth_stack)


class TestUserPool:
    def test_user_pool_exists(self, template):
        template.resource_count_is("AWS::Cognito::UserPool", 1)

    def test_user_pool_name(self, template):
        template.has_resource_properties("AWS::Cognito::UserPool", {
            "UserPoolName": "health-track-dev",
        })

    def test_user_pool_self_sign_up_enabled(self, template):
        template.has_resource_properties("AWS::Cognito::UserPool", {
            "AdminCreateUserConfig": {
                "AllowAdminCreateUserOnly": False,
            },
        })

    def test_pre_signup_trigger_wired(self, template):
        template.has_resource_properties("AWS::Cognito::UserPool", {
            "LambdaConfig": assertions.Match.object_like({
                "PreSignUp": assertions.Match.any_value(),
            }),
        })

    def test_post_confirmation_trigger_wired(self, template):
        template.has_resource_properties("AWS::Cognito::UserPool", {
            "LambdaConfig": assertions.Match.object_like({
                "PostConfirmation": assertions.Match.any_value(),
            }),
        })


class TestUserPoolGroups:
    def test_four_groups_exist(self, template):
        template.resource_count_is("AWS::Cognito::UserPoolGroup", 4)

    def test_patient_group_exists(self, template):
        template.has_resource_properties("AWS::Cognito::UserPoolGroup", {
            "GroupName": "Patient",
        })

    def test_doctor_group_exists(self, template):
        template.has_resource_properties("AWS::Cognito::UserPoolGroup", {
            "GroupName": "Doctor",
        })

    def test_operator_group_exists(self, template):
        template.has_resource_properties("AWS::Cognito::UserPoolGroup", {
            "GroupName": "Operator",
        })

    def test_admin_group_exists(self, template):
        template.has_resource_properties("AWS::Cognito::UserPoolGroup", {
            "GroupName": "Admin",
        })


class TestAppClient:
    def test_app_client_exists(self, template):
        template.resource_count_is("AWS::Cognito::UserPoolClient", 1)

    def test_app_client_allow_user_srp_auth(self, template):
        template.has_resource_properties("AWS::Cognito::UserPoolClient", {
            "ExplicitAuthFlows": assertions.Match.array_with(["ALLOW_USER_SRP_AUTH"]),
        })

    def test_app_client_no_secret(self, template):
        template.has_resource_properties("AWS::Cognito::UserPoolClient", {
            "GenerateSecret": False,
        })


class TestCognitoDomain:
    def test_domain_exists(self, template):
        template.resource_count_is("AWS::Cognito::UserPoolDomain", 1)

    def test_domain_prefix(self, template):
        template.has_resource_properties("AWS::Cognito::UserPoolDomain", {
            "Domain": "health-track-dev",
        })


class TestCfnOutputs:
    def test_user_pool_id_output_exists(self, template):
        template.has_output("UserPoolId", {
            "Export": {
                "Name": "HealthTrack-UserPoolId-dev",
            },
        })

    def test_app_client_id_output_exists(self, template):
        template.has_output("AppClientId", {
            "Export": {
                "Name": "HealthTrack-AppClientId-dev",
            },
        })

    def test_hosted_ui_domain_output_exists(self, template):
        template.has_output("HostedUiDomain", {
            "Export": {
                "Name": "HealthTrack-HostedUiDomain-dev",
            },
        })


class TestStackProperties:
    def test_user_pool_property_exposed(self, auth_stack):
        assert auth_stack.user_pool is not None

    def test_app_client_property_exposed(self, auth_stack):
        assert auth_stack.app_client is not None

    def test_domain_property_exposed(self, auth_stack):
        assert auth_stack.domain is not None

    def test_pre_signup_fn_property_exposed(self, auth_stack):
        assert auth_stack.pre_signup_fn is not None

    def test_post_confirmation_fn_property_exposed(self, auth_stack):
        assert auth_stack.post_confirmation_fn is not None
