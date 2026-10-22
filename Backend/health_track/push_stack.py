from aws_cdk import (
    Stack, CfnOutput, Duration, RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_lambda as lambda_,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_events as events,
    aws_events_targets as targets,
)
from constructs import Construct
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.secrets_stack import SecretsStack


class PushStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack,
                 secrets_stack: SecretsStack) -> None:
        super().__init__(scope, construct_id, env=env)

        layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayer", shared_stack.common_layer.layer_version_arn
        )

        # -- PushSubscriptionTable ------------------------------------------------
        self.push_subscription_table = dynamodb.Table(
            self, "PushSubscriptionTable",
            table_name=f"HealthTrack-PushSubscriptions-{config.env_name}",
            partition_key=dynamodb.Attribute(name="user_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY,
        )
        CfnOutput(self, "PushSubscriptionTableNameOutput",
            export_name=f"HealthTrack-PushSubscriptionTableName-{config.env_name}",
            value=self.push_subscription_table.table_name,
        )

        _common = {
            "PUSH_SUBSCRIPTION_TABLE": self.push_subscription_table.table_name,
            "VAPID_PUBLIC_KEY":        "TO_BE_SET_POST_DEPLOY",
            "VAPID_PRIVATE_KEY":       "",
            "ENV_NAME":                config.env_name,
        }

        lambda_dir = "health_track/lambdas/push"

        def _make_fn(cid, handler, extra_env=None):
            e = dict(_common)
            if extra_env:
                e.update(extra_env)
            fn = lambda_.Function(
                self, cid,
                runtime=lambda_.Runtime.PYTHON_3_12,
                code=lambda_.Code.from_asset(lambda_dir),
                handler=handler,
                memory_size=256,
                timeout=Duration.seconds(30),
                layers=[layer],
                environment=e,
            )
            fn.add_to_role_policy(iam.PolicyStatement(
                actions=[
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                ],
                resources=[
                    self.push_subscription_table.table_arn,
                    f"{self.push_subscription_table.table_arn}/index/*",
                ],
            ))
            return fn

        vapid_secret_env = {"VAPID_SECRET_ARN": secrets_stack.vapid_secret.secret_arn}

        get_vapid_fn   = _make_fn("GetVapidPublicKeyFn", "get_vapid_public_key.handler")
        subscribe_fn   = _make_fn("PostSubscribeFn",     "post_subscribe.handler")
        unsubscribe_fn = _make_fn("DeleteSubscribeFn",   "delete_subscribe.handler")
        send_fn        = _make_fn("PostSendFn",          "post_send.handler", extra_env=vapid_secret_env)

        # Grant send_fn access to read the VAPID secret
        secrets_stack.vapid_secret.grant_read(send_fn)

        # -- PushApi --------------------------------------------------------------
        push_api = apigateway.RestApi(
            self, "PushApi",
            rest_api_name=f"health-track-push-{config.env_name}",
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
        self.push_api = push_api

        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "PushAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        # GET /push/vapid-public-key  (public)
        push_res = push_api.root.add_resource("push")
        vapid_res = push_res.add_resource("vapid-public-key")
        vapid_res.add_method(
            "GET",
            apigateway.LambdaIntegration(get_vapid_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        # POST /push/subscribe  (cognito)
        subscribe_res = push_res.add_resource("subscribe")
        subscribe_res.add_method(
            "POST",
            apigateway.LambdaIntegration(subscribe_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # DELETE /push/subscribe  (cognito)
        subscribe_res.add_method(
            "DELETE",
            apigateway.LambdaIntegration(unsubscribe_fn),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        CfnOutput(self, "PushApiUrlOutput",
            export_name=f"HealthTrack-PushApiUrl-{config.env_name}",
            value=push_api.url,
        )

        # -- EventBridge rules ----------------------------------------------------
        events.Rule(
            self, "PaymentConfirmedPushRule",
            event_pattern=events.EventPattern(
                source=["health-track"],
                detail_type=["payment.confirmed"],
            ),
            targets=[targets.LambdaFunction(send_fn)],
        )

        events.Rule(
            self, "MessageSentPushRule",
            event_pattern=events.EventPattern(
                source=["health-track"],
                detail_type=["message.sent"],
            ),
            targets=[targets.LambdaFunction(send_fn)],
        )

