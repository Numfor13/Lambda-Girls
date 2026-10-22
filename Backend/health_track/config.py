from dataclasses import dataclass
from typing import Literal

EnvName = Literal["dev", "staging", "prod"]


@dataclass(frozen=True)
class Config:
    env_name: EnvName
    account: str
    region: str


def get_config(app_node) -> Config:
    """Extract Config from CDK app node context.

    Account and region fall back to CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION,
    which CDK sets automatically from the active AWS CLI credentials.
    """
    import os
    env_name: EnvName = app_node.try_get_context("env") or "dev"
    ctx = app_node.try_get_context(env_name) or {}
    return Config(
        env_name=env_name,
        account=ctx.get("account") or os.environ.get("CDK_DEFAULT_ACCOUNT", ""),
        region=ctx.get("region") or os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
    )
