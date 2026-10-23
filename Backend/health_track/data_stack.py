from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_iam as iam,
    aws_kms as kms,
    aws_s3 as s3,
)
from constructs import Construct
from health_track.config import Config

S, N = dynamodb.AttributeType.STRING, dynamodb.AttributeType.NUMBER

# name: (partition key, sort key | None, [(index, pk, (sk, type) | None)], ttl attribute | None)
TABLES = {
    "Profiles":          ("user_id", None, [], None),
    "Facilities":        ("facility_id", None, [("RegionIndex", "region", ("facility_id", S)),
                                                ("CapabilityIndex", "primary_capability", ("facility_id", S))], None),
    "TriageResults":     ("result_id", None, [("UserIndex", "user_id", ("created_at", N))], None),
    "Consultations":     ("consultation_id", None, [("PatientIndex", "patient_id", ("created_at", N)),
                                                    ("StatusUrgencyIndex", "status", ("urgency_created", S))], None),
    "Messages":          ("consultation_id", ("message_id", S), [("IdempotencyIndex", "client_message_id", None)], None),
    "Payments":          ("payment_id", None, [("PayerIndex", "payer_id", ("created_at", N))], None),
    "Prescriptions":     ("code", None, [], None),
    "Referrals":         ("code", None, [], None),
    "PushSubscriptions": ("user_id", None, [], None),
    "Sessions":          ("session_id", None, [], "ttl"),
    "CallbackRequests":  ("request_id", None, [("UrgencyIndex", "status", ("created_at", N))], None),
    "DispatchLogs":      ("log_id", None, [], None),
    "Appointments":      ("appointment_id", None, [("PatientIndex", "patient_id", ("created_at", N)),
                                                   ("StatusIndex", "status", ("slot_date", S))], None),
    "LabRequests":       ("request_id", None, [("PatientIndex", "patient_id", ("created_at", N))], None),
    "BloodRequests":     ("request_id", None, [("StatusIndex", "status", ("created_at", N))], None),
    "Emergencies":       ("emergency_id", None, [], "ttl"),
    "HealthTips":        ("tip_id", None, [("LocaleIndex", "locale", ("published_date", S))], None),
    "DoctorPresence":    ("doctor_id", None, [], None),
    "AnonymousSessions": ("session_token", None, [], "ttl"),
}


class DataStack(Stack):
    """Stateful resources only: the health-data key, DynamoDB tables and S3 buckets."""

    def __init__(self, scope: Construct, construct_id: str, *, config: Config, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        removal = RemovalPolicy.RETAIN if config.is_prod else RemovalPolicy.DESTROY

        # One customer-managed key ($1/month) for all health data, logs and alert topics.
        # ponytail: 3-year rotation keeps the key at $1/month (each rotation adds $1, capped at $3);
        # drop to 365 days when the budget allows.
        self.key = kms.Key(self, "HealthDataKey",
            alias=f"alias/health-track-{config.env_name}",
            description="Health Track: encrypts health records, voice notes, logs and alert topics",
            enable_key_rotation=True,
            rotation_period=Duration.days(1095),
            removal_policy=removal,
            pending_window=Duration.days(7 if not config.is_prod else 30),
        )
        self.key.add_to_resource_policy(iam.PolicyStatement(
            sid="AllowCloudWatchLogs",
            principals=[iam.ServicePrincipal(f"logs.{self.region}.amazonaws.com")],
            actions=["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"],
            resources=["*"],
            conditions={"ArnLike": {"kms:EncryptionContext:aws:logs:arn":
                                    f"arn:aws:logs:{self.region}:{self.account}:log-group:*"}},
        ))
        self.key.add_to_resource_policy(iam.PolicyStatement(
            sid="AllowCloudWatchAlarmsToEncryptedTopics",
            principals=[iam.ServicePrincipal("cloudwatch.amazonaws.com")],
            actions=["kms:Decrypt", "kms:GenerateDataKey*"],
            resources=["*"],
            conditions={"StringEquals": {"aws:SourceAccount": self.account}},
        ))

        self.tables = {}
        for name, (pk, sk, indexes, ttl) in TABLES.items():
            table = dynamodb.Table(self, f"{name}Table",
                table_name=f"HealthTrack-{name}-{config.env_name}",
                partition_key=dynamodb.Attribute(name=pk, type=S),
                sort_key=dynamodb.Attribute(name=sk[0], type=sk[1]) if sk else None,
                billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
                encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
                encryption_key=self.key,
                point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                    point_in_time_recovery_enabled=True),
                deletion_protection=config.is_prod,
                time_to_live_attribute=ttl,
                removal_policy=removal,
            )
            for index_name, index_pk, index_sk in indexes:
                table.add_global_secondary_index(
                    index_name=index_name,
                    partition_key=dynamodb.Attribute(name=index_pk, type=S),
                    sort_key=dynamodb.Attribute(name=index_sk[0], type=index_sk[1]) if index_sk else None,
                )
            self.tables[name] = table

        # S3 server access logs land here (SSE-S3: log delivery cannot use a KMS key).
        self.logs_bucket = s3.Bucket(self, "AccessLogsBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            object_ownership=s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
            enforce_ssl=True,
            lifecycle_rules=[s3.LifecycleRule(expiration=Duration.days(90))],
            removal_policy=removal,
            auto_delete_objects=not config.is_prod,
        )

        self.voice_notes_bucket = s3.Bucket(self, "VoiceNotesBucket",
            bucket_name=f"health-track-voice-notes-{self.account}-{config.env_name}",
            encryption=s3.BucketEncryption.KMS,
            encryption_key=self.key,
            bucket_key_enabled=True,  # one KMS call per bucket key, not per object
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            versioned=True,
            server_access_logs_bucket=self.logs_bucket,
            server_access_logs_prefix="voice-notes/",
            cors=[s3.CorsRule(
                allowed_methods=[s3.HttpMethods.PUT, s3.HttpMethods.GET],
                allowed_origins=list(config.allowed_origins),
                allowed_headers=["Content-Type"],
                max_age=3600,
            )],
            lifecycle_rules=[s3.LifecycleRule(
                noncurrent_version_expiration=Duration.days(30),
                abort_incomplete_multipart_upload_after=Duration.days(1),
            )],
            removal_policy=removal,
            auto_delete_objects=not config.is_prod,
        )

        self.i18n_bucket = s3.Bucket(self, "I18nBucket",
            bucket_name=f"health-track-i18n-{self.account}-{config.env_name}",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            versioned=True,
            server_access_logs_bucket=self.logs_bucket,
            server_access_logs_prefix="i18n/",
            lifecycle_rules=[s3.LifecycleRule(noncurrent_version_expiration=Duration.days(30))],
            removal_policy=removal,
            auto_delete_objects=not config.is_prod,
        )

        CfnOutput(self, "HealthDataKeyArn", value=self.key.key_arn)
        CfnOutput(self, "VoiceNotesBucketName", value=self.voice_notes_bucket.bucket_name)
        CfnOutput(self, "I18nBucketName", value=self.i18n_bucket.bucket_name)
