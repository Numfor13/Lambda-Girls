import aws_cdk as cdk
from health_track.config import get_config
from health_track.shared_stack import SharedStack
from health_track.secrets_stack import SecretsStack

app = cdk.App()
config = get_config(app.node)

env = cdk.Environment(account=config.account, region=config.region)

shared = SharedStack(app, f"HealthTrack-Shared-{config.env_name}", env=env, config=config)
secrets = SecretsStack(app, f"HealthTrack-Secrets-{config.env_name}", env=env, config=config)

app.synth()
