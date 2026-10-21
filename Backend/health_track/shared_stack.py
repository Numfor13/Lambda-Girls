import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    aws_ec2 as ec2,
    aws_s3 as s3,
    aws_lambda as lambda_,
    aws_logs as logs,
    aws_iam as iam,
)
from constructs import Construct
from health_track.config import Config


class SharedStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, config: Config, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # VPC with public and private subnets
        self.vpc = ec2.Vpc(self, "Vpc",
            max_azs=2,
            nat_gateways=1,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name="Private",
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24,
                ),
            ],
        )

        # S3 Deployment Bucket
        self.deployment_bucket = s3.Bucket(self, "DeployBucket",
            versioned=True,
            removal_policy=RemovalPolicy.RETAIN,
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
        )

        # Shared Lambda Layer
        self.common_layer = lambda_.LayerVersion(self, "CommonLayer",
            code=lambda_.Code.from_asset("lambda_layers/common"),
            compatible_runtimes=[lambda_.Runtime.PYTHON_3_12],
            description="Health Track common utilities: response helpers, error classes, JWT decode util",
        )

        # CloudWatch Log Group (30-day retention)
        logs.LogGroup(self, "ApiLogs",
            log_group_name=f"/health-track/{config.env_name}/api",
            retention=logs.RetentionDays.ONE_MONTH,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # IAM Managed Policies
        self.dynamo_read_policy = iam.ManagedPolicy(self, "DynamoReadPolicy",
            statements=[
                iam.PolicyStatement(
                    actions=[
                        "dynamodb:GetItem",
                        "dynamodb:Query",
                        "dynamodb:Scan",
                        "dynamodb:BatchGetItem",
                    ],
                    resources=["*"],
                )
            ],
        )

        self.dynamo_write_policy = iam.ManagedPolicy(self, "DynamoWritePolicy",
            statements=[
                iam.PolicyStatement(
                    actions=[
                        "dynamodb:PutItem",
                        "dynamodb:UpdateItem",
                        "dynamodb:DeleteItem",
                        "dynamodb:BatchWriteItem",
                    ],
                    resources=["*"],
                )
            ],
        )

        self.s3_read_policy = iam.ManagedPolicy(self, "S3ReadPolicy",
            statements=[
                iam.PolicyStatement(
                    actions=[
                        "s3:GetObject",
                        "s3:ListBucket",
                    ],
                    resources=["*"],
                )
            ],
        )

        self.s3_write_policy = iam.ManagedPolicy(self, "S3WritePolicy",
            statements=[
                iam.PolicyStatement(
                    actions=[
                        "s3:PutObject",
                        "s3:DeleteObject",
                    ],
                    resources=["*"],
                )
            ],
        )

        # CloudFormation Outputs
        CfnOutput(self, "VpcId",
            value=self.vpc.vpc_id,
            export_name=f"HealthTrack-VpcId-{config.env_name}",
        )

        CfnOutput(self, "CommonLayerArn",
            value=self.common_layer.layer_version_arn,
            export_name=f"HealthTrack-CommonLayerArn-{config.env_name}",
        )

        CfnOutput(self, "DeploymentBucket",
            value=self.deployment_bucket.bucket_name,
            export_name=f"HealthTrack-DeploymentBucket-{config.env_name}",
        )
