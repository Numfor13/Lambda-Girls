from aws_cdk import Stack, RemovalPolicy, CfnOutput, Duration
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_apigateway as apigateway
from constructs import Construct
from .config import Config
from .shared_stack import SharedStack
from .auth_stack import AuthStack


class TriageStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack) -> None:
        super().__init__(scope, construct_id, env=env)

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # TriageResultTable (DynamoDB)
        self.triage_table = dynamodb.Table(self, "TriageResultTable",
            table_name=f"HealthTrack-TriageResults-{config.env_name}",
            partition_key=dynamodb.Attribute(name="result_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="user_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        # GSI: UserIndex — query all results for a given user, newest first
        self.triage_table.add_global_secondary_index(
            index_name="UserIndex",
            partition_key=dynamodb.Attribute(name="user_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="created_at", type=dynamodb.AttributeType.NUMBER),
        )

        CfnOutput(self, "TriageTableName",
            value=self.triage_table.table_name,
            export_name=f"HealthTrack-TriageTableName-{config.env_name}",
        )

        # Shared layer reference
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayerRef-Triage",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        # Common Lambda config
        lambda_env = {
            "TRIAGE_TABLE": self.triage_table.table_name,
            "ENV_NAME": config.env_name,
        }
        lambda_kwargs = dict(
            runtime=lambda_.Runtime.PYTHON_3_12,
            timeout=Duration.seconds(15),
            layers=[common_layer],
            environment=lambda_env,
            code=lambda_.Code.from_asset("health_track/lambdas/triage"),
        )

        # Lambda handlers
        post_triage_fn = lambda_.Function(self, "PostTriageFn",
            handler="post_triage.handler",
            **lambda_kwargs,
        )
        get_triage_result_fn = lambda_.Function(self, "GetTriageResultFn",
            handler="get_triage_result.handler",
            **lambda_kwargs,
        )
        list_triage_results_fn = lambda_.Function(self, "ListTriageResultsFn",
            handler="list_triage_results.handler",
            **lambda_kwargs,
        )

        # Grant table read/write using shared policies
        for fn in [post_triage_fn, get_triage_result_fn, list_triage_results_fn]:
            fn.role.add_managed_policy(shared_stack.dynamo_read_policy)
            fn.role.add_managed_policy(shared_stack.dynamo_write_policy)

        # TriageApi — its own RestApi
        self.triage_api = apigateway.RestApi(self, "TriageApi",
            rest_api_name=f"health-track-triage-{config.env_name}",
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

        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "TriageAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        triage_resource = self.triage_api.root.add_resource("triage")
        triage_item = triage_resource.add_resource("{result_id}")

        # POST /triage
        triage_resource.add_method("POST",
            apigateway.LambdaIntegration(post_triage_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # GET /triage
        triage_resource.add_method("GET",
            apigateway.LambdaIntegration(list_triage_results_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # GET /triage/{result_id}
        triage_item.add_method("GET",
            apigateway.LambdaIntegration(get_triage_result_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        CfnOutput(self, "TriageApiUrl",
            value=self.triage_api.url,
            export_name=f"HealthTrack-TriageApiUrl-{config.env_name}",
        )
