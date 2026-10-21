from aws_cdk import (
    Stack, CfnOutput, Duration, RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_lambda as lambda_,
    aws_apigateway as apigateway,
)
from constructs import Construct
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack


class ChannelStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack) -> None:
        super().__init__(scope, construct_id, env=env)

        layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayer", shared_stack.common_layer.layer_version_arn
        )

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # -- SessionTable ---------------------------------------------------------
        self.session_table = dynamodb.Table(
            self, "SessionTable",
            table_name=f"HealthTrack-Sessions-{config.env_name}",
            partition_key=dynamodb.Attribute(name="session_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
            time_to_live_attribute="ttl",
        )
        CfnOutput(self, "SessionTableNameOutput",
            export_name=f"HealthTrack-SessionTableName-{config.env_name}",
            value=self.session_table.table_name,
        )

        # -- CallbackRequestTable -------------------------------------------------
        self.callback_table = dynamodb.Table(
            self, "CallbackRequestTable",
            table_name=f"HealthTrack-CallbackRequests-{config.env_name}",
            partition_key=dynamodb.Attribute(name="request_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )
        self.callback_table.add_global_secondary_index(
            index_name="UrgencyIndex",
            partition_key=dynamodb.Attribute(name="status", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="created_at", type=dynamodb.AttributeType.NUMBER),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        CfnOutput(self, "CallbackRequestTableNameOutput",
            export_name=f"HealthTrack-CallbackRequestTableName-{config.env_name}",
            value=self.callback_table.table_name,
        )

        # -- DispatchLogTable -----------------------------------------------------
        self.dispatch_log_table = dynamodb.Table(
            self, "DispatchLogTable",
            table_name=f"HealthTrack-DispatchLogs-{config.env_name}",
            partition_key=dynamodb.Attribute(name="log_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        # -- Lambda helpers -------------------------------------------------------
        lambda_dir = "health_track/lambdas/channel"

        def _make_fn(cid, handler_name, env_vars):
            return lambda_.Function(
                self, cid,
                runtime=lambda_.Runtime.PYTHON_3_12,
                code=lambda_.Code.from_asset(lambda_dir),
                handler=handler_name,
                memory_size=256,
                timeout=Duration.seconds(30),
                layers=[layer],
                environment=env_vars,
            )

        # SMS webhook (public)
        post_sms_fn = _make_fn("PostSmsFn", "post_sms.handler", {
            "SESSION_TABLE":  self.session_table.table_name,
            "CALLBACK_TABLE": self.callback_table.table_name,
            "ENV_NAME":       config.env_name,
        })
        self.session_table.grant_read_write_data(post_sms_fn)
        self.callback_table.grant_read_write_data(post_sms_fn)

        # USSD webhook (public)
        post_ussd_fn = _make_fn("PostUssdFn", "post_ussd.handler", {
            "SESSION_TABLE":  self.session_table.table_name,
            "CALLBACK_TABLE": self.callback_table.table_name,
            "ENV_NAME":       config.env_name,
        })
        self.session_table.grant_read_write_data(post_ussd_fn)
        self.callback_table.grant_read_write_data(post_ussd_fn)

        # Operator: list callbacks
        get_callbacks_fn = _make_fn("GetCallbacksFn", "get_callbacks.handler", {
            "CALLBACK_TABLE": self.callback_table.table_name,
            "ENV_NAME":       config.env_name,
        })
        self.callback_table.grant_read_write_data(get_callbacks_fn)

        # Operator: mark callback handled
        put_callback_handle_fn = _make_fn("PutCallbackHandleFn", "put_callback_handle.handler", {
            "CALLBACK_TABLE": self.callback_table.table_name,
            "ENV_NAME":       config.env_name,
        })
        self.callback_table.grant_read_write_data(put_callback_handle_fn)

        # Operator: dispatch log
        post_dispatch_log_fn = _make_fn("PostDispatchLogFn", "post_dispatch_log.handler", {
            "DISPATCH_LOG_TABLE": self.dispatch_log_table.table_name,
            "ENV_NAME":           config.env_name,
        })
        self.dispatch_log_table.grant_read_write_data(post_dispatch_log_fn)

        # -- ChannelApi -----------------------------------------------------------
        channel_api = apigateway.RestApi(
            self, "ChannelApi",
            rest_api_name=f"health-track-channel-{config.env_name}",
            cloud_watch_role=True,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                data_trace_enabled=(config.env_name == "dev"),
            ),
        )

        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "ChannelAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        # POST /channels/sms  (public webhook)
        channels_res = channel_api.root.add_resource("channels")
        sms_res = channels_res.add_resource("sms")
        sms_res.add_method(
            "POST",
            apigateway.LambdaIntegration(post_sms_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        # POST /channels/ussd  (public webhook)
        ussd_res = channels_res.add_resource("ussd")
        ussd_res.add_method(
            "POST",
            apigateway.LambdaIntegration(post_ussd_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        # GET /operator/callbacks  (Cognito)
        operator_res = channel_api.root.add_resource("operator")
        callbacks_res = operator_res.add_resource("callbacks")
        callbacks_res.add_method(
            "GET",
            apigateway.LambdaIntegration(get_callbacks_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # PUT /operator/callbacks/{request_id}/handle  (Cognito)
        callback_item_res = callbacks_res.add_resource("{request_id}")
        handle_res = callback_item_res.add_resource("handle")
        handle_res.add_method(
            "PUT",
            apigateway.LambdaIntegration(put_callback_handle_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # POST /operator/dispatch-log  (Cognito)
        dispatch_log_res = operator_res.add_resource("dispatch-log")
        dispatch_log_res.add_method(
            "POST",
            apigateway.LambdaIntegration(post_dispatch_log_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        CfnOutput(self, "ChannelApiUrlOutput",
            export_name=f"HealthTrack-ChannelApiUrl-{config.env_name}",
            value=channel_api.url,
        )
