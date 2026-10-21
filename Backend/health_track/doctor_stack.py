from aws_cdk import Stack, RemovalPolicy, CfnOutput, Duration
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_apigateway as apigateway
from aws_cdk import aws_iam as iam
from constructs import Construct
from .config import Config
from .shared_stack import SharedStack
from .auth_stack import AuthStack


class DoctorStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack) -> None:
        super().__init__(scope, construct_id, env=env)

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # ─── DynamoDB: PrescriptionTable ──────────────────────────────────
        self.prescription_table = dynamodb.Table(self, "PrescriptionTable",
            table_name=f"HealthTrack-Prescriptions-{config.env_name}",
            partition_key=dynamodb.Attribute(name="code", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        CfnOutput(self, "PrescriptionTableName",
            value=self.prescription_table.table_name,
            export_name=f"HealthTrack-PrescriptionTableName-{config.env_name}",
        )

        # ─── DynamoDB: ReferralTable ───────────────────────────────────────
        self.referral_table = dynamodb.Table(self, "ReferralTable",
            table_name=f"HealthTrack-Referrals-{config.env_name}",
            partition_key=dynamodb.Attribute(name="code", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        CfnOutput(self, "ReferralTableName",
            value=self.referral_table.table_name,
            export_name=f"HealthTrack-ReferralTableName-{config.env_name}",
        )

        # ─── Shared layer ──────────────────────────────────────────────────
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayer",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        # ─── Cross-stack table name patterns ──────────────────────────────
        consultation_table_name = f"HealthTrack-Consultations-{config.env_name}"
        message_table_name = f"HealthTrack-Messages-{config.env_name}"
        triage_table_name = f"HealthTrack-TriageResults-{config.env_name}"

        # ─── Lambda helpers ────────────────────────────────────────────────
        base_kwargs = dict(
            runtime=lambda_.Runtime.PYTHON_3_12,
            memory_size=256,
            timeout=Duration.seconds(30),
            layers=[common_layer],
            code=lambda_.Code.from_asset("health_track/lambdas/doctor"),
        )

        def make_fn(construct_id, handler_name, env_vars):
            return lambda_.Function(self, construct_id,
                handler=handler_name,
                environment=env_vars,
                **base_kwargs,
            )

        get_queue_fn = make_fn("GetQueueFn", "get_queue.handler", {
            "CONSULTATION_TABLE": consultation_table_name,
            "ENV_NAME": config.env_name,
        })

        claim_fn = make_fn("ClaimConsultationFn", "claim_consultation.handler", {
            "CONSULTATION_TABLE": consultation_table_name,
            "ENV_NAME": config.env_name,
        })

        get_case_fn = make_fn("GetCaseFn", "get_case.handler", {
            "CONSULTATION_TABLE": consultation_table_name,
            "MESSAGE_TABLE": message_table_name,
            "TRIAGE_TABLE": triage_table_name,
            "ENV_NAME": config.env_name,
        })

        close_fn = make_fn("CloseConsultationFn", "close_consultation.handler", {
            "CONSULTATION_TABLE": consultation_table_name,
            "ENV_NAME": config.env_name,
        })

        post_prescription_fn = make_fn("PostPrescriptionFn", "post_prescription.handler", {
            "PRESCRIPTION_TABLE": self.prescription_table.table_name,
            "CONSULTATION_TABLE": consultation_table_name,
            "ENV_NAME": config.env_name,
        })

        get_prescription_fn = make_fn("GetPrescriptionFn", "get_prescription.handler", {
            "PRESCRIPTION_TABLE": self.prescription_table.table_name,
            "ENV_NAME": config.env_name,
        })

        post_referral_fn = make_fn("PostReferralFn", "post_referral.handler", {
            "REFERRAL_TABLE": self.referral_table.table_name,
            "CONSULTATION_TABLE": consultation_table_name,
            "ENV_NAME": config.env_name,
        })

        get_referral_fn = make_fn("GetReferralFn", "get_referral.handler", {
            "REFERRAL_TABLE": self.referral_table.table_name,
            "ENV_NAME": config.env_name,
        })

        # ─── IAM grants ───────────────────────────────────────────────────
        # Own tables: grant directly
        self.prescription_table.grant_read_write_data(post_prescription_fn)
        self.prescription_table.grant_read_data(get_prescription_fn)
        self.referral_table.grant_read_write_data(post_referral_fn)
        self.referral_table.grant_read_data(get_referral_fn)

        # Cross-stack tables: inline policy for HealthTrack-* pattern
        cross_stack_policy = iam.PolicyStatement(
            actions=[
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:Query",
                "dynamodb:Scan",
            ],
            resources=[f"arn:aws:dynamodb:{config.region}:{config.account}:table/HealthTrack-*"],
        )

        for fn in [get_queue_fn, claim_fn, get_case_fn, close_fn,
                   post_prescription_fn, post_referral_fn]:
            fn.add_to_role_policy(cross_stack_policy)

        # ─── API Gateway ───────────────────────────────────────────────────
        self.doctor_api = apigateway.RestApi(self, "DoctorApi",
            rest_api_name=f"health-track-doctor-{config.env_name}",
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
            self, "DoctorAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        auth_opts = dict(
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # /doctor
        doctor_res = self.doctor_api.root.add_resource("doctor")
        # /doctor/queue
        queue_res = doctor_res.add_resource("queue")
        queue_res.add_method("GET", apigateway.LambdaIntegration(get_queue_fn), **auth_opts)

        # /doctor/queue/{consultation_id}
        queue_item = queue_res.add_resource("{consultation_id}")
        queue_item.add_method("GET", apigateway.LambdaIntegration(get_case_fn), **auth_opts)

        # /doctor/queue/{consultation_id}/claim
        claim_res = queue_item.add_resource("claim")
        claim_res.add_method("PUT", apigateway.LambdaIntegration(claim_fn), **auth_opts)

        # /consultations
        consultations_res = self.doctor_api.root.add_resource("consultations")
        # /consultations/{consultation_id}
        consultation_item = consultations_res.add_resource("{consultation_id}")

        # /consultations/{consultation_id}/close
        close_res = consultation_item.add_resource("close")
        close_res.add_method("PUT", apigateway.LambdaIntegration(close_fn), **auth_opts)

        # /consultations/{consultation_id}/prescription
        prescription_res = consultation_item.add_resource("prescription")
        prescription_res.add_method("POST", apigateway.LambdaIntegration(post_prescription_fn), **auth_opts)

        # /consultations/{consultation_id}/referral
        referral_res = consultation_item.add_resource("referral")
        referral_res.add_method("POST", apigateway.LambdaIntegration(post_referral_fn), **auth_opts)

        # /prescriptions/{code}  (PUBLIC)
        prescriptions_res = self.doctor_api.root.add_resource("prescriptions")
        prescription_code = prescriptions_res.add_resource("{code}")
        prescription_code.add_method("GET", apigateway.LambdaIntegration(get_prescription_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        # /referrals/{code}  (PUBLIC)
        referrals_res = self.doctor_api.root.add_resource("referrals")
        referral_code = referrals_res.add_resource("{code}")
        referral_code.add_method("GET", apigateway.LambdaIntegration(get_referral_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        CfnOutput(self, "DoctorApiUrl",
            value=self.doctor_api.url,
            export_name=f"HealthTrack-DoctorApiUrl-{config.env_name}",
        )
