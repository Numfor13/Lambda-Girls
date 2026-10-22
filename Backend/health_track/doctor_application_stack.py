from aws_cdk import Stack, RemovalPolicy, CfnOutput, Duration
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_apigateway as apigateway
from aws_cdk import aws_iam as iam
from aws_cdk import aws_s3 as s3
from constructs import Construct
from .config import Config
from .shared_stack import SharedStack
from .auth_stack import AuthStack


class DoctorApplicationStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack) -> None:
        super().__init__(scope, construct_id, env=env)

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # ─── S3: Recommendation letters ───────────────────────────────────
        self.docs_bucket = s3.Bucket(self, "DocsBucket",
            bucket_name=f"health-track-{self.account}-doctor-docs-{config.env_name}",
            removal_policy=removal_policy,
            auto_delete_objects=(config.env_name != "prod"),
            cors=[s3.CorsRule(
                allowed_methods=[s3.HttpMethods.PUT],
                allowed_origins=["*"],
                allowed_headers=["*"],
                max_age=3000,
            )],
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
        )

        CfnOutput(self, "DocsBucketName",
            value=self.docs_bucket.bucket_name,
            export_name=f"HealthTrack-DoctorDocsBucket-{config.env_name}",
        )

        # ─── DynamoDB: DoctorApplications ─────────────────────────────────
        self.applications_table = dynamodb.Table(self, "ApplicationsTable",
            table_name=f"HealthTrack-DoctorApplications-{config.env_name}",
            partition_key=dynamodb.Attribute(name="application_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=removal_policy,
        )

        self.applications_table.add_global_secondary_index(
            index_name="StatusSubmittedIndex",
            partition_key=dynamodb.Attribute(name="status", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="submitted_at", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        CfnOutput(self, "ApplicationsTableName",
            value=self.applications_table.table_name,
            export_name=f"HealthTrack-DoctorApplicationsTable-{config.env_name}",
        )

        # ─── Shared layer ──────────────────────────────────────────────────
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayer",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        base_kwargs = dict(
            runtime=lambda_.Runtime.PYTHON_3_12,
            memory_size=256,
            timeout=Duration.seconds(30),
            layers=[common_layer],
            code=lambda_.Code.from_asset("health_track/lambdas/doctor_application"),
        )

        base_env = {
            "APPLICATIONS_TABLE": self.applications_table.table_name,
            "DOCS_BUCKET": self.docs_bucket.bucket_name,
            "ENV_NAME": config.env_name,
        }

        def make_fn(cid, handler_name, extra_env=None):
            env_vars = {**base_env, **(extra_env or {})}
            return lambda_.Function(self, cid, handler=handler_name, environment=env_vars, **base_kwargs)

        post_application_fn = make_fn("PostApplicationFn", "post_application.handler")
        get_status_fn = make_fn("GetApplicationStatusFn", "get_application_status.handler")
        get_upload_url_fn = make_fn("GetUploadUrlFn", "get_upload_url.handler")
        list_applications_fn = make_fn("ListApplicationsFn", "list_applications.handler")
        get_application_fn = make_fn("GetApplicationFn", "get_application.handler")
        approve_fn = make_fn("ApproveApplicationFn", "approve_application.handler", {
            "USER_POOL_ID": auth_stack.user_pool.user_pool_id,
        })
        reject_fn = make_fn("RejectApplicationFn", "reject_application.handler")
        update_notes_fn = make_fn("UpdateNotesFn", "update_notes.handler")

        # ─── IAM grants ───────────────────────────────────────────────────
        self.applications_table.grant_read_write_data(post_application_fn)
        self.applications_table.grant_read_data(get_status_fn)
        self.applications_table.grant_read_data(list_applications_fn)
        self.applications_table.grant_read_data(get_application_fn)
        self.applications_table.grant_read_write_data(approve_fn)
        self.applications_table.grant_read_write_data(reject_fn)
        self.applications_table.grant_read_write_data(update_notes_fn)

        self.docs_bucket.grant_put(get_upload_url_fn)
        self.docs_bucket.grant_read(get_application_fn)
        self.docs_bucket.grant_read(approve_fn)

        approve_fn.add_to_role_policy(iam.PolicyStatement(
            actions=[
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminAddUserToGroup",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminUpdateUserAttributes",
            ],
            resources=[auth_stack.user_pool.user_pool_arn],
        ))

        # ─── API Gateway ───────────────────────────────────────────────────
        self.api = apigateway.RestApi(self, "DoctorApplicationApi",
            rest_api_name=f"health-track-doctor-application-{config.env_name}",
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

        no_auth = dict(authorization_type=apigateway.AuthorizationType.NONE)

        admin_authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "AdminAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )
        admin_auth = dict(
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=admin_authorizer,
        )

        # /applications  POST (public)
        apps_res = self.api.root.add_resource("applications")
        apps_res.add_method("POST", apigateway.LambdaIntegration(post_application_fn), **no_auth)

        # /applications/{application_id}  GET (public status check)
        app_item = apps_res.add_resource("{application_id}")
        app_item.add_method("GET", apigateway.LambdaIntegration(get_status_fn), **no_auth)

        # /upload-url  GET (public presigned URL)
        upload_res = self.api.root.add_resource("upload-url")
        upload_res.add_method("GET", apigateway.LambdaIntegration(get_upload_url_fn), **no_auth)

        # /admin/applications  GET (admin only)
        admin_res = self.api.root.add_resource("admin")
        admin_apps = admin_res.add_resource("applications")
        admin_apps.add_method("GET", apigateway.LambdaIntegration(list_applications_fn), **admin_auth)

        # /admin/applications/{application_id}
        admin_app_item = admin_apps.add_resource("{application_id}")
        admin_app_item.add_method("GET", apigateway.LambdaIntegration(get_application_fn), **admin_auth)
        admin_app_item.add_method("PUT", apigateway.LambdaIntegration(update_notes_fn), **admin_auth)

        # /admin/applications/{application_id}/approve
        approve_res = admin_app_item.add_resource("approve")
        approve_res.add_method("POST", apigateway.LambdaIntegration(approve_fn), **admin_auth)

        # /admin/applications/{application_id}/reject
        reject_res = admin_app_item.add_resource("reject")
        reject_res.add_method("POST", apigateway.LambdaIntegration(reject_fn), **admin_auth)

        CfnOutput(self, "DoctorApplicationApiUrl",
            value=self.api.url,
            export_name=f"HealthTrack-DoctorApplicationApiUrl-{config.env_name}",
        )
