import aws_cdk as cdk
from health_track.config import get_config
from health_track.shared_stack import SharedStack
from health_track.secrets_stack import SecretsStack
from health_track.auth_stack import AuthStack
from health_track.profile_stack import ProfileStack
from health_track.facility_stack import FacilityStack
from health_track.triage_stack import TriageStack
from health_track.consultation_stack import ConsultationStack
from health_track.payment_stack import PaymentStack
from health_track.doctor_stack import DoctorStack
from health_track.push_stack import PushStack
from health_track.channel_stack import ChannelStack

app = cdk.App()
config = get_config(app.node)

env = cdk.Environment(account=config.account, region=config.region)

shared = SharedStack(app, f"HealthTrack-Shared-{config.env_name}", env=env, config=config)
secrets = SecretsStack(app, f"HealthTrack-Secrets-{config.env_name}", env=env, config=config)

auth = AuthStack(app, f"HealthTrack-Auth-{config.env_name}",
                 env=env, config=config, shared_stack=shared)
profile = ProfileStack(app, f"HealthTrack-Profile-{config.env_name}",
                       env=env, config=config, shared_stack=shared, auth_stack=auth)
facility = FacilityStack(app, f"HealthTrack-Facility-{config.env_name}",
                         env=env, config=config,
                         shared_stack=shared,
                         auth_stack=auth)

triage = TriageStack(app, f"HealthTrack-Triage-{config.env_name}",
    env=env, config=config,
    shared_stack=shared,
    auth_stack=auth)

consultation = ConsultationStack(app, f"HealthTrack-Consultation-{config.env_name}",
    env=env, config=config,
    shared_stack=shared,
    auth_stack=auth)

payment = PaymentStack(app, f"HealthTrack-Payment-{config.env_name}",
    env=env, config=config,
    shared_stack=shared,
    auth_stack=auth,
    secrets_stack=secrets)

doctor = DoctorStack(app, f"HealthTrack-Doctor-{config.env_name}",
    env=env, config=config,
    shared_stack=shared,
    auth_stack=auth)

push = PushStack(app, f"HealthTrack-Push-{config.env_name}",
    env=env, config=config,
    shared_stack=shared,
    auth_stack=auth,
    secrets_stack=secrets)

channel = ChannelStack(app, f"HealthTrack-Channel-{config.env_name}",
    env=env, config=config,
    shared_stack=shared,
    auth_stack=auth)

app.synth()
