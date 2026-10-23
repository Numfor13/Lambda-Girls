import pytest
import aws_cdk as cdk
from health_track.config import Config


@pytest.fixture
def app():
    return cdk.App(context={
        "env": "dev",
        "dev": {"account": "123456789012", "region": "us-east-1", "alertEmail": "ops@example.org"},
    })


@pytest.fixture
def config():
    return Config(env_name="dev", account="123456789012", alert_email="ops@example.org")
