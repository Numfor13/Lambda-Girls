import json
import subprocess
import sys
from pathlib import Path

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Size,
    aws_apigateway as apigateway,
    aws_cloudwatch as cloudwatch,
    aws_cloudwatch_actions as cw_actions,
    aws_cognito as cognito,
    aws_events as events,
    aws_events_targets as targets,
    aws_iam as iam,
    aws_kms as kms,
    aws_lambda as lambda_,
    aws_lambda_destinations as destinations,
    aws_logs as logs,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
    aws_sqs as sqs,
)
from constructs import Construct
from health_track.config import Config

from health_track.data_stack import DataStack

NO_BYTECODE = ["**/__pycache__", "**/*.pyc"]
LAMBDA_PLATFORM = ["--platform", "manylinux2014_aarch64", "--platform", "manylinux_2_28_aarch64",
                   "--implementation", "cp", "--python-version", "3.14", "--only-binary=:all:"]
# name -> (binary deps fetched for the Lambda platform, pure-Python packages installed without deps)
DEPENDENCY_LAYERS = {
    # http-ece and pywebpush ship no wheels; they are pure Python.
    "push-deps": (["cryptography", "requests", "six", "py-vapid>=1.7.0"], ["pywebpush==1.14.1", "http-ece>=1.1.0"]),
    # botocore comes with the Lambda runtime, so the X-Ray SDK is installed without it.
    "xray-deps": (["wrapt"], ["aws-xray-sdk==2.14.0"]),
}


def build_deps(name: str) -> str:
    """pip-install a dependency layer for Lambda arm64 / Python 3.14 (no Docker). Cached in build/<name>."""
    binary, pure = DEPENDENCY_LAYERS[name]
    out = Path("build") / name
    marker, spec = out / ".requirements", " ".join(binary + pure) + " py3.14-arm64"
    if not (marker.exists() and marker.read_text() == spec):
        target = ["--quiet", "--upgrade", "--target", str(out / "python")]
        pip = [sys.executable, "-m", "pip", "install"]
        subprocess.run(pip + binary + target + LAMBDA_PLATFORM, check=True)
        subprocess.run(pip + pure + ["--no-deps"] + target, check=True)
        marker.write_text(spec)
    return str(out)


class ApiStack(Stack):
    """One REST API, one Lambda per domain (router), async push pipeline, alarms and dashboard."""

    def __init__(self, scope: Construct, construct_id: str, *, config: Config, data: DataStack,
                 user_pool: cognito.IUserPool, alert_topic: sns.ITopic, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        removal = RemovalPolicy.RETAIN if config.is_prod else RemovalPolicy.DESTROY
        key: kms.IKey = data.key
        t = data.tables
        cors_origin = config.allowed_origins[0] if len(config.allowed_origins) == 1 else "*"

        def ssm_arn(name: str) -> str:
            return f"arn:aws:ssm:{self.region}:{self.account}:parameter{config.param(name)}"

        def read_params(fn, *names):
            fn.add_to_role_policy(iam.PolicyStatement(
                actions=["ssm:GetParameter"], resources=[ssm_arn(n) for n in names]))
            key.grant_decrypt(fn)  # SecureString parameters are encrypted with the health-data key

        # -- Shared code (same stack as the functions: no cross-stack export lock) -----------
        common_layer = lambda_.LayerVersion(self, "CommonLayer",
            code=lambda_.Code.from_asset("lambda_layers/common", exclude=NO_BYTECODE),
            compatible_runtimes=[lambda_.Runtime.PYTHON_3_14],
            compatible_architectures=[lambda_.Architecture.ARM_64],
            description="health_track_common: router, responses, auth, rules, Fapshi, params, events",
        )
        def deps_layer(construct_id: str, name: str) -> lambda_.LayerVersion:
            return lambda_.LayerVersion(self, construct_id,
                code=lambda_.Code.from_asset(build_deps(name), exclude=NO_BYTECODE),
                compatible_runtimes=[lambda_.Runtime.PYTHON_3_14],
                compatible_architectures=[lambda_.Architecture.ARM_64],
                description=" ".join(DEPENDENCY_LAYERS[name][1]),
            )

        push_deps_layer = deps_layer("PushDepsLayer", "push-deps")
        # X-Ray SDK: subsegments for every DynamoDB/S3/SSM/EventBridge and outbound HTTP call (Fapshi, web push).
        xray_layer = deps_layer("XRayLayer", "xray-deps")

        base_env = {"ENV_NAME": config.env_name, "CORS_ALLOW_ORIGIN": cors_origin}
        routes_of = {}  # function -> {"METHOD /resource": module}, wired to API Gateway below

        def function(name: str, folder: str, env: dict, *, routes: dict = None, handler: str = None,
                     timeout: int = 10, layers=()) -> lambda_.Function:
            environment = {**base_env, **env}
            if routes:
                environment["ROUTES"] = json.dumps(routes, separators=(",", ":"))
            fn = lambda_.Function(self, f"{name}Fn",
                function_name=f"HealthTrack-{name}-{config.env_name}",
                runtime=lambda_.Runtime.PYTHON_3_14,
                architecture=lambda_.Architecture.ARM_64,  # Graviton: ~20% cheaper, lower energy
                code=lambda_.Code.from_asset(f"health_track/lambdas/{folder}", exclude=NO_BYTECODE),
                handler=handler or "health_track_common.router.handler",
                layers=[common_layer, xray_layer, *layers],
                # Measured 2026-10-22: 512 MB halves warm latency vs 256 MB (198 -> 115 ms) for +$0.0007/month.
                memory_size=512,
                timeout=Duration.seconds(timeout),  # below API Gateway's 29 s integration limit
                tracing=lambda_.Tracing.ACTIVE,
                logging_format=lambda_.LoggingFormat.JSON,  # structured logs, queryable by field
                application_log_level_v2=lambda_.ApplicationLogLevel.INFO,
                system_log_level_v2=lambda_.SystemLogLevel.WARN,
                environment=environment,
                log_group=logs.LogGroup(self, f"{name}Logs",
                    log_group_name=f"/aws/lambda/HealthTrack-{name}-{config.env_name}",
                    retention=logs.RetentionDays.ONE_MONTH,
                    encryption_key=key,
                    removal_policy=removal,
                ),
            )
            if routes:
                routes_of[fn] = routes
            return fn

        tbl = lambda *names: {f"{n.upper()}_TABLE": t[k].table_name for n, k in names}
        payment_env = {
            **tbl(("payment", "Payments"), ("consultation", "Consultations")),
            "CONSULTATION_FEE_XAF": str(config.consultation_fee_xaf),
            "FAPSHI_BASE_URL": config.fapshi_base_url,
            "FAPSHI_CREDENTIALS_PARAM": config.param("fapshi/credentials"),
            "PAYMENT_SIMULATION_ALLOWED": "false" if config.is_prod else "true",
        }

        # -- Domain functions: (routes "METHOD /resource" -> handler module) ----------------------
        profile = function("Profile", "profile", tbl(("profile", "Profiles")), routes={
            "GET /profile": "get_profile",
            "PUT /profile": "put_profile",
            "POST /profile/household": "post_household",
            "DELETE /profile/household/{member_id}": "delete_household_member",
        })
        t["Profiles"].grant_read_write_data(profile)

        facility_public = function("FacilityPublic", "facility", tbl(("facility", "Facilities")), routes={
            "GET /facilities": "get_facilities",
            "GET /facilities/{facility_id}": "get_facility",
        })
        t["Facilities"].grant_read_data(facility_public)

        facility_admin = function("FacilityAdmin", "facility", tbl(("facility", "Facilities")), routes={
            "POST /facilities": "post_facility",
            "PUT /facilities/{facility_id}": "put_facility",
        })
        t["Facilities"].grant_read_write_data(facility_admin)

        triage = function("Triage", "triage", tbl(("triage", "TriageResults")), routes={
            "POST /triage": "post_triage",
            "GET /triage": "list_triage_results",
            "GET /triage/{result_id}": "get_triage_result",
        })
        t["TriageResults"].grant_read_write_data(triage)

        consultation = function("Consultation", "consultation", {
            **tbl(("consultation", "Consultations"), ("message", "Messages"),
                  ("triage", "TriageResults"), ("profile", "Profiles")),
            "VOICE_NOTES_BUCKET": data.voice_notes_bucket.bucket_name,
        }, routes={
            "GET /consultations": "list_consultations",
            "POST /consultations": "post_consultation",
            "GET /consultations/{consultation_id}": "get_consultation",
            "POST /consultations/{consultation_id}/messages": "post_message",
            "POST /consultations/{consultation_id}/voice-note-upload-url": "get_voice_note_upload_url",
            "GET /consultations/{consultation_id}/voice-note/{message_id}": "get_voice_note_download_url",
            "POST /sync": "post_sync",
        })
        for name in ("Consultations", "Messages", "TriageResults"):
            t[name].grant_read_write_data(consultation)
        t["Profiles"].grant_read_data(consultation)
        data.voice_notes_bucket.grant_put(consultation, "voice-notes/*")
        data.voice_notes_bucket.grant_read(consultation, "voice-notes/*")

        payment = function("Payment", "payment", payment_env, timeout=20, routes={
            "GET /payments": "list_payments",
            "POST /payments/initiate": "post_initiate",
            "GET /payments/{payment_id}": "get_payment",
            "POST /payments/{payment_id}/simulate": "post_simulate",
        })
        payment_webhook = function("PaymentWebhook", "payment", payment_env, timeout=20, routes={
            "POST /payments/webhook": "post_webhook",
        })
        for fn in (payment, payment_webhook):
            t["Payments"].grant_read_write_data(fn)
            t["Consultations"].grant_read_write_data(fn)
            read_params(fn, "fapshi/credentials")

        doctor = function("Doctor", "doctor", tbl(
            ("consultation", "Consultations"), ("message", "Messages"), ("triage", "TriageResults"),
            ("prescription", "Prescriptions"), ("referral", "Referrals")), routes={
            "GET /doctor/queue": "get_queue",
            "GET /doctor/queue/{consultation_id}": "get_case",
            "PUT /doctor/queue/{consultation_id}/claim": "claim_consultation",
            "PUT /consultations/{consultation_id}/close": "close_consultation",
            "POST /consultations/{consultation_id}/prescription": "post_prescription",
            "POST /consultations/{consultation_id}/referral": "post_referral",
        })
        t["Consultations"].grant_read_write_data(doctor)
        for name in ("Messages", "TriageResults"):
            t[name].grant_read_data(doctor)
        for name in ("Prescriptions", "Referrals"):
            t[name].grant_read_write_data(doctor)

        doctor_public = function("CodeLookup", "doctor",
            tbl(("prescription", "Prescriptions"), ("referral", "Referrals")), routes={
            "GET /prescriptions/{code}": "get_prescription",
            "GET /referrals/{code}": "get_referral",
        })
        for name in ("Prescriptions", "Referrals"):
            t[name].grant_read_data(doctor_public)

        push_env = {
            **tbl(("push_subscription", "PushSubscriptions")),
            "VAPID_PUBLIC_KEY_PARAM": config.param("push/vapid-public-key"),
            "VAPID_PRIVATE_KEY_PARAM": config.param("push/vapid-private-key"),
            "VAPID_SUBJECT": f"mailto:{config.alert_email}" if config.alert_email else "mailto:ops@carebridge.invalid",
        }
        push = function("Push", "push", push_env, routes={
            "GET /push/vapid-public-key": "get_vapid_public_key",
            "POST /push/subscribe": "post_subscribe",
            "DELETE /push/subscribe": "delete_subscribe",
        })
        t["PushSubscriptions"].grant_read_write_data(push)
        read_params(push, "push/vapid-public-key")

        push_send = function("PushSend", "push", push_env, handler="post_send.handler",
                             timeout=20, layers=[push_deps_layer])
        t["PushSubscriptions"].grant_read_write_data(push_send)
        read_params(push_send, "push/vapid-private-key")

        channel_gateway = function("ChannelGateway", "channel", {
            **tbl(("session", "Sessions"), ("callback", "CallbackRequests")),
            "GATEWAY_TOKEN_PARAM": config.param("channels/gateway-token"),
        }, routes={
            "POST /channels/sms": "post_sms",
            "POST /channels/ussd": "post_ussd",
        })
        t["Sessions"].grant_read_write_data(channel_gateway)
        t["CallbackRequests"].grant_read_write_data(channel_gateway)
        read_params(channel_gateway, "channels/gateway-token")

        operator = function("Operator", "channel",
            tbl(("callback", "CallbackRequests"), ("dispatch_log", "DispatchLogs")), routes={
            "GET /operator/callbacks": "get_callbacks",
            "PUT /operator/callbacks/{request_id}/handle": "put_callback_handle",
            "POST /operator/dispatch-log": "post_dispatch_log",
        })
        t["CallbackRequests"].grant_read_write_data(operator)
        t["DispatchLogs"].grant_read_write_data(operator)

        operator_topic = sns.Topic(self, "OperatorAlertTopic",
            topic_name=f"HealthTrack-OperatorAlerts-{config.env_name}",
            master_key=key,
            enforce_ssl=True,
        )
        if config.alert_email:
            operator_topic.add_subscription(subs.EmailSubscription(config.alert_email))

        extended = function("Extended", "extended", {
            **tbl(("appointment", "Appointments"), ("lab_request", "LabRequests"),
                  ("blood_request", "BloodRequests"), ("emergency", "Emergencies"),
                  ("health_tip", "HealthTips"), ("doctor_presence", "DoctorPresence"),
                  ("facility", "Facilities")),
            "OPERATOR_TOPIC_ARN": operator_topic.topic_arn,
        }, routes={
            "POST /appointments": "post_appointment",
            "GET /appointments": "list_appointments",
            "DELETE /appointments/{appointment_id}": "cancel_appointment",
            "PUT /appointments/{appointment_id}/confirm": "confirm_appointment",
            "POST /lab-requests": "post_lab_request",
            "GET /lab-requests": "list_lab_requests",
            "GET /lab-requests/{request_id}": "get_lab_request",
            "PUT /lab-requests/{request_id}/status": "put_lab_request_status",
            "POST /blood-requests": "post_blood_request",
            "GET /blood-requests": "list_blood_requests",
            "POST /emergency": "post_emergency",
            "GET /operator/emergencies": "list_emergencies",
            "POST /health-tips": "post_health_tip",
            "PUT /health-tips/{tip_id}": "put_health_tip",
            "DELETE /health-tips/{tip_id}": "delete_health_tip",
            "PUT /doctor/presence": "put_doctor_presence",
            "GET /doctors/available": "list_available_doctors",
        })
        for name in ("Appointments", "LabRequests", "BloodRequests", "Emergencies", "HealthTips", "DoctorPresence"):
            t[name].grant_read_write_data(extended)
        t["Facilities"].grant_read_data(extended)
        operator_topic.grant_publish(extended)
        key.grant(extended, "kms:GenerateDataKey*", "kms:Decrypt")

        health_tips_public = function("HealthTipsPublic", "extended", tbl(("health_tip", "HealthTips")), routes={
            "GET /health-tips": "list_health_tips",
        })
        t["HealthTips"].grant_read_data(health_tips_public)

        anonymous = function("Anonymous", "anonymous", {
            **payment_env,
            **tbl(("message", "Messages")),
            "ANON_SESSION_TABLE": t["AnonymousSessions"].table_name,
        }, timeout=20, routes={
            "POST /anonymous/session": "post_session",
            "POST /anonymous/consultations": "post_consultation",
            "GET /anonymous/consultations": "list_consultations",
            "GET /anonymous/consultations/{consultation_id}": "get_consultation",
            "POST /anonymous/consultations/{consultation_id}/messages": "post_message",
            "POST /anonymous/payments/initiate": "post_payment_initiate",
        })
        for name in ("AnonymousSessions", "Consultations", "Messages", "Payments"):
            t[name].grant_read_write_data(anonymous)
        read_params(anonymous, "fapshi/credentials")

        i18n = function("I18n", "i18n", {"I18N_BUCKET": data.i18n_bucket.bucket_name}, routes={
            "GET /i18n/{locale}": "get_locale",
        })
        data.i18n_bucket.grant_read(i18n, "i18n/*")

        # Domain events -> web push (EventBridge default bus).
        events_put = iam.PolicyStatement(actions=["events:PutEvents"], resources=[
            f"arn:aws:events:{self.region}:{self.account}:event-bus/default"])
        for fn in (consultation, payment, payment_webhook):
            fn.add_to_role_policy(events_put)

        dlq = sqs.Queue(self, "PushDeadLetterQueue",
            queue_name=f"HealthTrack-PushDLQ-{config.env_name}",
            encryption=sqs.QueueEncryption.SQS_MANAGED,
            enforce_ssl=True,
            retention_period=Duration.days(14),
        )
        push_send.configure_async_invoke(
            retry_attempts=2,
            max_event_age=Duration.hours(1),
            on_failure=destinations.SqsDestination(dlq),
        )
        events.Rule(self, "PushRule",
            event_pattern=events.EventPattern(source=["health-track"],
                                              detail_type=["payment.confirmed", "message.sent"]),
            targets=[targets.LambdaFunction(push_send, dead_letter_queue=dlq, retry_attempts=2)],
        )

        # -- The one REST API ---------------------------------------------------------------------
        access_logs = logs.LogGroup(self, "ApiAccessLogs",
            log_group_name=f"/health-track/{config.env_name}/api-access",
            retention=logs.RetentionDays.ONE_MONTH,
            encryption_key=key,
            removal_policy=removal,
        )
        # Per-route throttles for public/unauthenticated routes (no WAF: $5+/month breaks the budget).
        public_throttle = {
            "/anonymous/session/POST": (1, 2),
            "/payments/webhook/POST": (2, 5),
            "/channels/sms/POST": (2, 5),
            "/channels/ussd/POST": (2, 5),
            "/prescriptions/{code}/GET": (2, 5),
            "/referrals/{code}/GET": (2, 5),
        }
        api = apigateway.RestApi(self, "Api",
            rest_api_name=f"health-track-{config.env_name}",
            description="Health Track API (single entry point)",
            endpoint_types=[apigateway.EndpointType.REGIONAL],
            cloud_watch_role=True,
            cloud_watch_role_removal_policy=removal,
            min_compression_size=Size.kibibytes(1),  # gzip responses over 1 KB: cheaper on 2G/3G data plans
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=list(config.allowed_origins),
                allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allow_headers=["Content-Type", "Authorization", "Accept-Language",
                               "X-Anonymous-Session", "If-None-Match"],
                expose_headers=["Content-Language", "ETag"],
                max_age=Duration.hours(1),
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                throttling_rate_limit=10,
                throttling_burst_limit=20,
                logging_level=apigateway.MethodLoggingLevel.ERROR,
                data_trace_enabled=False,  # never log request/response bodies (health data)
                metrics_enabled=False,  # per-method metrics are paid custom metrics
                tracing_enabled=True,
                access_log_destination=apigateway.LogGroupLogDestination(access_logs),
                access_log_format=apigateway.AccessLogFormat.json_with_standard_fields(
                    caller=False, http_method=True, ip=True, protocol=True, request_time=True,
                    resource_path=True, response_length=True, status=True, user=False),
                method_options={path: apigateway.MethodDeploymentOptions(
                    throttling_rate_limit=rate, throttling_burst_limit=burst)
                    for path, (rate, burst) in public_throttle.items()},
            ),
        )
        # CORS headers on API Gateway's own errors (401/403/429/5xx), so the browser sees the status.
        for response_type in (apigateway.ResponseType.DEFAULT_4_XX, apigateway.ResponseType.DEFAULT_5_XX):
            api.add_gateway_response(f"Gateway{response_type.response_type}",
                type=response_type,
                response_headers={
                    "Access-Control-Allow-Origin": f"'{cors_origin}'",
                    "Access-Control-Allow-Headers": "'Content-Type,Authorization,Accept-Language,X-Anonymous-Session'",
                },
            )

        # Reject malformed requests at the edge, before they reach (and bill) a Lambda.
        validator = api.add_request_validator("RequestValidator", validate_request_parameters=True,
                                             validate_request_body=True)  # body: only where a model is set
        authorizer = apigateway.CognitoUserPoolsAuthorizer(self, "Authorizer",
            cognito_user_pools=[user_pool],
            authorizer_name=f"health-track-{config.env_name}",
            results_cache_ttl=Duration.minutes(5),
        )
        public_routes = {
            "GET /facilities", "GET /facilities/{facility_id}",
            "GET /prescriptions/{code}", "GET /referrals/{code}",
            "GET /health-tips", "GET /push/vapid-public-key", "GET /i18n/{locale}",
            "POST /payments/webhook", "POST /channels/sms", "POST /channels/ussd",
        }
        for fn, routes in routes_of.items():
            # One invoke permission per function for the whole API, instead of one per method.
            integration = apigateway.LambdaIntegration(fn, scope_permission_to_method=False)
            for route in routes:
                method, path = route.split(" ", 1)
                resource = api.root.resource_for_path(path)
                if route in public_routes or path.startswith("/anonymous/"):
                    # Anonymous routes authenticate the X-Anonymous-Session header in the handler.
                    resource.add_method(method, integration, request_validator=validator,
                                        authorization_type=apigateway.AuthorizationType.NONE)
                else:
                    resource.add_method(method, integration, authorizer=authorizer, request_validator=validator,
                                        authorization_type=apigateway.AuthorizationType.COGNITO)

        # -- Alarms (free tier: first 10) ------------------------------------------------------------
        alarm_action = cw_actions.SnsAction(alert_topic)
        api_dims = {"ApiName": api.rest_api_name, "Stage": config.env_name}

        def alarm(name, metric, threshold, description, periods=1):
            a = cloudwatch.Alarm(self, name,
                alarm_name=f"HealthTrack-{config.env_name}-{name}",
                alarm_description=description,
                metric=metric,
                threshold=threshold,
                evaluation_periods=periods,
                comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
                treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
            )
            a.add_alarm_action(alarm_action)
            return a

        five_min = Duration.minutes(5)
        api_5xx = cloudwatch.Metric(namespace="AWS/ApiGateway", metric_name="5XXError",
                                    dimensions_map=api_dims, statistic="Sum", period=five_min)
        api_4xx = cloudwatch.Metric(namespace="AWS/ApiGateway", metric_name="4XXError",
                                    dimensions_map=api_dims, statistic="Sum", period=five_min)
        api_latency = cloudwatch.Metric(namespace="AWS/ApiGateway", metric_name="Latency",
                                        dimensions_map=api_dims, statistic="p95", period=Duration.minutes(15))
        api_count = cloudwatch.Metric(namespace="AWS/ApiGateway", metric_name="Count",
                                      dimensions_map=api_dims, statistic="Sum", period=five_min)
        alarm("Api5xx", api_5xx, 1, "Any server error from the API (handlers return 500 on exceptions)")
        alarm("Api4xxSpike", api_4xx, 100, "Unusual 4xx volume: abuse, broken client or expired auth")
        alarm("ApiLatencyP95", api_latency, 5000, "p95 latency above 5 s for 15 minutes")
        alarm("PushSendErrors", push_send.metric_errors(period=five_min), 1, "Web push sender failing")
        alarm("PushDlqNotEmpty", dlq.metric_approximate_number_of_messages_visible(period=five_min), 1,
              "Notifications failed after retries (see the dead-letter queue)")
        alarm("LambdaThrottles",
              cloudwatch.Metric(namespace="AWS/Lambda", metric_name="Throttles", statistic="Sum", period=five_min),
              1, "Account-level Lambda throttling (the account concurrency limit is shared)")

        api_functions = list(routes_of)
        cloudwatch.Dashboard(self, "Dashboard",
            dashboard_name=f"HealthTrack-{config.env_name}",
            widgets=[
                [cloudwatch.GraphWidget(title="API requests and errors", width=12,
                                        left=[api_count, api_4xx, api_5xx]),
                 cloudwatch.GraphWidget(title="API latency p95 (ms)", width=12, left=[api_latency])],
                [cloudwatch.GraphWidget(title="Lambda errors by domain", width=12,
                                        left=[fn.metric_errors(period=five_min) for fn in api_functions]),
                 cloudwatch.GraphWidget(title="Lambda duration p95 by domain", width=12,
                                        left=[fn.metric_duration(statistic="p95", period=five_min)
                                              for fn in api_functions])],
                # Business KPIs from structured logs (events.record): free, unlike custom metrics.
                [cloudwatch.LogQueryWidget(title="Business events (triage by urgency, consultations, payments)",
                    width=24, log_group_names=[f"/aws/lambda/HealthTrack-{n}-{config.env_name}" for n in
                                               ("Triage", "Consultation", "Payment", "PaymentWebhook", "Extended")],
                    query_lines=["filter message like /^business_event /",
                                 "parse message 'business_event *' as event",
                                 "stats count(*) as total by event"])],
            ],
        )

        CfnOutput(self, "ApiUrl", value=api.url)
        CfnOutput(self, "OperatorAlertTopicArn", value=operator_topic.topic_arn)
