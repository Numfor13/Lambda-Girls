import aws_cdk as cdk
from aws_cdk import Stack, RemovalPolicy, CfnOutput, Duration
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_apigateway as apigateway
from aws_cdk import aws_iam as iam
from constructs import Construct
from .config import Config
from .shared_stack import SharedStack
from .auth_stack import AuthStack


class FacilityStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack) -> None:
        super().__init__(scope, construct_id, env=env)

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # FacilityTable (DynamoDB)
        self.facility_table = dynamodb.Table(self, "FacilityTable",
            table_name=f"HealthTrack-Facilities-{config.env_name}",
            partition_key=dynamodb.Attribute(name="facility_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        # GSI 1: RegionIndex
        self.facility_table.add_global_secondary_index(
            index_name="RegionIndex",
            partition_key=dynamodb.Attribute(name="region", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="facility_id", type=dynamodb.AttributeType.STRING),
        )

        # GSI 2: CapabilityIndex
        self.facility_table.add_global_secondary_index(
            index_name="CapabilityIndex",
            partition_key=dynamodb.Attribute(name="primary_capability", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="facility_id", type=dynamodb.AttributeType.STRING),
        )

        CfnOutput(self, "FacilityTableName",
            value=self.facility_table.table_name,
            export_name=f"HealthTrack-FacilityTableName-{config.env_name}",
        )

        # Reconstruct layer reference from ARN
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayerRef-Facility",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        # Common Lambda config
        lambda_env = {
            "FACILITY_TABLE": self.facility_table.table_name,
            "ENV_NAME": config.env_name,
        }
        lambda_kwargs = dict(
            runtime=lambda_.Runtime.PYTHON_3_12,
            timeout=Duration.seconds(15),
            layers=[common_layer],
            environment=lambda_env,
            code=lambda_.Code.from_asset("health_track/lambdas/facility"),
        )

        # Lambda handlers
        list_facilities_fn = lambda_.Function(self, "ListFacilitiesFn",
            handler="get_facilities.handler",
            **lambda_kwargs,
        )
        get_facility_fn = lambda_.Function(self, "GetFacilityFn",
            handler="get_facility.handler",
            **lambda_kwargs,
        )
        create_facility_fn = lambda_.Function(self, "CreateFacilityFn",
            handler="post_facility.handler",
            **lambda_kwargs,
        )
        update_facility_fn = lambda_.Function(self, "UpdateFacilityFn",
            handler="put_facility.handler",
            **lambda_kwargs,
        )

        # Grant table permissions (read for GET, read+write for POST/PUT)
        for fn in [list_facilities_fn, get_facility_fn]:
            fn.add_to_role_policy(iam.PolicyStatement(
                actions=["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchGetItem"],
                resources=[
                    self.facility_table.table_arn,
                    f"{self.facility_table.table_arn}/index/*",
                ],
            ))
        for fn in [create_facility_fn, update_facility_fn]:
            fn.add_to_role_policy(iam.PolicyStatement(
                actions=[
                    "dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchGetItem",
                    "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem",
                ],
                resources=[
                    self.facility_table.table_arn,
                    f"{self.facility_table.table_arn}/index/*",
                ],
            ))

        # API Gateway
        self.facility_api = apigateway.RestApi(self, "FacilityApi",
            rest_api_name=f"health-track-facility-{config.env_name}",
            cloud_watch_role=True,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization", "Accept-Language"],
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                data_trace_enabled=(config.env_name == "dev"),
            ),
        )

        # Cognito Authorizer for Admin routes
        admin_authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "FacilityAdminAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        # Routes
        facilities = self.facility_api.root.add_resource("facilities")
        facility_item = facilities.add_resource("{facility_id}")

        # GET /facilities — NO AUTH (public)
        facilities.add_method("GET",
            apigateway.LambdaIntegration(list_facilities_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        # GET /facilities/{facility_id} — NO AUTH (public)
        facility_item.add_method("GET",
            apigateway.LambdaIntegration(get_facility_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        # POST /facilities — Admin only
        facilities.add_method("POST",
            apigateway.LambdaIntegration(create_facility_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=admin_authorizer,
        )

        # PUT /facilities/{facility_id} — Admin only
        facility_item.add_method("PUT",
            apigateway.LambdaIntegration(update_facility_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=admin_authorizer,
        )

        CfnOutput(self, "FacilityApiUrl",
            value=self.facility_api.url,
            export_name=f"HealthTrack-FacilityApiUrl-{config.env_name}",
        )
