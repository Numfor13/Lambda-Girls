from aws_cdk import Stack, RemovalPolicy, CfnOutput, Duration
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_apigateway as apigateway
from aws_cdk import aws_iam as iam
from constructs import Construct
from .config import Config
from .shared_stack import SharedStack
from .auth_stack import AuthStack
from .secrets_stack import SecretsStack


class PaymentStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack,
                 secrets_stack: SecretsStack) -> None:
        super().__init__(scope, construct_id, env=env)

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # ─── DynamoDB: PaymentTable ────────────────────────────────────────
        self.payment_table = dynamodb.Table(self, "PaymentTable",
            table_name=f"HealthTrack-Payments-{config.env_name}",
            partition_key=dynamodb.Attribute(name="payment_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        self.payment_table.add_global_secondary_index(
            index_name="ConsultationIndex",
            partition_key=dynamodb.Attribute(name="consultation_id", type=dynamodb.AttributeType.STRING),
        )

        self.payment_table.add_global_secondary_index(
            index_name="PayerIndex",
            partition_key=dynamodb.Attribute(name="payer_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="created_at", type=dynamodb.AttributeType.NUMBER),
        )

        CfnOutput(self, "PaymentTableName",
            value=self.payment_table.table_name,
            export_name=f"HealthTrack-PaymentTableName-{config.env_name}",
        )

        # ─── Shared layer ──────────────────────────────────────────────────
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayerRef-Payment",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        consultation_table_name = f"HealthTrack-Consultations-{config.env_name}"

        # ─── Lambda helpers ────────────────────────────────────────────────
        base_kwargs = dict(
            runtime=lambda_.Runtime.PYTHON_3_12,
            timeout=Duration.seconds(15),
            layers=[common_layer],
            code=lambda_.Code.from_asset("health_track/lambdas/payment"),
        )

        def make_fn(construct_id, handler_name, env_vars):
            return lambda_.Function(self, construct_id,
                handler=handler_name,
                environment=env_vars,
                **base_kwargs,
            )

        initiate_fn = make_fn("PostInitiateFn", "post_initiate.handler", {
            "PAYMENT_TABLE": self.payment_table.table_name,
            "CONSULTATION_TABLE": consultation_table_name,
            "FAPSHI_API_KEY_SECRET_ARN": secrets_stack.fapshi_api_key.secret_arn,
            "ENV_NAME": config.env_name,
        })

        webhook_fn = make_fn("PostWebhookFn", "post_webhook.handler", {
            "PAYMENT_TABLE": self.payment_table.table_name,
            "CONSULTATION_TABLE": consultation_table_name,
            "FAPSHI_WEBHOOK_SECRET_ARN": secrets_stack.fapshi_webhook_secret.secret_arn,
            "ENV_NAME": config.env_name,
        })

        list_fn = make_fn("ListPaymentsFn", "list_payments.handler", {
            "PAYMENT_TABLE": self.payment_table.table_name,
            "ENV_NAME": config.env_name,
        })

        get_fn = make_fn("GetPaymentFn", "get_payment.handler", {
            "PAYMENT_TABLE": self.payment_table.table_name,
            "ENV_NAME": config.env_name,
        })

        # ─── IAM grants ───────────────────────────────────────────────────
        # Payment table access
        for fn in [initiate_fn, webhook_fn, list_fn, get_fn]:
            fn.role.add_managed_policy(shared_stack.dynamo_read_policy)
            fn.role.add_managed_policy(shared_stack.dynamo_write_policy)

        # Secrets Manager access
        secrets_stack.fapshi_api_key.grant_read(initiate_fn)
        secrets_stack.fapshi_webhook_secret.grant_read(webhook_fn)

        # Consultation table IAM policies
        consultation_table_arn = (
            f"arn:aws:dynamodb:{Stack.of(self).region}:{Stack.of(self).account}"
            f":table/{consultation_table_name}"
        )
        initiate_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["dynamodb:GetItem"],
            resources=[consultation_table_arn],
        ))
        webhook_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["dynamodb:UpdateItem", "dynamodb:Scan"],
            resources=[consultation_table_arn],
        ))

        # ─── API Gateway ───────────────────────────────────────────────────
        self.payment_api = apigateway.RestApi(self, "PaymentApi",
            rest_api_name=f"health-track-payment-{config.env_name}",
            cloud_watch_role=True,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization", "x-fapshi-signature", "Accept-Language"],
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                data_trace_enabled=(config.env_name == "dev"),
            ),
        )

        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "PaymentAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        auth_opts = dict(
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # /payments
        payments_res = self.payment_api.root.add_resource("payments")
        payments_res.add_method("GET", apigateway.LambdaIntegration(list_fn), **auth_opts)

        # /payments/initiate
        initiate_res = payments_res.add_resource("initiate")
        initiate_res.add_method("POST", apigateway.LambdaIntegration(initiate_fn), **auth_opts)

        # /payments/webhook  (no auth)
        webhook_res = payments_res.add_resource("webhook")
        webhook_res.add_method("POST", apigateway.LambdaIntegration(webhook_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        # /payments/{payment_id}
        payment_item = payments_res.add_resource("{payment_id}")
        payment_item.add_method("GET", apigateway.LambdaIntegration(get_fn), **auth_opts)

        CfnOutput(self, "PaymentApiUrl",
            value=self.payment_api.url,
            export_name=f"HealthTrack-PaymentApiUrl-{config.env_name}",
        )
