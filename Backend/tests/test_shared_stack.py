import pytest
import aws_cdk as cdk
from aws_cdk import assertions
from health_track.shared_stack import SharedStack


@pytest.fixture
def shared_stack(app, config):
    env = cdk.Environment(account=config.account, region=config.region)
    return SharedStack(app, "TestSharedStack", env=env, config=config)


@pytest.fixture
def template(shared_stack):
    return assertions.Template.from_stack(shared_stack)


class TestVpc:
    def test_vpc_exists(self, template):
        template.resource_count_is("AWS::EC2::VPC", 1)

    def test_vpc_has_two_azs(self, shared_stack):
        """VPC is configured with max_azs=2."""
        assert shared_stack.vpc.availability_zones is not None
        # The VPC construct with max_azs=2 creates 4 subnets (2 public + 2 private)
        template = assertions.Template.from_stack(shared_stack)
        template.resource_count_is("AWS::EC2::Subnet", 4)

    def test_vpc_has_public_subnets(self, template):
        template.has_resource_properties("AWS::EC2::Subnet", {
            "MapPublicIpOnLaunch": True,
        })

    def test_vpc_has_nat_gateway(self, template):
        template.resource_count_is("AWS::EC2::NatGateway", 1)


class TestDeploymentBucket:
    def test_s3_bucket_exists(self, template):
        template.resource_count_is("AWS::S3::Bucket", 1)

    def test_s3_bucket_versioning_enabled(self, template):
        template.has_resource_properties("AWS::S3::Bucket", {
            "VersioningConfiguration": {
                "Status": "Enabled",
            },
        })

    def test_s3_bucket_encryption(self, template):
        template.has_resource_properties("AWS::S3::Bucket", {
            "BucketEncryption": {
                "ServerSideEncryptionConfiguration": [
                    {
                        "ServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256",
                        }
                    }
                ]
            },
        })

    def test_s3_bucket_blocks_public_access(self, template):
        template.has_resource_properties("AWS::S3::Bucket", {
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": True,
                "BlockPublicPolicy": True,
                "IgnorePublicAcls": True,
                "RestrictPublicBuckets": True,
            },
        })


class TestLambdaLayer:
    def test_lambda_layer_exists(self, template):
        template.resource_count_is("AWS::Lambda::LayerVersion", 1)

    def test_lambda_layer_targets_python_3_12(self, template):
        template.has_resource_properties("AWS::Lambda::LayerVersion", {
            "CompatibleRuntimes": ["python3.12"],
        })

    def test_lambda_layer_description(self, template):
        template.has_resource_properties("AWS::Lambda::LayerVersion", {
            "Description": assertions.Match.string_like_regexp("Health Track common utilities"),
        })


class TestCloudWatchLogs:
    def test_log_group_exists(self, template):
        template.resource_count_is("AWS::Logs::LogGroup", 1)

    def test_log_group_has_30_day_retention(self, template):
        # RetentionDays.ONE_MONTH = 30
        template.has_resource_properties("AWS::Logs::LogGroup", {
            "RetentionInDays": 30,
        })

    def test_log_group_name(self, template):
        template.has_resource_properties("AWS::Logs::LogGroup", {
            "LogGroupName": "/health-track/dev/api",
        })


class TestIamPolicies:
    def test_four_managed_policies_exist(self, template):
        template.resource_count_is("AWS::IAM::ManagedPolicy", 4)

    def test_dynamo_read_policy_exists(self, template):
        template.has_resource_properties("AWS::IAM::ManagedPolicy", {
            "PolicyDocument": {
                "Statement": [
                    {
                        "Action": [
                            "dynamodb:GetItem",
                            "dynamodb:Query",
                            "dynamodb:Scan",
                            "dynamodb:BatchGetItem",
                        ],
                        "Effect": "Allow",
                        "Resource": assertions.Match.string_like_regexp(r"arn:aws:dynamodb:.*:table/HealthTrack-\*"),
                    }
                ],
            },
        })

    def test_dynamo_write_policy_exists(self, template):
        template.has_resource_properties("AWS::IAM::ManagedPolicy", {
            "PolicyDocument": {
                "Statement": [
                    {
                        "Action": [
                            "dynamodb:PutItem",
                            "dynamodb:UpdateItem",
                            "dynamodb:DeleteItem",
                            "dynamodb:BatchWriteItem",
                        ],
                        "Effect": "Allow",
                        "Resource": assertions.Match.string_like_regexp(r"arn:aws:dynamodb:.*:table/HealthTrack-\*"),
                    }
                ],
            },
        })

    def test_s3_read_policy_exists(self, template):
        template.has_resource_properties("AWS::IAM::ManagedPolicy", {
            "PolicyDocument": {
                "Statement": [
                    {
                        "Action": [
                            "s3:GetObject",
                            "s3:ListBucket",
                        ],
                        "Effect": "Allow",
                        "Resource": assertions.Match.any_value(),
                    }
                ],
            },
        })

    def test_s3_write_policy_exists(self, template):
        template.has_resource_properties("AWS::IAM::ManagedPolicy", {
            "PolicyDocument": {
                "Statement": [
                    {
                        "Action": [
                            "s3:PutObject",
                            "s3:DeleteObject",
                        ],
                        "Effect": "Allow",
                        "Resource": assertions.Match.string_like_regexp(r"arn:aws:s3:::health-track-"),
                    }
                ],
            },
        })


class TestCfnOutputs:
    def test_vpc_id_output_exists(self, template):
        template.has_output("VpcId", {
            "Export": {
                "Name": "HealthTrack-VpcId-dev",
            },
        })

    def test_common_layer_arn_output_exists(self, template):
        template.has_output("CommonLayerArn", {
            "Export": {
                "Name": "HealthTrack-CommonLayerArn-dev",
            },
        })

    def test_deployment_bucket_output_exists(self, template):
        template.has_output("DeploymentBucket", {
            "Export": {
                "Name": "HealthTrack-DeploymentBucket-dev",
            },
        })


class TestStackProperties:
    def test_vpc_property_exposed(self, shared_stack):
        assert shared_stack.vpc is not None

    def test_common_layer_property_exposed(self, shared_stack):
        assert shared_stack.common_layer is not None

    def test_deployment_bucket_property_exposed(self, shared_stack):
        assert shared_stack.deployment_bucket is not None

    def test_dynamo_read_policy_property_exposed(self, shared_stack):
        assert shared_stack.dynamo_read_policy is not None

    def test_dynamo_write_policy_property_exposed(self, shared_stack):
        assert shared_stack.dynamo_write_policy is not None

    def test_s3_read_policy_property_exposed(self, shared_stack):
        assert shared_stack.s3_read_policy is not None

    def test_s3_write_policy_property_exposed(self, shared_stack):
        assert shared_stack.s3_write_policy is not None
