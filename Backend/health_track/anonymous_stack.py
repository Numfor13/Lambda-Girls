from aws_cdk import (
    Stack, CfnOutput, Duration, RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_apigateway as apigateway,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.secrets_stack import SecretsStack


class AnonymousStack(Stack):
    """Phase 10: anonymous consultation mode.

    Separate, public API (AuthorizationType.NONE): every handler enforces the
    X-Anonymous-Session header itself. Existing Cognito-protected routes are untouched.
    Abuse protection is API Gateway stage throttling (tighter on session minting).
    """

    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 secrets_stack: SecretsStack) -> None:
        super().__init__(scope, construct_id, env=env)

        layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayer", shared_stack.common_layer.layer_version_arn
        )

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # -- AnonymousSessionTable ------------------------------------------------
        self.session_table = dynamodb.Table(
            self, "AnonymousSessionTable",
            table_name=f"HealthTrack-AnonymousSessions-{config.env_name}",
            partition_key=dynamodb.Attribute(name="session_token", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
            time_to_live_attribute="ttl",
        )
        CfnOutput(self, "AnonymousSessionTableNameOutput",
            export_name=f"HealthTrack-AnonymousSessionTableName-{config.env_name}",
            value=self.session_table.table_name,
        )

        # -- Cross-stack tables, referenced by name ---------------------------------
        def _arn(name):
            return f"arn:aws:dynamodb:{config.region}:{config.account}:table/{name}"

        consultation_table = f"HealthTrack-Consultations-{config.env_name}"
        message_table = f"HealthTrack-Messages-{config.env_name}"
        payment_table = f"HealthTrack-Payments-{config.env_name}"
        consultation_arn = _arn(consultation_table)
        message_arn = _arn(message_table)
        payment_arn = _arn(payment_table)

        def _allow(fn, actions, resources):
            fn.add_to_role_policy(iam.PolicyStatement(actions=actions, resources=resources))

        # -- Lambda helpers -------------------------------------------------------
        lambda_dir = "health_track/lambdas/anonymous"

        def _make_fn(cid, handler_name, env_vars):
            return lambda_.Function(
                self, cid,
                runtime=lambda_.Runtime.PYTHON_3_12,
                code=lambda_.Code.from_asset(lambda_dir),
                handler=handler_name,
                memory_size=256,
                timeout=Duration.seconds(30),
                layers=[layer],
                environment={
                    **env_vars,
                    "ANON_SESSION_TABLE": self.session_table.table_name,
                    "ENV_NAME": config.env_name,
                },
            )

        session_arn = self.session_table.table_arn

        post_session_fn = _make_fn("PostSessionFn", "post_session.handler", {})
        _allow(post_session_fn, ["dynamodb:PutItem"], [session_arn])

        post_consultation_fn = _make_fn("PostAnonConsultationFn", "post_consultation.handler", {
            "CONSULTATION_TABLE": consultation_table,
        })
        _allow(post_consultation_fn, ["dynamodb:GetItem"], [session_arn])
        _allow(post_consultation_fn, ["dynamodb:PutItem"], [consultation_arn])

        list_fn = _make_fn("ListAnonConsultationsFn", "list_consultations.handler", {
            "CONSULTATION_TABLE": consultation_table,
        })
        _allow(list_fn, ["dynamodb:GetItem"], [session_arn])
        _allow(list_fn, ["dynamodb:Query"], [f"{consultation_arn}/index/PatientIndex"])

        get_fn = _make_fn("GetAnonConsultationFn", "get_consultation.handler", {
            "CONSULTATION_TABLE": consultation_table,
            "MESSAGE_TABLE": message_table,
        })
        _allow(get_fn, ["dynamodb:GetItem"], [session_arn])
        _allow(get_fn, ["dynamodb:GetItem"], [consultation_arn])
        _allow(get_fn, ["dynamodb:Query"], [message_arn])

        post_message_fn = _make_fn("PostAnonMessageFn", "post_message.handler", {
            "CONSULTATION_TABLE": consultation_table,
            "MESSAGE_TABLE": message_table,
        })
        _allow(post_message_fn, ["dynamodb:GetItem"], [session_arn])
        _allow(post_message_fn, ["dynamodb:GetItem"], [consultation_arn])
        _allow(post_message_fn, ["dynamodb:Query"], [f"{message_arn}/index/IdempotencyIndex"])
        _allow(post_message_fn, ["dynamodb:PutItem"], [message_arn])

        # Fapshi API key: imported by name rather than via secrets_stack.fapshi_api_key.
        # A cross-stack grant_read on the Secret object adds a resource policy on the secret
        # that points back at this role (Secrets <-> Anonymous cycle). Importing by name keeps
        # the grant identity-only. Deploy order is still enforced by add_dependency below.
        fapshi_api_key = secretsmanager.Secret.from_secret_name_v2(
            self, "FapshiApiKeyRef", f"/health-track/{config.env_name}/fapshi/api-key")
        self.add_dependency(secrets_stack)

        initiate_fn = _make_fn("PostAnonPaymentInitiateFn", "post_payment_initiate.handler", {
            "CONSULTATION_TABLE": consultation_table,
            "PAYMENT_TABLE": payment_table,
            # Partial ARN (no random suffix); GetSecretValue accepts it as SecretId
            "FAPSHI_API_KEY_SECRET_ARN": fapshi_api_key.secret_arn,
        })
        _allow(initiate_fn, ["dynamodb:GetItem"], [session_arn])
        _allow(initiate_fn, ["dynamodb:GetItem"], [consultation_arn])
        _allow(initiate_fn, ["dynamodb:PutItem"], [payment_arn])
        fapshi_api_key.grant_read(initiate_fn)

        # -- AnonymousApi (public; handlers enforce the session) --------------------
        api = apigateway.RestApi(
            self, "AnonymousApi",
            rest_api_name=f"health-track-anonymous-{config.env_name}",
            cloud_watch_role=True,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization", "X-Anonymous-Session", "Accept-Language"],
                expose_headers=["Content-Language"],
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                # Never trace request data here: it would log the X-Anonymous-Session header.
                data_trace_enabled=False,
                throttling_rate_limit=20,
                throttling_burst_limit=40,
                method_options={
                    "/anonymous/session/POST": apigateway.MethodDeploymentOptions(
                        throttling_rate_limit=2,
                        throttling_burst_limit=5,
                    ),
                },
            ),
        )
        public = dict(authorization_type=apigateway.AuthorizationType.NONE)

        anonymous_res = api.root.add_resource("anonymous")

        # POST /anonymous/session
        anonymous_res.add_resource("session").add_method(
            "POST", apigateway.LambdaIntegration(post_session_fn), **public)

        # /anonymous/consultations
        consultations_res = anonymous_res.add_resource("consultations")
        consultations_res.add_method("POST", apigateway.LambdaIntegration(post_consultation_fn), **public)
        consultations_res.add_method("GET", apigateway.LambdaIntegration(list_fn), **public)

        # /anonymous/consultations/{consultation_id}
        consultation_item = consultations_res.add_resource("{consultation_id}")
        consultation_item.add_method("GET", apigateway.LambdaIntegration(get_fn), **public)

        # /anonymous/consultations/{consultation_id}/messages
        consultation_item.add_resource("messages").add_method(
            "POST", apigateway.LambdaIntegration(post_message_fn), **public)

        # /anonymous/payments/initiate
        anonymous_res.add_resource("payments").add_resource("initiate").add_method(
            "POST", apigateway.LambdaIntegration(initiate_fn), **public)

        CfnOutput(self, "AnonymousApiUrlOutput",
            export_name=f"HealthTrack-AnonymousApiUrl-{config.env_name}",
            value=api.url,
        )
