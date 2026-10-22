from aws_cdk import (
    Stack, CfnOutput, Duration, RemovalPolicy,
    aws_lambda as lambda_,
    aws_apigateway as apigateway,
    aws_s3 as s3,
)
from constructs import Construct
from health_track.config import Config
from health_track.shared_stack import SharedStack


class I18nStack(Stack):
    """Phase 10: translation files (en/fr/pid) in S3, served by GET /i18n/{locale}."""

    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack) -> None:
        super().__init__(scope, construct_id, env=env)

        layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayer", shared_stack.common_layer.layer_version_arn
        )

        is_prod = config.env_name == "prod"

        # -- Private i18n bucket (seeded by scripts/seed_i18n.py) -------------------
        self.i18n_bucket = s3.Bucket(
            self, "I18nBucket",
            bucket_name=f"health-track-i18n-{Stack.of(self).account}-{config.env_name}",
            versioned=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.RETAIN if is_prod else RemovalPolicy.DESTROY,
            auto_delete_objects=not is_prod,
        )
        CfnOutput(self, "I18nBucketNameOutput",
            export_name=f"HealthTrack-I18nBucketName-{config.env_name}",
            value=self.i18n_bucket.bucket_name,
        )

        get_locale_fn = lambda_.Function(
            self, "GetLocaleFn",
            runtime=lambda_.Runtime.PYTHON_3_12,
            code=lambda_.Code.from_asset("health_track/lambdas/i18n"),
            handler="get_locale.handler",
            memory_size=256,
            timeout=Duration.seconds(10),
            layers=[layer],
            environment={
                "I18N_BUCKET": self.i18n_bucket.bucket_name,
                "ENV_NAME": config.env_name,
            },
        )
        # Read-only, i18n/ prefix (includes ListBucket so a missing key is 404, not 403)
        self.i18n_bucket.grant_read(get_locale_fn, "i18n/*")

        api = apigateway.RestApi(
            self, "I18nApi",
            rest_api_name=f"health-track-i18n-{config.env_name}",
            cloud_watch_role=True,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=["GET", "OPTIONS"],
                allow_headers=["Content-Type", "Accept-Language", "If-None-Match"],
                expose_headers=["Content-Language", "ETag"],
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                data_trace_enabled=(config.env_name == "dev"),
            ),
        )

        # GET /i18n/{locale}  (public)
        api.root.add_resource("i18n").add_resource("{locale}").add_method(
            "GET", apigateway.LambdaIntegration(get_locale_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )

        CfnOutput(self, "I18nApiUrlOutput",
            export_name=f"HealthTrack-I18nApiUrl-{config.env_name}",
            value=api.url,
        )
