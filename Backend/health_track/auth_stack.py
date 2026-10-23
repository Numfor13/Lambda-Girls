from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    RemovalPolicy,
    aws_cognito as cognito,
    aws_dynamodb as dynamodb,
    aws_iam as iam,
    aws_kms as kms,
    aws_lambda as lambda_,
    aws_logs as logs,
)
from constructs import Construct
from health_track.config import Config

NO_BYTECODE = ["**/__pycache__", "**/*.pyc"]

STAFF_GROUPS = ("Doctor", "Operator", "Admin")


class AuthStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *, config: Config,
                 profiles_table: dynamodb.ITable, key: kms.IKey, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        removal = RemovalPolicy.RETAIN if config.is_prod else RemovalPolicy.DESTROY

        # Email sign-in only: SMS verification would need SNS production access and per-message cost.
        user_pool = cognito.UserPool(self, "UserPool",
            user_pool_name=f"health-track-{config.env_name}",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(required=True, mutable=True),
                phone_number=cognito.StandardAttribute(required=False, mutable=True),
            ),
            # NIST 800-63B: length over composition rules (low-literacy users).
            password_policy=cognito.PasswordPolicy(
                min_length=12,
                require_digits=False,
                require_lowercase=False,
                require_uppercase=False,
                require_symbols=False,
            ),
            # TOTP only (no SMS cost). Staff groups lose their privileges without it (pre-token trigger).
            mfa=cognito.Mfa.OPTIONAL,
            mfa_second_factor=cognito.MfaSecondFactor(sms=False, otp=True),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            deletion_protection=config.is_prod,
            removal_policy=removal,
        )

        for group_name in ("Patient",) + STAFF_GROUPS:
            cognito.CfnUserPoolGroup(self, f"Group{group_name}",
                user_pool_id=user_pool.user_pool_id,
                group_name=group_name,
            )

        app_client = user_pool.add_client("AppClient",
            user_pool_client_name=f"health-track-app-{config.env_name}",
            auth_flows=cognito.AuthFlow(user_srp=True),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(authorization_code_grant=True),
                scopes=[cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID,
                        cognito.OAuthScope.PROFILE, cognito.OAuthScope.PHONE],
                callback_urls=list(config.callback_urls),
                logout_urls=list(config.logout_urls),
            ),
            id_token_validity=Duration.hours(1),
            access_token_validity=Duration.hours(1),
            refresh_token_validity=Duration.days(30),
            prevent_user_existence_errors=True,
            generate_secret=False,
        )

        domain = user_pool.add_domain("Domain",
            cognito_domain=cognito.CognitoDomainOptions(domain_prefix=f"health-track-{config.env_name}"),
        )

        def trigger(construct_id: str, handler: str) -> lambda_.Function:
            return lambda_.Function(self, construct_id,
                runtime=lambda_.Runtime.PYTHON_3_14,
                architecture=lambda_.Architecture.ARM_64,
                handler=handler,
                code=lambda_.Code.from_asset("health_track/lambdas/auth", exclude=NO_BYTECODE),
                memory_size=256,
                timeout=Duration.seconds(10),
                tracing=lambda_.Tracing.ACTIVE,
                logging_format=lambda_.LoggingFormat.JSON,
                environment={"ENV_NAME": config.env_name, "PROFILE_TABLE": profiles_table.table_name},
                log_group=logs.LogGroup(self, f"{construct_id}Logs",
                    retention=logs.RetentionDays.ONE_MONTH,
                    encryption_key=key,
                    removal_policy=removal,
                ),
            )

        post_confirmation_fn = trigger("PostConfirmationFn", "post_confirmation.handler")
        pre_token_fn = trigger("PreTokenGenerationFn", "pre_token_generation.handler")
        user_pool.add_trigger(cognito.UserPoolOperation.POST_CONFIRMATION, post_confirmation_fn)
        user_pool.add_trigger(cognito.UserPoolOperation.PRE_TOKEN_GENERATION, pre_token_fn)

        profiles_table.grant(post_confirmation_fn, "dynamodb:PutItem")
        key.grant(post_confirmation_fn, "kms:GenerateDataKey", "kms:Decrypt")
        # The pool ARN can't be referenced from its own triggers (circular), so scope to this account's pools.
        pools_in_account = f"arn:aws:cognito-idp:{self.region}:{self.account}:userpool/*"
        post_confirmation_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["cognito-idp:AdminAddUserToGroup"], resources=[pools_in_account]))
        pre_token_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["cognito-idp:AdminGetUser"], resources=[pools_in_account]))

        self.user_pool = user_pool
        self.app_client = app_client

        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "AppClientId", value=app_client.user_pool_client_id)
        CfnOutput(self, "HostedUiDomain", value=domain.base_url())
        CfnOutput(self, "CognitoAuthority",
                  value=f"https://cognito-idp.{self.region}.amazonaws.com/{user_pool.user_pool_id}")
