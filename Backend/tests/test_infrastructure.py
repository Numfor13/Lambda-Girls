"""Synthesizes the whole app once and asserts the audit's infrastructure fixes (CLD-xx) hold."""

import json
import os

import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template

from health_track.api_stack import ApiStack
from health_track.auth_stack import AuthStack
from health_track.config import Config, get_config
from health_track.data_stack import DataStack, TABLES
from health_track.governance_stack import GovernanceStack

LAMBDAS = os.path.join(os.path.dirname(__file__), "..", "health_track", "lambdas")


@pytest.fixture(scope="module")
def templates():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", alert_email="ops@example.org")
    env = cdk.Environment(account=config.account, region=config.region)
    data = DataStack(app, "Data", config=config, env=env)
    gov = GovernanceStack(app, "Gov", config=config, env=env, key=data.key,
                          health_table_arns=[data.tables["Consultations"].table_arn],
                          voice_notes_bucket=data.voice_notes_bucket, logs_bucket=data.logs_bucket,
                          doctor_documents_bucket=data.doctor_documents_bucket)
    auth = AuthStack(app, "Auth", config=config, env=env, profiles_table=data.tables["Profiles"], key=data.key)
    api = ApiStack(app, "Api", config=config, env=env, data=data, user_pool=auth.user_pool,
                   staff_pool=auth.staff_pool, alert_topic=gov.alert_topic)
    return {name: Template.from_stack(s) for name, s in
            {"data": data, "gov": gov, "auth": auth, "api": api}.items()}


def resources(template, type_):
    return template.find_resources(type_)


def all_resources(templates, type_):
    return {k: v for t in templates.values() for k, v in resources(t, type_).items()}


def table(templates, name):
    tables = resources(templates["data"], "AWS::DynamoDB::Table").values()
    return next(t for t in tables if t["Properties"]["TableName"].startswith(f"HealthTrack-{name}-"))


def test_no_unused_network_or_secret_services(templates):
    # CLD-05 (NAT gateway/VPC), CLD-07 (Secrets Manager), CLD-28 (unused deploy bucket)
    for type_ in ("AWS::EC2::VPC", "AWS::EC2::NatGateway", "AWS::EC2::EIP", "AWS::SecretsManager::Secret"):
        assert all_resources(templates, type_) == {}, type_
    assert len(all_resources(templates, "AWS::S3::Bucket")) == 5  # access logs, voice notes, i18n, doctor documents, trail


def test_single_rest_api(templates):
    assert len(all_resources(templates, "AWS::ApiGateway::RestApi")) == 1
    assert len(all_resources(templates, "AWS::ApiGateway::Account")) == 1  # CLD-20


def test_tables_encrypted_with_cmk_and_pitr(templates):
    tables = resources(templates["data"], "AWS::DynamoDB::Table")
    assert len(tables) == len(TABLES)
    for t in tables.values():
        props = t["Properties"]
        assert props["SSESpecification"]["SSEEnabled"] is True
        assert props["SSESpecification"]["SSEType"] == "KMS"
        assert props["PointInTimeRecoverySpecification"]["PointInTimeRecoveryEnabled"] is True


def test_triage_table_keyed_on_result_id_only(templates):
    # CLD-19
    assert table(templates, "TriageResults")["Properties"]["KeySchema"] == [
        {"AttributeName": "result_id", "KeyType": "HASH"}]


def test_payments_table_has_no_unused_index(templates):
    # CLD-35
    gsis = table(templates, "Payments")["Properties"]["GlobalSecondaryIndexes"]
    assert [g["IndexName"] for g in gsis] == ["PayerIndex"]


def test_kms_key_rotates(templates):
    (key,) = resources(templates["data"], "AWS::KMS::Key").values()
    assert key["Properties"]["EnableKeyRotation"] is True


def test_voice_notes_bucket_hardened(templates):
    # CLD-16
    buckets = resources(templates["data"], "AWS::S3::Bucket").values()
    voice = next(b for b in buckets if "voice-notes" in json.dumps(b["Properties"].get("BucketName", "")))
    props = voice["Properties"]
    sse = props["BucketEncryption"]["ServerSideEncryptionConfiguration"][0]
    assert sse["ServerSideEncryptionByDefault"]["SSEAlgorithm"] == "aws:kms"
    assert sse["BucketKeyEnabled"] is True
    assert props["VersioningConfiguration"]["Status"] == "Enabled"
    assert "LoggingConfiguration" in props
    assert all("Transitions" not in r for r in props["LifecycleConfiguration"]["Rules"])  # no IA minimum-size trap
    assert "aws:SecureTransport" in json.dumps(resources(templates["data"], "AWS::S3::BucketPolicy"))


def test_doctor_documents_bucket_private_and_expiring(templates):
    buckets = resources(templates["data"], "AWS::S3::Bucket").values()
    docs = next(b for b in buckets if "doctor-documents" in json.dumps(b["Properties"].get("BucketName", "")))
    props = docs["Properties"]
    sse = props["BucketEncryption"]["ServerSideEncryptionConfiguration"][0]
    assert sse["ServerSideEncryptionByDefault"]["SSEAlgorithm"] == "aws:kms"
    assert all(props["PublicAccessBlockConfiguration"].values())
    assert "VersioningConfiguration" not in props  # deleted documents must really go
    rules = props["LifecycleConfiguration"]["Rules"]
    assert any(r.get("Prefix") == "drafts/" and r["ExpirationInDays"] == 1 for r in rules)
    assert any(r.get("TagFilters") == [{"Key": "state", "Value": "rejected"}] and r["ExpirationInDays"] == 90
               for r in rules)
    assert props["CorsConfiguration"]["CorsRules"][0]["AllowedMethods"] == ["POST"]


def test_doctor_applications_table_indexes(templates):
    gsis = table(templates, "DoctorApplications")["Properties"]["GlobalSecondaryIndexes"]
    assert sorted(g["IndexName"] for g in gsis) == ["EmailIndex", "OnmcIndex", "StatusIndex"]


def test_stage_logs_no_bodies_and_is_throttled(templates):
    # CLD-03, CLD-09, CLD-21
    (stage,) = resources(templates["api"], "AWS::ApiGateway::Stage").values()
    props = stage["Properties"]
    assert props["TracingEnabled"] is True
    assert "AccessLogSetting" in props
    default = next(m for m in props["MethodSettings"] if m["HttpMethod"] == "*")
    assert default["DataTraceEnabled"] is False
    assert default["ThrottlingRateLimit"] == 10
    throttled = {m["ResourcePath"] for m in props["MethodSettings"] if m["HttpMethod"] != "*"}
    assert {"/~1payments~1webhook", "/~1channels~1sms", "/~1anonymous~1session",
            "/~1doctor-applications", "/~1doctor-applications~1uploads",
            "/~1doctor-applications~1{application_id}"} <= throttled


def test_gateway_errors_carry_cors(templates):
    # CLD-10
    responses = resources(templates["api"], "AWS::ApiGateway::GatewayResponse").values()
    assert {r["Properties"]["ResponseType"] for r in responses} == {"DEFAULT_4XX", "DEFAULT_5XX"}
    for r in responses:
        assert "gatewayresponse.header.Access-Control-Allow-Origin" in r["Properties"]["ResponseParameters"]


def test_only_intended_routes_are_public(templates):
    api = templates["api"]
    expected_public = {
        "GET /facilities", "GET /facilities/{facility_id}", "GET /prescriptions/{code}", "GET /referrals/{code}",
        "GET /health-tips", "GET /push/vapid-public-key", "GET /i18n/{locale}", "POST /payments/webhook",
        "POST /channels/sms", "POST /channels/ussd",
        "POST /doctor-applications/uploads", "POST /doctor-applications", "GET /doctor-applications/{application_id}",
    }
    public = set()
    for fn in resources(api, "AWS::Lambda::Function").values():
        variables = fn["Properties"].get("Environment", {}).get("Variables", {})
        routes = json.loads(variables.get("ROUTES", "{}"))
        public |= {r for r in routes if r in expected_public or " /anonymous/" in r}
    methods = [m["Properties"] for m in resources(api, "AWS::ApiGateway::Method").values()
               if m["Properties"]["HttpMethod"] != "OPTIONS"]
    assert sum(m["AuthorizationType"] == "NONE" for m in methods) == len(public) == len(expected_public) + 6
    assert all(m["AuthorizationType"] in ("NONE", "COGNITO_USER_POOLS") for m in methods)


def test_functions_are_graviton_traced_and_fit_api_timeout(templates):
    # CLD-17
    fns = {**resources(templates["api"], "AWS::Lambda::Function"),
           **resources(templates["auth"], "AWS::Lambda::Function")}
    app_fns = [v["Properties"] for v in fns.values() if v["Properties"].get("Runtime", "").startswith("python")]
    assert len(app_fns) == 20
    for props in app_fns:
        assert props["Architectures"] == ["arm64"]
        assert props["Runtime"] == "python3.14"
        assert props["Timeout"] < 29
        assert props["TracingConfig"]["Mode"] == "Active"
        assert "LogGroup" in props["LoggingConfig"]
        assert props["LoggingConfig"]["LogFormat"] == "JSON"  # structured logs
        assert "VpcConfig" not in props


def _policy_statements(template, function_name):
    fn_id = next(k for k, v in resources(template, "AWS::Lambda::Function").items()
                 if v["Properties"].get("FunctionName") == function_name)
    role = resources(template, "AWS::Lambda::Function")[fn_id]["Properties"]["Role"]["Fn::GetAtt"][0]
    return [st for p in resources(template, "AWS::IAM::Policy").values()
            if {"Ref": role} in p["Properties"]["Roles"] for st in p["Properties"]["PolicyDocument"]["Statement"]]


def _actions(statement):
    actions = statement["Action"]
    return actions if isinstance(actions, list) else [actions]


def test_doctor_application_roles_are_split(templates):
    public = _policy_statements(templates["api"], "HealthTrack-DoctorApplication-dev")
    public_actions = {a for st in public for a in _actions(st)}
    assert "cognito-idp:AdminGetUser" in public_actions
    assert not {"cognito-idp:AdminCreateUser", "cognito-idp:AdminAddUserToGroup"} & public_actions
    reads = [st for st in public if any(a.startswith("s3:GetObject") for a in _actions(st))]
    assert reads and all("/drafts/*" in json.dumps(st["Resource"]) for st in reads)  # never submitted documents
    assert not any(a.startswith("s3:List") for a in public_actions)  # keys under doctor-applications/ are IDs
    admin = _policy_statements(templates["api"], "HealthTrack-DoctorApplicationAdmin-dev")
    admin_actions = {a for st in admin for a in _actions(st)}
    assert {"cognito-idp:AdminCreateUser", "cognito-idp:AdminAddUserToGroup"} <= admin_actions


def test_authorizer_accepts_patient_and_staff_pools(templates):
    (authorizer,) = resources(templates["api"], "AWS::ApiGateway::Authorizer").values()
    assert len(authorizer["Properties"]["ProviderARNs"]) == 2
    for fn in resources(templates["api"], "AWS::Lambda::Function").values():
        variables = fn["Properties"].get("Environment", {}).get("Variables", {})
        if "ROUTES" in variables:
            assert "STAFF_POOL_ISSUER" in variables  # staff groups are trusted only from the staff pool


def test_log_groups_expire_and_are_encrypted(templates):
    # CLD-03
    for name in ("api", "auth"):
        for group in resources(templates[name], "AWS::Logs::LogGroup").values():
            assert group["Properties"]["RetentionInDays"] == 30
            assert "KmsKeyId" in group["Properties"]


def test_every_route_maps_to_an_existing_handler_module(templates):
    for fn in resources(templates["api"], "AWS::Lambda::Function").values():
        variables = fn["Properties"].get("Environment", {}).get("Variables", {})
        for module in json.loads(variables.get("ROUTES", "{}")).values():
            assert any(os.path.exists(os.path.join(LAMBDAS, d, f"{module}.py")) for d in os.listdir(LAMBDAS)), module


def test_push_pipeline_has_dead_letter_queue(templates):
    # CLD-06, CLD-25
    api = templates["api"]
    assert len(resources(api, "AWS::SQS::Queue")) == 1
    (invoke_config,) = resources(api, "AWS::Lambda::EventInvokeConfig").values()
    assert "OnFailure" in invoke_config["Properties"]["DestinationConfig"]
    (rule,) = resources(api, "AWS::Events::Rule").values()
    assert set(rule["Properties"]["EventPattern"]["detail-type"]) == {"payment.confirmed", "message.sent"}


def test_alarms_within_free_tier_and_notify(templates):
    # CLD-21
    alarms = resources(templates["api"], "AWS::CloudWatch::Alarm")
    assert 1 <= len(alarms) <= 10
    assert all(a["Properties"]["AlarmActions"] for a in alarms.values())


def test_operator_alerts_have_a_subscriber(templates):
    # CLD-18
    subs = resources(templates["api"], "AWS::SNS::Subscription").values()
    assert any(s["Properties"]["Endpoint"] == "ops@example.org" for s in subs)


def test_budget_and_trail(templates):
    # CLD-22 and the cost guardrail
    (budget,) = resources(templates["gov"], "AWS::Budgets::Budget").values()
    assert budget["Properties"]["Budget"]["BudgetLimit"]["Amount"] == 3
    (trail,) = resources(templates["gov"], "AWS::CloudTrail::Trail").values()
    assert trail["Properties"]["EnableLogFileValidation"] is True
    assert trail["Properties"]["IsMultiRegionTrail"] is True


def _pools(templates):
    pools = resources(templates["auth"], "AWS::Cognito::UserPool").values()
    by_name = {p["Properties"]["UserPoolName"]: p["Properties"] for p in pools}
    return by_name["health-track-dev"], by_name["health-track-staff-dev"]


def _groups(templates, pool_logical_id_prefix):
    return {g["Properties"]["GroupName"] for g in resources(templates["auth"], "AWS::Cognito::UserPoolGroup").values()
            if g["Properties"]["UserPoolId"]["Ref"].startswith(pool_logical_id_prefix)}


def test_cognito_hardening(templates):
    # CLD-11, SYS-01: the patient pool keeps optional TOTP and long offline-friendly sessions.
    patient, _ = _pools(templates)
    assert patient["MfaConfiguration"] == "OPTIONAL"
    assert patient["EnabledMfas"] == ["SOFTWARE_TOKEN_MFA"]
    assert "SmsConfiguration" not in patient
    assert "PreTokenGeneration" not in patient["LambdaConfig"]  # staff live in their own pool now
    assert "PreSignUp" not in patient["LambdaConfig"]
    assert _groups(templates, "UserPool") == {"Patient"}
    clients = resources(templates["auth"], "AWS::Cognito::UserPoolClient").values()
    app = next(c["Properties"] for c in clients if c["Properties"]["ClientName"] == "health-track-app-dev")
    assert "phone" in app["AllowedOAuthScopes"]


def test_staff_pool_hardening(templates):
    # Doctor verification: admin-created staff only, mandatory TOTP, 10-minute tokens, 24-hour sessions.
    _, staff = _pools(templates)
    assert staff["MfaConfiguration"] == "ON"
    assert staff["EnabledMfas"] == ["SOFTWARE_TOKEN_MFA"]
    assert staff["AdminCreateUserConfig"]["AllowAdminCreateUserOnly"] is True
    assert staff["Policies"]["PasswordPolicy"]["TemporaryPasswordValidityDays"] == 7
    assert staff["Policies"]["PasswordPolicy"]["MinimumLength"] == 12
    assert "localhost:5173/sign-in" in staff["AdminCreateUserConfig"]["InviteMessageTemplate"]["EmailMessage"]
    assert _groups(templates, "StaffPool") == {"Doctor", "Operator", "Admin"}
    clients = resources(templates["auth"], "AWS::Cognito::UserPoolClient").values()
    client = next(c["Properties"] for c in clients if c["Properties"]["ClientName"] == "health-track-staff-dev")
    assert client["AccessTokenValidity"] == 10 and client["IdTokenValidity"] == 10
    assert client["TokenValidityUnits"]["AccessToken"] == "minutes"
    assert client["RefreshTokenValidity"] == 1440 and client["TokenValidityUnits"]["RefreshToken"] == "minutes"
    assert client["RefreshTokenRotation"]["Feature"] == "ENABLED"
    assert "ALLOW_REFRESH_TOKEN_AUTH" not in client["ExplicitAuthFlows"]


def test_region_is_pinned_to_us_east_1(app):
    assert get_config(app.node).region == "us-east-1"
    bad = cdk.App(context={"env": "dev", "dev": {"account": "123456789012", "region": "af-south-1"}})
    with pytest.raises(ValueError):
        get_config(bad.node)
