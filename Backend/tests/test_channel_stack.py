import aws_cdk as cdk, pytest
from aws_cdk.assertions import Template
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.channel_stack import ChannelStack


@pytest.fixture(scope="module")
def channel_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    auth   = AuthStack(app, "Auth",   env=env, config=config, shared_stack=shared)
    stack  = ChannelStack(app, "Channel", env=env, config=config,
                          shared_stack=shared, auth_stack=auth)
    return Template.from_stack(stack)


def test_table_count(channel_template):
    channel_template.resource_count_is("AWS::DynamoDB::Table", 3)


def test_session_table_ttl(channel_template):
    channel_template.has_resource_properties("AWS::DynamoDB::Table", {
        "TimeToLiveSpecification": {"AttributeName": "ttl", "Enabled": True}
    })


def test_lambda_count(channel_template):
    # post_sms, post_ussd, get_callbacks, put_callback_handle, post_dispatch_log = 5
    channel_template.resource_count_is("AWS::Lambda::Function", 5)


def test_channel_api_exists(channel_template):
    channel_template.resource_count_is("AWS::ApiGateway::RestApi", 1)


def test_public_sms_webhook(channel_template):
    channel_template.has_resource_properties("AWS::ApiGateway::Method", {
        "HttpMethod": "POST",
        "AuthorizationType": "NONE",
    })
