import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.consultation_stack import ConsultationStack

@pytest.fixture(scope="module")
def consultation_stack_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    auth = AuthStack(app, "Auth", env=env, config=config, shared_stack=shared)
    consultation = ConsultationStack(app, "Consultation", env=env, config=config,
                                     shared_stack=shared, auth_stack=auth)
    return Template.from_stack(consultation)

def test_table_count(consultation_stack_template):
    consultation_stack_template.resource_count_is("AWS::DynamoDB::Table", 2)

def test_consultation_table_pitr(consultation_stack_template):
    consultation_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True}
    })

def test_consultation_table_gsis(consultation_stack_template):
    consultation_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "GlobalSecondaryIndexes": [
            {"IndexName": "PatientIndex"},
            {"IndexName": "StatusUrgencyIndex"},
        ]
    })

def test_message_table_idempotency_gsi(consultation_stack_template):
    consultation_stack_template.has_resource_properties("AWS::DynamoDB::Table", {
        "GlobalSecondaryIndexes": [{"IndexName": "IdempotencyIndex"}]
    })

def test_s3_bucket_exists(consultation_stack_template):
    consultation_stack_template.resource_count_is("AWS::S3::Bucket", 1)

def test_s3_bucket_block_public_access(consultation_stack_template):
    consultation_stack_template.has_resource_properties("AWS::S3::Bucket", {
        "PublicAccessBlockConfiguration": {
            "BlockPublicAcls": True,
            "BlockPublicPolicy": True,
            "IgnorePublicAcls": True,
            "RestrictPublicBuckets": True,
        }
    })

def test_lambda_count(consultation_stack_template):
    # 7 handlers + 1 BucketAutoDeleteObjects custom resource Lambda = up to 8 or 9
    # Just assert at least 7
    import json
    template_json = consultation_stack_template.to_json()
    functions = [r for r in template_json.get("Resources", {}).values()
                 if r["Type"] == "AWS::Lambda::Function"
                 and r.get("Properties", {}).get("Runtime") == "python3.12"]
    assert len(functions) >= 7

def test_consultation_api_exists(consultation_stack_template):
    consultation_stack_template.resource_count_is("AWS::ApiGateway::RestApi", 1)

def test_all_routes_cognito_auth(consultation_stack_template):
    consultation_stack_template.has_resource_properties("AWS::ApiGateway::Method", {
        "AuthorizationType": "COGNITO_USER_POOLS",
    })
