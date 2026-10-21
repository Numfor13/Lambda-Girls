import aws_cdk as cdk, pytest
from aws_cdk.assertions import Template, Match
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.extended_stack import ExtendedStack


@pytest.fixture(scope="module")
def extended_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    auth   = AuthStack(app, "Auth",   env=env, config=config, shared_stack=shared)
    stack  = ExtendedStack(app, "Extended", env=env, config=config,
                           shared_stack=shared, auth_stack=auth)
    return Template.from_stack(stack)


def _table(template, name_prefix):
    tables = template.find_resources("AWS::DynamoDB::Table")
    for res in tables.values():
        if res["Properties"]["TableName"] == f"{name_prefix}-dev":
            return res["Properties"]
    raise AssertionError(f"table {name_prefix} not found")


def _gsi(props, index_name):
    for gsi in props.get("GlobalSecondaryIndexes", []):
        if gsi["IndexName"] == index_name:
            return [(k["AttributeName"], k["KeyType"]) for k in gsi["KeySchema"]]
    raise AssertionError(f"GSI {index_name} not found")


def test_table_count(extended_template):
    extended_template.resource_count_is("AWS::DynamoDB::Table", 6)


@pytest.mark.parametrize("name,pk", [
    ("HealthTrack-Appointments",   "appointment_id"),
    ("HealthTrack-LabRequests",    "request_id"),
    ("HealthTrack-BloodRequests",  "request_id"),
    ("HealthTrack-Emergencies",    "emergency_id"),
    ("HealthTrack-HealthTips",     "tip_id"),
    ("HealthTrack-DoctorPresence", "doctor_id"),
])
def test_table_keys_pitr_billing(extended_template, name, pk):
    props = _table(extended_template, name)
    assert props["KeySchema"] == [{"AttributeName": pk, "KeyType": "HASH"}]
    assert props["PointInTimeRecoverySpecification"] == {"PointInTimeRecoveryEnabled": True}
    assert props["BillingMode"] == "PAY_PER_REQUEST"


def test_gsis(extended_template):
    appt = _table(extended_template, "HealthTrack-Appointments")
    assert _gsi(appt, "PatientIndex") == [("patient_id", "HASH"), ("created_at", "RANGE")]
    assert _gsi(appt, "StatusIndex") == [("status", "HASH"), ("slot_date", "RANGE")]
    lab = _table(extended_template, "HealthTrack-LabRequests")
    assert _gsi(lab, "PatientIndex") == [("patient_id", "HASH"), ("created_at", "RANGE")]
    blood = _table(extended_template, "HealthTrack-BloodRequests")
    assert _gsi(blood, "StatusIndex") == [("status", "HASH"), ("created_at", "RANGE")]
    tips = _table(extended_template, "HealthTrack-HealthTips")
    assert _gsi(tips, "LocaleIndex") == [("locale", "HASH"), ("published_date", "RANGE")]


def test_emergency_table_ttl(extended_template):
    props = _table(extended_template, "HealthTrack-Emergencies")
    assert props["TimeToLiveSpecification"] == {"AttributeName": "ttl", "Enabled": True}


def test_dev_tables_are_destroyed(extended_template):
    for res in extended_template.find_resources("AWS::DynamoDB::Table").values():
        assert res["DeletionPolicy"] == "Delete"


def test_lambda_count_and_runtime(extended_template):
    # 4 appointment + 4 lab + 2 blood + 2 emergency + 4 tips + 2 presence = 18
    extended_template.resource_count_is("AWS::Lambda::Function", 18)
    for res in extended_template.find_resources("AWS::Lambda::Function").values():
        assert res["Properties"]["Runtime"] == "python3.12"


def test_operator_alert_topic(extended_template):
    extended_template.resource_count_is("AWS::SNS::Topic", 1)
    extended_template.has_resource_properties("AWS::SNS::Topic", {
        "TopicName": "HealthTrack-OperatorAlerts-dev",
    })


def test_emergency_fn_has_topic_env(extended_template):
    extended_template.has_resource_properties("AWS::Lambda::Function", {
        "Handler": "post_emergency.handler",
        "Environment": {"Variables": Match.object_like({
            "OPERATOR_TOPIC_ARN": Match.any_value(),
        })},
    })


def test_api_exists(extended_template):
    extended_template.resource_count_is("AWS::ApiGateway::RestApi", 1)


def _path_of(resources, res_id):
    parts = []
    while res_id in resources:
        props = resources[res_id]["Properties"]
        parts.append(props["PathPart"])
        parent = props["ParentId"]
        res_id = parent.get("Ref") if isinstance(parent, dict) else None
    return "/" + "/".join(reversed(parts))


def test_only_health_tips_get_is_public(extended_template):
    resources = extended_template.find_resources("AWS::ApiGateway::Resource")
    methods = extended_template.find_resources("AWS::ApiGateway::Method")
    routes = {}
    for m in methods.values():
        p = m["Properties"]
        if p["HttpMethod"] == "OPTIONS":
            continue
        path = _path_of(resources, p["ResourceId"]["Ref"])
        routes[(p["HttpMethod"], path)] = p
    expected = {
        ("POST", "/appointments"), ("GET", "/appointments"),
        ("PUT", "/appointments/{appointment_id}/confirm"), ("DELETE", "/appointments/{appointment_id}"),
        ("POST", "/lab-requests"), ("GET", "/lab-requests"),
        ("GET", "/lab-requests/{request_id}"), ("PUT", "/lab-requests/{request_id}/status"),
        ("POST", "/blood-requests"), ("GET", "/blood-requests"),
        ("POST", "/emergency"), ("GET", "/operator/emergencies"),
        ("GET", "/health-tips"), ("POST", "/health-tips"),
        ("PUT", "/health-tips/{tip_id}"), ("DELETE", "/health-tips/{tip_id}"),
        ("PUT", "/doctor/presence"), ("GET", "/doctors/available"),
    }
    assert set(routes) == expected
    for key, props in routes.items():
        if key == ("GET", "/health-tips"):
            assert props["AuthorizationType"] == "NONE"
            assert "AuthorizerId" not in props
        else:
            assert props["AuthorizationType"] == "COGNITO_USER_POOLS", key
            assert "AuthorizerId" in props, key


def test_iam_statements_not_wildcard(extended_template):
    policies = extended_template.find_resources("AWS::IAM::Policy")
    assert policies
    for pol in policies.values():
        for stmt in pol["Properties"]["PolicyDocument"]["Statement"]:
            actions = stmt["Action"] if isinstance(stmt["Action"], list) else [stmt["Action"]]
            resources = stmt["Resource"] if isinstance(stmt["Resource"], list) else [stmt["Resource"]]
            assert "*" not in actions
            assert not any(a.endswith(":*") for a in actions)
            assert "*" not in resources


def test_facility_table_read_only_statement(extended_template):
    extended_template.has_resource_properties("AWS::IAM::Policy", {
        "PolicyDocument": {"Statement": Match.array_with([Match.object_like({
            "Action": "dynamodb:Query",
            "Resource": [
                "arn:aws:dynamodb:af-south-1:123456789012:table/HealthTrack-Facilities-dev",
                "arn:aws:dynamodb:af-south-1:123456789012:table/HealthTrack-Facilities-dev/index/CapabilityIndex",
            ],
        })])},
    })


def test_list_functions_get_read_only_access(extended_template):
    """List/get handlers must not be granted write actions on their table."""
    fns = extended_template.find_resources("AWS::Lambda::Function")
    policies = extended_template.find_resources("AWS::IAM::Policy")
    read_only_handlers = {
        "list_appointments.handler", "list_lab_requests.handler", "get_lab_request.handler",
        "list_blood_requests.handler", "list_emergencies.handler",
        "list_health_tips.handler", "list_available_doctors.handler",
    }
    role_by_handler = {
        f["Properties"]["Handler"]: f["Properties"]["Role"]["Fn::GetAtt"][0] for f in fns.values()
    }
    for handler in read_only_handlers:
        role_id = role_by_handler[handler]
        for pol in policies.values():
            if {"Ref": role_id} not in pol["Properties"]["Roles"]:
                continue
            for stmt in pol["Properties"]["PolicyDocument"]["Statement"]:
                actions = stmt["Action"] if isinstance(stmt["Action"], list) else [stmt["Action"]]
                for a in actions:
                    assert a not in ("dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
                                     "dynamodb:BatchWriteItem"), (handler, a)
