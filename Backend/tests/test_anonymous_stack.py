import aws_cdk as cdk, pytest
from aws_cdk.assertions import Template, Match
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack
from health_track.secrets_stack import SecretsStack
from health_track.anonymous_stack import AnonymousStack

_ARN = "arn:aws:dynamodb:af-south-1:123456789012:table"


@pytest.fixture(scope="module")
def anon_template():
    app = cdk.App()
    config = Config(env_name="dev", account="123456789012", region="af-south-1")
    env = cdk.Environment(account=config.account, region=config.region)
    shared = SharedStack(app, "Shared", env=env, config=config)
    secrets = SecretsStack(app, "Secrets", env=env, config=config)
    stack = AnonymousStack(app, "Anonymous", env=env, config=config,
                           shared_stack=shared, secrets_stack=secrets)
    return Template.from_stack(stack)


def test_session_table(anon_template):
    anon_template.resource_count_is("AWS::DynamoDB::Table", 1)
    anon_template.has_resource_properties("AWS::DynamoDB::Table", {
        "TableName": "HealthTrack-AnonymousSessions-dev",
        "KeySchema": [{"AttributeName": "session_token", "KeyType": "HASH"}],
        "BillingMode": "PAY_PER_REQUEST",
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True},
        "TimeToLiveSpecification": {"AttributeName": "ttl", "Enabled": True},
    })


def test_table_destroyed_in_dev(anon_template):
    tables = anon_template.find_resources("AWS::DynamoDB::Table")
    assert all(t["DeletionPolicy"] == "Delete" for t in tables.values())


def _path_of(resources, res_id):
    parts = []
    while res_id in resources:
        props = resources[res_id]["Properties"]
        parts.append(props["PathPart"])
        parent = props["ParentId"]
        res_id = parent.get("Ref") if isinstance(parent, dict) else None
    return "/" + "/".join(reversed(parts))


def test_routes_are_public_and_complete(anon_template):
    resources = anon_template.find_resources("AWS::ApiGateway::Resource")
    methods = anon_template.find_resources("AWS::ApiGateway::Method")
    routes = {}
    for m in methods.values():
        p = m["Properties"]
        if p["HttpMethod"] == "OPTIONS":
            continue
        routes[(p["HttpMethod"], _path_of(resources, p["ResourceId"]["Ref"]))] = p
    assert set(routes) == {
        ("POST", "/anonymous/session"),
        ("POST", "/anonymous/consultations"),
        ("GET", "/anonymous/consultations"),
        ("GET", "/anonymous/consultations/{consultation_id}"),
        ("POST", "/anonymous/consultations/{consultation_id}/messages"),
        ("POST", "/anonymous/payments/initiate"),
    }
    for key, props in routes.items():
        assert props["AuthorizationType"] == "NONE", key
        assert "AuthorizerId" not in props, key
    anon_template.resource_count_is("AWS::ApiGateway::Authorizer", 0)


def test_cors_allows_anonymous_and_locale_headers(anon_template):
    methods = anon_template.find_resources("AWS::ApiGateway::Method")
    options = [m for m in methods.values() if m["Properties"]["HttpMethod"] == "OPTIONS"]
    assert options
    for m in options:
        params = m["Properties"]["Integration"]["IntegrationResponses"][0]["ResponseParameters"]
        allowed = params["method.response.header.Access-Control-Allow-Headers"]
        for h in ("X-Anonymous-Session", "Accept-Language", "Content-Type", "Authorization"):
            assert h in allowed, h
        assert "Content-Language" in params["method.response.header.Access-Control-Expose-Headers"]


def test_stage_throttling(anon_template):
    stage = next(iter(anon_template.find_resources("AWS::ApiGateway::Stage").values()))["Properties"]
    settings = stage["MethodSettings"]
    default = next(s for s in settings if s["HttpMethod"] == "*" and s["ResourcePath"] == "/*")
    assert default["ThrottlingRateLimit"] == 20
    assert default["ThrottlingBurstLimit"] == 40
    mint = next(s for s in settings if s["ResourcePath"] == "/~1anonymous~1session" and s["HttpMethod"] == "POST")
    assert mint["ThrottlingRateLimit"] == 2
    assert mint["ThrottlingBurstLimit"] == 5
    assert stage["StageName"] == "dev"


def test_six_functions_with_env(anon_template):
    fns = anon_template.find_resources("AWS::Lambda::Function")
    handlers = {f["Properties"]["Handler"] for f in fns.values()}
    assert handlers == {
        "post_session.handler", "post_consultation.handler", "list_consultations.handler",
        "get_consultation.handler", "post_message.handler", "post_payment_initiate.handler",
    }
    for f in fns.values():
        p = f["Properties"]
        assert p["Runtime"] == "python3.12"
        env = p["Environment"]["Variables"]
        assert "ANON_SESSION_TABLE" in env
        assert env["ENV_NAME"] == "dev"
    anon_template.has_resource_properties("AWS::Lambda::Function", {
        "Handler": "post_payment_initiate.handler",
        "Environment": {"Variables": Match.object_like({
            "CONSULTATION_TABLE": "HealthTrack-Consultations-dev",
            "PAYMENT_TABLE": "HealthTrack-Payments-dev",
            "FAPSHI_API_KEY_SECRET_ARN": Match.any_value(),
        })},
    })


def _statements_by_handler(template):
    fns = template.find_resources("AWS::Lambda::Function")
    policies = template.find_resources("AWS::IAM::Policy")
    out = {}
    for f in fns.values():
        role_id = f["Properties"]["Role"]["Fn::GetAtt"][0]
        stmts = []
        for pol in policies.values():
            if {"Ref": role_id} in pol["Properties"]["Roles"]:
                stmts.extend(pol["Properties"]["PolicyDocument"]["Statement"])
        out[f["Properties"]["Handler"]] = stmts
    return out


def _dynamo_grants(stmts):
    grants = set()
    for s in stmts:
        actions = s["Action"] if isinstance(s["Action"], list) else [s["Action"]]
        resources = s["Resource"] if isinstance(s["Resource"], list) else [s["Resource"]]
        for a in actions:
            if not a.startswith("dynamodb:"):
                continue
            for r in resources:
                name = r if isinstance(r, str) else "SESSIONS"
                grants.add((a, name.replace(_ARN + "/", "")))
    return grants


def test_least_privilege_dynamo(anon_template):
    by_handler = _statements_by_handler(anon_template)
    c, m, p = "HealthTrack-Consultations-dev", "HealthTrack-Messages-dev", "HealthTrack-Payments-dev"
    session_read = {("dynamodb:GetItem", "SESSIONS")}
    expected = {
        "post_session.handler": {("dynamodb:PutItem", "SESSIONS")},
        "post_consultation.handler": session_read | {("dynamodb:PutItem", c)},
        "list_consultations.handler": session_read | {("dynamodb:Query", f"{c}/index/PatientIndex")},
        "get_consultation.handler": session_read | {("dynamodb:GetItem", c), ("dynamodb:Query", m)},
        "post_message.handler": session_read | {
            ("dynamodb:GetItem", c), ("dynamodb:Query", f"{m}/index/IdempotencyIndex"),
            ("dynamodb:PutItem", m)},
        "post_payment_initiate.handler": session_read | {("dynamodb:GetItem", c), ("dynamodb:PutItem", p)},
    }
    for handler, grants in expected.items():
        assert _dynamo_grants(by_handler[handler]) == grants, handler


def test_secret_read_only_on_payment_initiate(anon_template):
    by_handler = _statements_by_handler(anon_template)
    for handler, stmts in by_handler.items():
        actions = set()
        for s in stmts:
            actions.update(s["Action"] if isinstance(s["Action"], list) else [s["Action"]])
        has_secret = any(a.startswith("secretsmanager:") for a in actions)
        assert has_secret == (handler == "post_payment_initiate.handler"), handler
        assert "events:PutEvents" not in actions  # no anonymous handler publishes events


def test_no_wildcards(anon_template):
    for pol in anon_template.find_resources("AWS::IAM::Policy").values():
        for stmt in pol["Properties"]["PolicyDocument"]["Statement"]:
            actions = stmt["Action"] if isinstance(stmt["Action"], list) else [stmt["Action"]]
            resources = stmt["Resource"] if isinstance(stmt["Resource"], list) else [stmt["Resource"]]
            assert not any(a == "*" or a.endswith(":*") for a in actions)
            assert "*" not in resources
            assert not any(isinstance(r, str) and r.endswith("HealthTrack-*") for r in resources)


def test_outputs(anon_template):
    outputs = anon_template.find_outputs("*")
    exports = {o["Export"]["Name"] for o in outputs.values() if "Export" in o}
    assert "HealthTrack-AnonymousSessionTableName-dev" in exports
    assert "HealthTrack-AnonymousApiUrl-dev" in exports


def test_secret_referenced_by_name_without_cross_stack_cycle(anon_template):
    """grant_read on SecretsStack's Secret object would add a resource policy on the secret
    pointing back at this stack's role (Secrets -> Anonymous -> Secrets cycle). The secret is
    imported by name instead: identity-policy grant only, no Fn::ImportValue."""
    import json as _json
    imports = [v for v in _json.dumps(anon_template.to_json()).split('"Fn::ImportValue": ')[1:]]
    assert imports  # the shared layer import is expected
    assert not any(v.startswith('"Secrets:') for v in imports)
    by_handler = _statements_by_handler(anon_template)
    secret_resources = [
        s["Resource"] for s in by_handler["post_payment_initiate.handler"]
        if any(str(a).startswith("secretsmanager:") for a in
               (s["Action"] if isinstance(s["Action"], list) else [s["Action"]]))
    ]
    assert secret_resources
    assert "/health-track/dev/fapshi/api-key" in _json.dumps(secret_resources)
