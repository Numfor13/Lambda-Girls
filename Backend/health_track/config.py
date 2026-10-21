from dataclasses import dataclass
from typing import Literal

EnvName = Literal["dev", "staging", "prod"]


@dataclass(frozen=True)
class Config:
    env_name: EnvName
    account: str
    region: str


def get_config(app_node) -> Config:
    """Extract Config from CDK app node context."""
    env_name: EnvName = app_node.try_get_context("env") or "dev"
    ctx = app_node.try_get_context(env_name) or {}
    return Config(
        env_name=env_name,
        account=ctx.get("account", ""),
        region=ctx.get("region", "af-south-1"),
    )
