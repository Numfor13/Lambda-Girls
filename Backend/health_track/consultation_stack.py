from aws_cdk import Stack, RemovalPolicy, CfnOutput, Duration
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_apigateway as apigateway
from aws_cdk import aws_s3 as s3
from constructs import Construct
from .config import Config
from .shared_stack import SharedStack
from .auth_stack import AuthStack


class ConsultationStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack) -> None:
        super().__init__(scope, construct_id, env=env)

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # ─── DynamoDB: ConsultationTable ───────────────────────────────────
        self.consultation_table = dynamodb.Table(self, "ConsultationTable",
            table_name=f"HealthTrack-Consultations-{config.env_name}",
            partition_key=dynamodb.Attribute(name="consultation_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        self.consultation_table.add_global_secondary_index(
            index_name="PatientIndex",
            partition_key=dynamodb.Attribute(name="patient_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="created_at", type=dynamodb.AttributeType.NUMBER),
        )

        self.consultation_table.add_global_secondary_index(
            index_name="StatusUrgencyIndex",
            partition_key=dynamodb.Attribute(name="status", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="urgency_created", type=dynamodb.AttributeType.STRING),
        )

        CfnOutput(self, "ConsultationTableName",
            value=self.consultation_table.table_name,
            export_name=f"HealthTrack-ConsultationTableName-{config.env_name}",
        )

        # ─── DynamoDB: MessageTable ────────────────────────────────────────
        self.message_table = dynamodb.Table(self, "MessageTable",
            table_name=f"HealthTrack-Messages-{config.env_name}",
            partition_key=dynamodb.Attribute(name="consultation_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="message_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        self.message_table.add_global_secondary_index(
            index_name="IdempotencyIndex",
            partition_key=dynamodb.Attribute(name="client_message_id", type=dynamodb.AttributeType.STRING),
        )

        CfnOutput(self, "MessageTableName",
            value=self.message_table.table_name,
            export_name=f"HealthTrack-MessageTableName-{config.env_name}",
        )

        # ─── S3: VoiceNotesBucket ──────────────────────────────────────────
        auto_delete = config.env_name != "prod"

        self.voice_notes_bucket = s3.Bucket(self, "VoiceNotesBucket",
            bucket_name=f"health-track-voice-notes-{Stack.of(self).account}-{config.env_name}",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            cors=[s3.CorsRule(
                allowed_methods=[s3.HttpMethods.PUT, s3.HttpMethods.GET],
                allowed_origins=["*"],
                allowed_headers=["*"],
            )],
            lifecycle_rules=[s3.LifecycleRule(
                transitions=[s3.Transition(
                    storage_class=s3.StorageClass.INFREQUENT_ACCESS,
                    transition_after=Duration.days(90),
                )],
            )],
            removal_policy=removal_policy,
            auto_delete_objects=auto_delete,
        )

        CfnOutput(self, "VoiceNotesBucketName",
            value=self.voice_notes_bucket.bucket_name,
            export_name=f"HealthTrack-VoiceNotesBucketName-{config.env_name}",
        )

        # ─── Shared layer ──────────────────────────────────────────────────
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayerRef-Consultation",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        # Triage table name (no direct stack dependency)
        triage_table_name = f"HealthTrack-TriageResults-{config.env_name}"

        # ─── Lambda helpers ────────────────────────────────────────────────
        base_kwargs = dict(
            runtime=lambda_.Runtime.PYTHON_3_12,
            timeout=Duration.seconds(15),
            layers=[common_layer],
            code=lambda_.Code.from_asset("health_track/lambdas/consultation"),
        )

        def make_fn(construct_id, handler_name, env_vars):
            return lambda_.Function(self, construct_id,
                handler=handler_name,
                environment=env_vars,
                **base_kwargs,
            )

        post_consultation_fn = make_fn("PostConsultationFn", "post_consultation.handler", {
            "CONSULTATION_TABLE": self.consultation_table.table_name,
            "ENV_NAME": config.env_name,
        })

        list_consultations_fn = make_fn("ListConsultationsFn", "list_consultations.handler", {
            "CONSULTATION_TABLE": self.consultation_table.table_name,
            "ENV_NAME": config.env_name,
        })

        get_consultation_fn = make_fn("GetConsultationFn", "get_consultation.handler", {
            "CONSULTATION_TABLE": self.consultation_table.table_name,
            "MESSAGE_TABLE": self.message_table.table_name,
            "ENV_NAME": config.env_name,
        })

        post_message_fn = make_fn("PostMessageFn", "post_message.handler", {
            "MESSAGE_TABLE": self.message_table.table_name,
            "CONSULTATION_TABLE": self.consultation_table.table_name,
            "ENV_NAME": config.env_name,
        })

        upload_url_fn = make_fn("GetVoiceNoteUploadUrlFn", "get_voice_note_upload_url.handler", {
            "VOICE_NOTES_BUCKET": self.voice_notes_bucket.bucket_name,
            "CONSULTATION_TABLE": self.consultation_table.table_name,
            "ENV_NAME": config.env_name,
        })

        download_url_fn = make_fn("GetVoiceNoteDownloadUrlFn", "get_voice_note_download_url.handler", {
            "VOICE_NOTES_BUCKET": self.voice_notes_bucket.bucket_name,
            "CONSULTATION_TABLE": self.consultation_table.table_name,
            "MESSAGE_TABLE": self.message_table.table_name,
            "ENV_NAME": config.env_name,
        })

        post_sync_fn = make_fn("PostSyncFn", "post_sync.handler", {
            "CONSULTATION_TABLE": self.consultation_table.table_name,
            "MESSAGE_TABLE": self.message_table.table_name,
            "TRIAGE_TABLE": triage_table_name,
            "ENV_NAME": config.env_name,
        })

        # ─── IAM grants ───────────────────────────────────────────────────
        dynamo_fns = [
            post_consultation_fn,
            list_consultations_fn,
            get_consultation_fn,
            post_message_fn,
            upload_url_fn,
            download_url_fn,
            post_sync_fn,
        ]
        for fn in dynamo_fns:
            fn.role.add_managed_policy(shared_stack.dynamo_read_policy)
            fn.role.add_managed_policy(shared_stack.dynamo_write_policy)

        # S3 grants for voice note functions
        self.voice_notes_bucket.grant_put(upload_url_fn)
        self.voice_notes_bucket.grant_read(download_url_fn)
        upload_url_fn.role.add_managed_policy(shared_stack.s3_write_policy)
        download_url_fn.role.add_managed_policy(shared_stack.s3_read_policy)

        # ─── API Gateway ───────────────────────────────────────────────────
        self.consultation_api = apigateway.RestApi(self, "ConsultationApi",
            rest_api_name=f"health-track-consultation-{config.env_name}",
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

        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "ConsultationAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        auth_opts = dict(
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )

        # /consultations
        consultations_res = self.consultation_api.root.add_resource("consultations")
        consultations_res.add_method("GET", apigateway.LambdaIntegration(list_consultations_fn), **auth_opts)
        consultations_res.add_method("POST", apigateway.LambdaIntegration(post_consultation_fn), **auth_opts)

        # /consultations/{consultation_id}
        consultation_item = consultations_res.add_resource("{consultation_id}")
        consultation_item.add_method("GET", apigateway.LambdaIntegration(get_consultation_fn), **auth_opts)

        # /consultations/{consultation_id}/messages
        messages_res = consultation_item.add_resource("messages")
        messages_res.add_method("POST", apigateway.LambdaIntegration(post_message_fn), **auth_opts)

        # /consultations/{consultation_id}/voice-note-upload-url
        upload_res = consultation_item.add_resource("voice-note-upload-url")
        upload_res.add_method("POST", apigateway.LambdaIntegration(upload_url_fn), **auth_opts)

        # /consultations/{consultation_id}/voice-note/{message_id}
        voice_note_res = consultation_item.add_resource("voice-note")
        voice_note_item = voice_note_res.add_resource("{message_id}")
        voice_note_item.add_method("GET", apigateway.LambdaIntegration(download_url_fn), **auth_opts)

        # /sync
        sync_res = self.consultation_api.root.add_resource("sync")
        sync_res.add_method("POST", apigateway.LambdaIntegration(post_sync_fn), **auth_opts)

        CfnOutput(self, "ConsultationApiUrl",
            value=self.consultation_api.url,
            export_name=f"HealthTrack-ConsultationApiUrl-{config.env_name}",
        )
