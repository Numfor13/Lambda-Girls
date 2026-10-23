from dataclasses import dataclass, field
from typing import Literal

EnvName = Literal["dev", "staging", "prod"]

# Every Health Track stack, in every environment, lives in N. Virginia.
REGION = "us-east-1"


@dataclass(frozen=True)
class Config:
    env_name: EnvName
    account: str
    region: str = REGION
    # Notifications: budget, alarms and operator emergency alerts.
    alert_email: str = ""
    # Browser origins allowed by CORS and as Cognito redirect targets.
    allowed_origins: tuple = ("*",)
    callback_urls: tuple = ("http://localhost:5173/auth/callback",)
    logout_urls: tuple = ("http://localhost:5173/sign-in",)
    consultation_fee_xaf: int = 2000
    monthly_budget_usd: int = 3
    # CloudTrail's first management-event trail per account is free; create it in one env only.
    enable_trail: bool = True
    tags: dict = field(default_factory=dict)

    @property
    def is_prod(self) -> bool:
        return self.env_name == "prod"

    @property
    def fapshi_base_url(self) -> str:
        return "https://live.fapshi.com" if self.is_prod else "https://sandbox.fapshi.com"

    def param(self, name: str) -> str:
        """SSM parameter name for a runtime secret/setting (created by scripts/bootstrap_params.py)."""
        return f"/health-track/{self.env_name}/{name}"


def get_config(app_node) -> Config:
    """Build Config from CDK context (`-c env=dev`, per-env blocks in cdk.json).

    The account falls back to CDK_DEFAULT_ACCOUNT (the active AWS CLI credentials).
    The region is not configurable: it is always us-east-1.
    """
    import os
    env_name: EnvName = app_node.try_get_context("env") or "dev"
    ctx = app_node.try_get_context(env_name) or {}
    account = ctx.get("account") or os.environ.get("CDK_DEFAULT_ACCOUNT", "")
    if not account:
        raise ValueError("No AWS account: set CDK_DEFAULT_ACCOUNT or configure AWS credentials")
    if ctx.get("region", REGION) != REGION:
        raise ValueError(f"Health Track deploys to {REGION} only, got {ctx['region']}")
    return Config(
        env_name=env_name,
        account=account,
        alert_email=ctx.get("alertEmail", ""),
        allowed_origins=tuple(ctx.get("allowedOrigins", ["*"])),
        callback_urls=tuple(ctx.get("callbackUrls", ["http://localhost:5173/auth/callback"])),
        logout_urls=tuple(ctx.get("logoutUrls", ["http://localhost:5173/sign-in"])),
        consultation_fee_xaf=int(ctx.get("consultationFeeXaf", 2000)),
        monthly_budget_usd=int(ctx.get("monthlyBudgetUsd", 3)),
        enable_trail=bool(ctx.get("enableTrail", True)),
        tags={"Project": "HealthTrack", "Environment": env_name, "Owner": "carebridge-backend"},
    )
