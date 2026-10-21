import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_lambda as lambda_,
    aws_apigateway as apigateway,
)
from constructs import Construct
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack


class ProfileStack(Stack):
    def __init__(self, scope: Construct, id: str, *, env, config: Config, shared_stack: SharedStack, auth_stack: AuthStack, **kwargs) -> None:
        super().__init__(scope, id, env=env, **kwargs)

        # ProfileTable (DynamoDB)
        profile_table = dynamodb.Table(self, "ProfileTable",
            table_name=f"HealthTrack-Profiles-{config.env_name}",
            partition_key=dynamodb.Attribute(name="user_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Cognito Authorizer
        authorizer = apigateway.CognitoUserPoolsAuthorizer(self, "CognitoAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
            authorizer_name=f"health-track-authorizer-{config.env_name}",
            identity_source="method.request.header.Authorization",
        )

        # Reconstruct layer reference from ARN to avoid cross-stack export lock (I3)
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayerRef",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        # API Gateway (C3: cloud_watch_role; I2: data_trace_enabled only in dev)
        api = apigateway.RestApi(self, "HealthTrackApi",
            rest_api_name=f"health-track-{config.env_name}",
            description="Health Track API",
            cloud_watch_role=True,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                data_trace_enabled=(config.env_name == "dev"),
            ),
        )

        # Common Lambda config
        lambda_env = {
            "PROFILE_TABLE": profile_table.table_name,
            "ENV_NAME": config.env_name,
        }
        lambda_kwargs = dict(
            runtime=lambda_.Runtime.PYTHON_3_12,
            layers=[common_layer],
            environment=lambda_env,
        )

        # Lambda functions
        get_profile_fn = lambda_.Function(self, "GetProfileFn",
            handler="get_profile.handler",
            code=lambda_.Code.from_asset("health_track/lambdas/profile"),
            **lambda_kwargs,
        )
        put_profile_fn = lambda_.Function(self, "PutProfileFn",
            handler="put_profile.handler",
            code=lambda_.Code.from_asset("health_track/lambdas/profile"),
            **lambda_kwargs,
        )
        post_household_fn = lambda_.Function(self, "PostHouseholdFn",
            handler="post_household.handler",
            code=lambda_.Code.from_asset("health_track/lambdas/profile"),
            **lambda_kwargs,
        )
        delete_household_fn = lambda_.Function(self, "DeleteHouseholdFn",
            handler="delete_household_member.handler",
            code=lambda_.Code.from_asset("health_track/lambdas/profile"),
            **lambda_kwargs,
        )

        # Grant table access to each Lambda
        for fn in [get_profile_fn, put_profile_fn, post_household_fn, delete_household_fn]:
            profile_table.grant_read_write_data(fn)

        # API routes
        profile_resource = api.root.add_resource("profile")
        profile_resource.add_method("GET", apigateway.LambdaIntegration(get_profile_fn),
            authorizer=authorizer, authorization_type=apigateway.AuthorizationType.COGNITO)
        profile_resource.add_method("PUT", apigateway.LambdaIntegration(put_profile_fn),
            authorizer=authorizer, authorization_type=apigateway.AuthorizationType.COGNITO)

        household_resource = profile_resource.add_resource("household")
        household_resource.add_method("POST", apigateway.LambdaIntegration(post_household_fn),
            authorizer=authorizer, authorization_type=apigateway.AuthorizationType.COGNITO)

        member_resource = household_resource.add_resource("{member_id}")
        member_resource.add_method("DELETE", apigateway.LambdaIntegration(delete_household_fn),
            authorizer=authorizer, authorization_type=apigateway.AuthorizationType.COGNITO)

        # Expose properties
        self.profile_table = profile_table
        self.api = api
        self.authorizer = authorizer

        # CloudFormation Outputs
        CfnOutput(self, "ProfileTableName",
            value=profile_table.table_name,
            export_name=f"HealthTrack-ProfileTableName-{config.env_name}",
        )
        CfnOutput(self, "ApiUrl",
            value=api.url,
            export_name=f"HealthTrack-ApiUrl-{config.env_name}",
        )
