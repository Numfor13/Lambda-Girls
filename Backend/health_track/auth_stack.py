import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    aws_cognito as cognito,
    aws_lambda as lambda_,
    aws_iam as iam,
)
from constructs import Construct
from health_track.config import Config
from health_track.shared_stack import SharedStack


class AuthStack(Stack):
    def __init__(self, scope: Construct, id: str, *, env, config: Config, shared_stack: SharedStack, **kwargs) -> None:
        super().__init__(scope, id, env=env, **kwargs)

        # I8: RETAIN in prod, DESTROY elsewhere
        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        # Cognito User Pool
        user_pool = cognito.UserPool(self, "UserPool",
            user_pool_name=f"health-track-{config.env_name}",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True, phone=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True, phone=True),
            standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(required=True, mutable=True),
                phone_number=cognito.StandardAttribute(required=False, mutable=True),
            ),
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_digits=True,
                require_lowercase=True,
                require_uppercase=False,
                require_symbols=False,
            ),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=removal_policy,
        )

        # User Pool Groups
        for group_name in ["Patient", "Doctor", "Operator", "Admin"]:
            cognito.CfnUserPoolGroup(self, f"Group{group_name}",
                user_pool_id=user_pool.user_pool_id,
                group_name=group_name,
            )

        # App Client (no secret — SPA/PWA)
        app_client = user_pool.add_client("AppClient",
            user_pool_client_name=f"health-track-app-{config.env_name}",
            auth_flows=cognito.AuthFlow(user_srp=True),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(authorization_code_grant=True),
                scopes=[cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
                callback_urls=["http://localhost:5173/auth/callback"],
                logout_urls=["http://localhost:5173/sign-in"],
            ),
            prevent_user_existence_errors=True,
            generate_secret=False,
        )

        # Cognito Domain
        domain = user_pool.add_domain("Domain",
            cognito_domain=cognito.CognitoDomainOptions(
                domain_prefix=f"health-track-{config.env_name}",
            )
        )

        # Pre-sign-up Lambda trigger
        pre_signup_fn = lambda_.Function(self, "PreSignupFn",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="pre_signup.handler",
            code=lambda_.Code.from_asset("health_track/lambdas/auth"),
            environment={"ENV_NAME": config.env_name},
        )
        user_pool.add_trigger(cognito.UserPoolOperation.PRE_SIGN_UP, pre_signup_fn)

        # Reconstruct layer reference from ARN to avoid cross-stack export lock (I3)
        common_layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayerRef",
            layer_version_arn=shared_stack.common_layer.layer_version_arn,
        )

        # Post-confirmation Lambda trigger
        post_confirmation_fn = lambda_.Function(self, "PostConfirmationFn",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="post_confirmation.handler",
            code=lambda_.Code.from_asset("health_track/lambdas/auth"),
            layers=[common_layer],
            environment={
                "ENV_NAME": config.env_name,
                "PROFILE_TABLE": f"HealthTrack-Profiles-{config.env_name}",
            },
        )
        user_pool.add_trigger(cognito.UserPoolOperation.POST_CONFIRMATION, post_confirmation_fn)

        # I4: Scoped IAM policies
        post_confirmation_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["dynamodb:PutItem"],
            resources=[f"arn:aws:dynamodb:{Stack.of(self).region}:{Stack.of(self).account}:table/HealthTrack-Profiles-{config.env_name}"],
        ))
        post_confirmation_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["cognito-idp:AdminAddUserToGroup"],
            resources=[f"arn:aws:cognito-idp:{Stack.of(self).region}:{Stack.of(self).account}:userpool/*"],
        ))

        # Expose properties
        self.user_pool = user_pool
        self.app_client = app_client
        self.domain = domain
        self.pre_signup_fn = pre_signup_fn
        self.post_confirmation_fn = post_confirmation_fn

        # CloudFormation Outputs
        CfnOutput(self, "UserPoolId",
            value=user_pool.user_pool_id,
            export_name=f"HealthTrack-UserPoolId-{config.env_name}",
        )
        CfnOutput(self, "AppClientId",
            value=app_client.user_pool_client_id,
            export_name=f"HealthTrack-AppClientId-{config.env_name}",
        )
        CfnOutput(self, "HostedUiDomain",
            value=domain.domain_name,
            export_name=f"HealthTrack-HostedUiDomain-{config.env_name}",
        )
