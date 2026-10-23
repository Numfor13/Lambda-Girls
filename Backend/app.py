import aws_cdk as cdk
from health_track.config import get_config
from health_track.data_stack import DataStack
from health_track.auth_stack import AuthStack
from health_track.governance_stack import GovernanceStack
from health_track.api_stack import ApiStack

app = cdk.App()
config = get_config(app.node)
env = cdk.Environment(account=config.account, region=config.region)
prefix = "HealthTrack"


def name(stack: str) -> str:
    return f"{prefix}-{stack}-{config.env_name}"


# Stateful resources are isolated and termination-protected in prod.
data = DataStack(app, name("Data"), config=config, env=env, termination_protection=config.is_prod)

health_tables = ["Profiles", "TriageResults", "Consultations", "Messages", "Payments",
                 "Prescriptions", "Referrals", "Emergencies", "AnonymousSessions"]
governance = GovernanceStack(app, name("Governance"), config=config, env=env,
    key=data.key,
    health_table_arns=[data.tables[t].table_arn for t in health_tables],
    voice_notes_bucket=data.voice_notes_bucket,
    logs_bucket=data.logs_bucket,
)
auth = AuthStack(app, name("Auth"), config=config, env=env,
    profiles_table=data.tables["Profiles"], key=data.key,
    termination_protection=config.is_prod,
)
ApiStack(app, name("Api"), config=config, env=env,
    data=data, user_pool=auth.user_pool, alert_topic=governance.alert_topic,
)

for key, value in config.tags.items():
    cdk.Tags.of(app).add(key, value)

# `cdk synth -c nag=true` runs the AWS Solutions rule pack (Well-Architected-aligned checks).
if app.node.try_get_context("nag"):
    from cdk_nag import AwsSolutionsChecks
    cdk.Aspects.of(app).add(AwsSolutionsChecks(verbose=True))
    from health_track.nag_suppressions import apply as apply_suppressions
    apply_suppressions(app)

app.synth()
