from aws_cdk import (
    Stack, CfnOutput, Duration, RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_apigateway as apigateway,
    aws_sns as sns,
)
from constructs import Construct
from health_track.config import Config
from health_track.shared_stack import SharedStack
from health_track.auth_stack import AuthStack


class ExtendedStack(Stack):
    """Phase 9: appointments, lab tests, blood requests, emergencies, health tips, doctor presence."""

    def __init__(self, scope: Construct, construct_id: str, *,
                 env, config: Config,
                 shared_stack: SharedStack,
                 auth_stack: AuthStack) -> None:
        super().__init__(scope, construct_id, env=env)

        layer = lambda_.LayerVersion.from_layer_version_arn(
            self, "CommonLayer", shared_stack.common_layer.layer_version_arn
        )

        removal_policy = RemovalPolicy.RETAIN if config.env_name == "prod" else RemovalPolicy.DESTROY

        def _table(cid, name, pk, export, **kwargs):
            table = dynamodb.Table(
                self, cid,
                table_name=f"HealthTrack-{name}-{config.env_name}",
                partition_key=dynamodb.Attribute(name=pk, type=dynamodb.AttributeType.STRING),
                billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
                point_in_time_recovery=True,
                removal_policy=removal_policy,
                **kwargs,
            )
            CfnOutput(self, f"{cid}NameOutput",
                export_name=f"HealthTrack-{export}-{config.env_name}",
                value=table.table_name,
            )
            return table

        def _gsi(table, index_name, pk, sk, sk_type):
            table.add_global_secondary_index(
                index_name=index_name,
                partition_key=dynamodb.Attribute(name=pk, type=dynamodb.AttributeType.STRING),
                sort_key=dynamodb.Attribute(name=sk, type=sk_type),
                projection_type=dynamodb.ProjectionType.ALL,
            )

        S, N = dynamodb.AttributeType.STRING, dynamodb.AttributeType.NUMBER

        # -- Tables ---------------------------------------------------------------
        self.appointment_table = _table("AppointmentTable", "Appointments", "appointment_id",
                                        "AppointmentTableName")
        _gsi(self.appointment_table, "PatientIndex", "patient_id", "created_at", N)
        _gsi(self.appointment_table, "StatusIndex", "status", "slot_date", S)

        self.lab_request_table = _table("LabRequestTable", "LabRequests", "request_id",
                                        "LabRequestTableName")
        _gsi(self.lab_request_table, "PatientIndex", "patient_id", "created_at", N)

        self.blood_request_table = _table("BloodRequestTable", "BloodRequests", "request_id",
                                          "BloodRequestTableName")
        _gsi(self.blood_request_table, "StatusIndex", "status", "created_at", N)

        self.emergency_table = _table("EmergencyTable", "Emergencies", "emergency_id",
                                      "EmergencyTableName", time_to_live_attribute="ttl")

        self.health_tip_table = _table("HealthTipTable", "HealthTips", "tip_id",
                                       "HealthTipTableName")
        _gsi(self.health_tip_table, "LocaleIndex", "locale", "published_date", S)

        self.doctor_presence_table = _table("DoctorPresenceTable", "DoctorPresence", "doctor_id",
                                            "DoctorPresenceTableName")

        # -- Operator alert topic -------------------------------------------------
        self.operator_topic = sns.Topic(
            self, "OperatorAlertTopic",
            topic_name=f"HealthTrack-OperatorAlerts-{config.env_name}",
        )
        CfnOutput(self, "OperatorAlertTopicArnOutput",
            export_name=f"HealthTrack-OperatorAlertTopicArn-{config.env_name}",
            value=self.operator_topic.topic_arn,
        )

        # FacilityTable (FacilityStack) is referenced by name: read-only Query on table + index
        facility_table_arn = (f"arn:aws:dynamodb:{config.region}:{config.account}"
                              f":table/HealthTrack-Facilities-{config.env_name}")
        facility_read_policy = iam.PolicyStatement(
            actions=["dynamodb:Query"],
            resources=[facility_table_arn, f"{facility_table_arn}/index/CapabilityIndex"],
        )

        # -- Lambda helpers -------------------------------------------------------
        lambda_dir = "health_track/lambdas/extended"

        def _make_fn(cid, handler_name, env_vars):
            return lambda_.Function(
                self, cid,
                runtime=lambda_.Runtime.PYTHON_3_12,
                code=lambda_.Code.from_asset(lambda_dir),
                handler=handler_name,
                memory_size=256,
                timeout=Duration.seconds(30),
                layers=[layer],
                environment={**env_vars, "ENV_NAME": config.env_name},
            )

        appt_env = {"APPOINTMENT_TABLE": self.appointment_table.table_name}
        lab_env = {"LAB_REQUEST_TABLE": self.lab_request_table.table_name}
        blood_env = {"BLOOD_REQUEST_TABLE": self.blood_request_table.table_name}
        emergency_env = {"EMERGENCY_TABLE": self.emergency_table.table_name}
        tip_env = {"HEALTH_TIP_TABLE": self.health_tip_table.table_name}
        presence_env = {"DOCTOR_PRESENCE_TABLE": self.doctor_presence_table.table_name}

        # Appointments
        post_appointment_fn = _make_fn("PostAppointmentFn", "post_appointment.handler", appt_env)
        self.appointment_table.grant_write_data(post_appointment_fn)
        list_appointments_fn = _make_fn("ListAppointmentsFn", "list_appointments.handler", appt_env)
        self.appointment_table.grant_read_data(list_appointments_fn)
        confirm_appointment_fn = _make_fn("ConfirmAppointmentFn", "confirm_appointment.handler", appt_env)
        self.appointment_table.grant_read_write_data(confirm_appointment_fn)
        cancel_appointment_fn = _make_fn("CancelAppointmentFn", "cancel_appointment.handler", appt_env)
        self.appointment_table.grant_read_write_data(cancel_appointment_fn)

        # Lab requests
        post_lab_fn = _make_fn("PostLabRequestFn", "post_lab_request.handler", lab_env)
        self.lab_request_table.grant_write_data(post_lab_fn)
        list_lab_fn = _make_fn("ListLabRequestsFn", "list_lab_requests.handler", lab_env)
        self.lab_request_table.grant_read_data(list_lab_fn)
        get_lab_fn = _make_fn("GetLabRequestFn", "get_lab_request.handler", lab_env)
        self.lab_request_table.grant_read_data(get_lab_fn)
        put_lab_status_fn = _make_fn("PutLabRequestStatusFn", "put_lab_request_status.handler", lab_env)
        self.lab_request_table.grant_read_write_data(put_lab_status_fn)

        # Blood requests
        post_blood_fn = _make_fn("PostBloodRequestFn", "post_blood_request.handler", {
            **blood_env,
            "FACILITY_TABLE": f"HealthTrack-Facilities-{config.env_name}",
        })
        self.blood_request_table.grant_write_data(post_blood_fn)
        post_blood_fn.add_to_role_policy(facility_read_policy)
        list_blood_fn = _make_fn("ListBloodRequestsFn", "list_blood_requests.handler", blood_env)
        self.blood_request_table.grant_read_data(list_blood_fn)

        # Emergency
        post_emergency_fn = _make_fn("PostEmergencyFn", "post_emergency.handler", {
            **emergency_env,
            "OPERATOR_TOPIC_ARN": self.operator_topic.topic_arn,
        })
        self.emergency_table.grant_write_data(post_emergency_fn)
        self.operator_topic.grant_publish(post_emergency_fn)
        list_emergencies_fn = _make_fn("ListEmergenciesFn", "list_emergencies.handler", emergency_env)
        self.emergency_table.grant_read_data(list_emergencies_fn)

        # Health tips
        list_tips_fn = _make_fn("ListHealthTipsFn", "list_health_tips.handler", tip_env)
        self.health_tip_table.grant_read_data(list_tips_fn)
        post_tip_fn = _make_fn("PostHealthTipFn", "post_health_tip.handler", tip_env)
        self.health_tip_table.grant_write_data(post_tip_fn)
        put_tip_fn = _make_fn("PutHealthTipFn", "put_health_tip.handler", tip_env)
        self.health_tip_table.grant_write_data(put_tip_fn)
        delete_tip_fn = _make_fn("DeleteHealthTipFn", "delete_health_tip.handler", tip_env)
        self.health_tip_table.grant_write_data(delete_tip_fn)

        # Doctor presence
        put_presence_fn = _make_fn("PutDoctorPresenceFn", "put_doctor_presence.handler", presence_env)
        self.doctor_presence_table.grant_write_data(put_presence_fn)
        list_doctors_fn = _make_fn("ListAvailableDoctorsFn", "list_available_doctors.handler", presence_env)
        self.doctor_presence_table.grant_read_data(list_doctors_fn)

        # -- ExtendedApi ----------------------------------------------------------
        api = apigateway.RestApi(
            self, "ExtendedApi",
            rest_api_name=f"health-track-extended-{config.env_name}",
            cloud_watch_role=True,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
            ),
            deploy_options=apigateway.StageOptions(
                stage_name=config.env_name,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                data_trace_enabled=(config.env_name == "dev"),
            ),
        )

        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "ExtendedAuthorizer",
            cognito_user_pools=[auth_stack.user_pool],
        )

        def _cognito(resource, method, fn):
            resource.add_method(
                method,
                apigateway.LambdaIntegration(fn),
                authorization_type=apigateway.AuthorizationType.COGNITO,
                authorizer=authorizer,
            )

        # /appointments
        appointments_res = api.root.add_resource("appointments")
        _cognito(appointments_res, "POST", post_appointment_fn)
        _cognito(appointments_res, "GET", list_appointments_fn)
        appointment_item_res = appointments_res.add_resource("{appointment_id}")
        _cognito(appointment_item_res, "DELETE", cancel_appointment_fn)
        _cognito(appointment_item_res.add_resource("confirm"), "PUT", confirm_appointment_fn)

        # /lab-requests
        lab_res = api.root.add_resource("lab-requests")
        _cognito(lab_res, "POST", post_lab_fn)
        _cognito(lab_res, "GET", list_lab_fn)
        lab_item_res = lab_res.add_resource("{request_id}")
        _cognito(lab_item_res, "GET", get_lab_fn)
        _cognito(lab_item_res.add_resource("status"), "PUT", put_lab_status_fn)

        # /blood-requests
        blood_res = api.root.add_resource("blood-requests")
        _cognito(blood_res, "POST", post_blood_fn)
        _cognito(blood_res, "GET", list_blood_fn)

        # /emergency and /operator/emergencies
        _cognito(api.root.add_resource("emergency"), "POST", post_emergency_fn)
        _cognito(api.root.add_resource("operator").add_resource("emergencies"), "GET", list_emergencies_fn)

        # /health-tips  (GET is public)
        tips_res = api.root.add_resource("health-tips")
        tips_res.add_method(
            "GET",
            apigateway.LambdaIntegration(list_tips_fn),
            authorization_type=apigateway.AuthorizationType.NONE,
        )
        _cognito(tips_res, "POST", post_tip_fn)
        tip_item_res = tips_res.add_resource("{tip_id}")
        _cognito(tip_item_res, "PUT", put_tip_fn)
        _cognito(tip_item_res, "DELETE", delete_tip_fn)

        # /doctor/presence and /doctors/available
        _cognito(api.root.add_resource("doctor").add_resource("presence"), "PUT", put_presence_fn)
        _cognito(api.root.add_resource("doctors").add_resource("available"), "GET", list_doctors_fn)

        CfnOutput(self, "ExtendedApiUrlOutput",
            export_name=f"HealthTrack-ExtendedApiUrl-{config.env_name}",
            value=api.url,
        )
