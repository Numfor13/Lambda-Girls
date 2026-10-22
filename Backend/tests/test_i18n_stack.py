import aws_cdk as cdk, pytest
from aws_cdk.assertions import Template, Match
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.i18n_stack import I18nStack


def _template(env_name):
    app = cdk.App()
    config = Config(env_name=env_name, account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    stack = I18nStack(app, "I18n", env=env, config=config, shared_stack=shared)
    return Template.from_stack(stack)


@pytest.fixture(scope="module")
def i18n_template():
    return _template("dev")


@pytest.fixture(scope="module")
def i18n_prod_template():
    return _template("prod")


def test_bucket_private_versioned(i18n_template):
    i18n_template.has_resource_properties("AWS::S3::Bucket", {
        "BucketName": "health-track-i18n-123456789012-dev",
        "VersioningConfiguration": {"Status": "Enabled"},
        "PublicAccessBlockConfiguration": {
            "BlockPublicAcls": True, "BlockPublicPolicy": True,
            "IgnorePublicAcls": True, "RestrictPublicBuckets": True,
        },
    })


def test_bucket_enforces_ssl(i18n_template):
    i18n_template.has_resource_properties("AWS::S3::BucketPolicy", {
        "PolicyDocument": {"Statement": Match.array_with([Match.object_like({
            "Effect": "Deny",
            "Action": "s3:*",
            "Condition": {"Bool": {"aws:SecureTransport": "false"}},
        })])},
    })


def test_bucket_destroyed_in_dev(i18n_template):
    buckets = i18n_template.find_resources("AWS::S3::Bucket")
    assert all(b["DeletionPolicy"] == "Delete" for b in buckets.values())
    i18n_template.resource_count_is("Custom::S3AutoDeleteObjects", 1)


def test_bucket_retained_in_prod(i18n_prod_template):
    buckets = i18n_prod_template.find_resources("AWS::S3::Bucket")
    assert all(b["DeletionPolicy"] == "Retain" for b in buckets.values())
    i18n_prod_template.resource_count_is("Custom::S3AutoDeleteObjects", 0)


def test_function(i18n_template):
    i18n_template.has_resource_properties("AWS::Lambda::Function", {
        "Handler": "get_locale.handler",
        "Runtime": "python3.12",
        "Environment": {"Variables": {
            "I18N_BUCKET": Match.any_value(),
            "ENV_NAME": "dev",
        }},
    })


def test_function_read_only_on_i18n_prefix(i18n_template):
    fns = i18n_template.find_resources("AWS::Lambda::Function", {
        "Properties": {"Handler": "get_locale.handler"}})
    role_id = next(iter(fns.values()))["Properties"]["Role"]["Fn::GetAtt"][0]
    actions = set()
    for pol in i18n_template.find_resources("AWS::IAM::Policy").values():
        if {"Ref": role_id} in pol["Properties"]["Roles"]:
            for s in pol["Properties"]["PolicyDocument"]["Statement"]:
                actions.update(s["Action"] if isinstance(s["Action"], list) else [s["Action"]])
    assert "s3:GetObject*" in actions or "s3:GetObject" in actions
    assert not any(a.startswith("s3:Put") or a.startswith("s3:Delete") for a in actions)
    assert not any(a.startswith("dynamodb:") for a in actions)


def test_public_get_route(i18n_template):
    methods = i18n_template.find_resources("AWS::ApiGateway::Method")
    gets = [m["Properties"] for m in methods.values() if m["Properties"]["HttpMethod"] == "GET"]
    assert len(gets) == 1
    assert gets[0]["AuthorizationType"] == "NONE"
    i18n_template.has_resource_properties("AWS::ApiGateway::Resource", {"PathPart": "i18n"})
    i18n_template.has_resource_properties("AWS::ApiGateway::Resource", {"PathPart": "{locale}"})
    i18n_template.resource_count_is("AWS::ApiGateway::Authorizer", 0)


def test_cors_allows_conditional_and_locale_headers(i18n_template):
    methods = i18n_template.find_resources("AWS::ApiGateway::Method")
    options = [m for m in methods.values() if m["Properties"]["HttpMethod"] == "OPTIONS"]
    assert options
    for m in options:
        params = m["Properties"]["Integration"]["IntegrationResponses"][0]["ResponseParameters"]
        allowed = params["method.response.header.Access-Control-Allow-Headers"]
        assert "If-None-Match" in allowed and "Accept-Language" in allowed


def test_outputs(i18n_template):
    exports = {o["Export"]["Name"] for o in i18n_template.find_outputs("*").values() if "Export" in o}
    assert {"HealthTrack-I18nBucketName-dev", "HealthTrack-I18nApiUrl-dev"} <= exports
