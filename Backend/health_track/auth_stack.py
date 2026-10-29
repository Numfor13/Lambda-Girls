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
    aws_ses as ses,
)
from constructs import Construct
from health_track.config import Config

NO_BYTECODE = ["**/__pycache__", "**/*.pyc"]

STAFF_GROUPS = ("Doctor", "Operator", "Admin")

STAFF_INVITE = """Hello,

Your CareBridge staff account is ready.

Email: {{username}}
Temporary password: {{####}}

Sign in at {login_url} within 7 days. You will choose a new password, then scan a QR code
with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy...).
An authenticator code is required every time you sign in.
"""


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
            # TOTP only (no SMS cost). Staff use the staff pool below, where it is mandatory.
            mfa=cognito.Mfa.OPTIONAL,
            mfa_second_factor=cognito.MfaSecondFactor(sms=False, otp=True),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            deletion_protection=config.is_prod,
            removal_policy=removal,
        )

        cognito.CfnUserPoolGroup(self, "GroupPatient",
            user_pool_id=user_pool.user_pool_id,
            group_name="Patient",
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
        user_pool.add_trigger(cognito.UserPoolOperation.POST_CONFIRMATION, post_confirmation_fn)

        profiles_table.grant(post_confirmation_fn, "dynamodb:PutItem")
        key.grant(post_confirmation_fn, "kms:GenerateDataKey", "kms:Decrypt")
        # The pool ARN can't be referenced from its own triggers (circular), so scope to this account's pools.
        pools_in_account = f"arn:aws:cognito-idp:{self.region}:{self.account}:userpool/*"
        post_confirmation_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["cognito-idp:AdminAddUserToGroup"], resources=[pools_in_account]))

        self.user_pool = user_pool
        self.app_client = app_client

        # -- Staff pool: Doctor, Operator, Admin ----------------------------------------------------
        # Token lifetime and mandatory MFA are per pool/app client in Cognito, not per group, so staff
        # get their own pool: no self sign-up (accounts come from doctor approval or the CLI),
        # TOTP required at first sign-in, 10-minute tokens and a 24-hour session.
        staff_pool = cognito.UserPool(self, "StaffPool",
            user_pool_name=f"health-track-staff-{config.env_name}",
            self_sign_up_enabled=False,
            sign_in_aliases=cognito.SignInAliases(email=True),
            standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(required=True, mutable=True),
                fullname=cognito.StandardAttribute(required=False, mutable=True),
                phone_number=cognito.StandardAttribute(required=False, mutable=True),
            ),
            password_policy=cognito.PasswordPolicy(
                min_length=12,
                require_digits=False,
                require_lowercase=False,
                require_uppercase=False,
                require_symbols=False,
                temp_password_validity=Duration.days(7),
            ),
            mfa=cognito.Mfa.REQUIRED,
            mfa_second_factor=cognito.MfaSecondFactor(sms=False, otp=True),
            user_invitation=cognito.UserInvitationConfig(
                email_subject="Your CareBridge staff account",
                email_body=STAFF_INVITE.format(login_url=config.staff_login_url),
            ),
            # Cognito's own sender (about 50 emails/day) until a domain is verified in SES.
            email=cognito.UserPoolEmail.with_ses(
                from_email=config.sender_email,
                from_name="CareBridge",
                ses_verified_domain=config.email_domain,
            ) if config.email_domain else None,
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            deletion_protection=config.is_prod,
            removal_policy=removal,
        )
        for group_name in STAFF_GROUPS:
            cognito.CfnUserPoolGroup(self, f"StaffGroup{group_name}",
                user_pool_id=staff_pool.user_pool_id,
                group_name=group_name,
            )

        staff_client = staff_pool.add_client("StaffClient",
            user_pool_client_name=f"health-track-staff-{config.env_name}",
            auth_flows=cognito.AuthFlow(user_srp=True),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(authorization_code_grant=True),
                scopes=[cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
                callback_urls=list(config.staff_callback_urls),
                logout_urls=list(config.staff_logout_urls),
            ),
            id_token_validity=Duration.minutes(10),
            access_token_validity=Duration.minutes(10),
            # Rotation issues a new refresh token on each refresh, valid only for the time left on the
            # first one: the session ends 24 h after sign-in, however often it refreshes.
            refresh_token_validity=Duration.hours(24),
            refresh_token_rotation_grace_period=Duration.seconds(10),
            prevent_user_existence_errors=True,
            generate_secret=False,
        )
        staff_domain = staff_pool.add_domain("StaffDomain",
            cognito_domain=cognito.CognitoDomainOptions(domain_prefix=f"health-track-staff-{config.env_name}"),
        )

        if config.email_domain:
            # DKIM records must be added to the domain's DNS before SES will send (PENDING_BEFORE_DEPLOY.md).
            ses.EmailIdentity(self, "EmailIdentity", identity=ses.Identity.domain(config.email_domain))

        self.staff_pool = staff_pool
        self.staff_client = staff_client

        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "AppClientId", value=app_client.user_pool_client_id)
        CfnOutput(self, "HostedUiDomain", value=domain.base_url())
        CfnOutput(self, "CognitoAuthority",
                  value=f"https://cognito-idp.{self.region}.amazonaws.com/{user_pool.user_pool_id}")
        CfnOutput(self, "StaffUserPoolId", value=staff_pool.user_pool_id)
        CfnOutput(self, "StaffAppClientId", value=staff_client.user_pool_client_id)
        CfnOutput(self, "StaffHostedUiDomain", value=staff_domain.base_url())
        CfnOutput(self, "StaffCognitoAuthority",
                  value=f"https://cognito-idp.{self.region}.amazonaws.com/{staff_pool.user_pool_id}")
