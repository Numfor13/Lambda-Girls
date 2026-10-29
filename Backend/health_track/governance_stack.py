from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    RemovalPolicy,
    aws_budgets as budgets,
    aws_cloudtrail as cloudtrail,
    aws_kms as kms,
    aws_s3 as s3,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
)
from constructs import Construct
from health_track.config import Config


class GovernanceStack(Stack):
    """Cost guardrail, audit trail and the alert topic every alarm publishes to."""

    def __init__(self, scope: Construct, construct_id: str, *, config: Config,
                 key: kms.IKey, health_table_arns: list, voice_notes_bucket: s3.IBucket,
                 logs_bucket: s3.IBucket, doctor_documents_bucket: s3.IBucket, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        removal = RemovalPolicy.RETAIN if config.is_prod else RemovalPolicy.DESTROY

        self.alert_topic = sns.Topic(self, "AlertTopic",
            topic_name=f"HealthTrack-Alerts-{config.env_name}",
            master_key=key,
            enforce_ssl=True,
        )
        if config.alert_email:
            self.alert_topic.add_subscription(subs.EmailSubscription(config.alert_email))

        # Monthly cost budget, filtered on the Project cost-allocation tag (activated once in Billing).
        subscribers = ([budgets.CfnBudget.SubscriberProperty(subscription_type="EMAIL", address=config.alert_email)]
                       if config.alert_email else [])
        notifications = [
            ("ACTUAL", 80), ("FORECASTED", 100),
        ]
        budgets.CfnBudget(self, "MonthlyBudget",
            budget=budgets.CfnBudget.BudgetDataProperty(
                budget_name=f"HealthTrack-{config.env_name}-monthly",
                budget_type="COST",
                time_unit="MONTHLY",
                budget_limit=budgets.CfnBudget.SpendProperty(amount=config.monthly_budget_usd, unit="USD"),
                cost_filters={"TagKeyValue": ["user:Project$HealthTrack"]},
            ),
            notifications_with_subscribers=[
                budgets.CfnBudget.NotificationWithSubscribersProperty(
                    notification=budgets.CfnBudget.NotificationProperty(
                        notification_type=kind,
                        comparison_operator="GREATER_THAN",
                        threshold=pct,
                        threshold_type="PERCENTAGE",
                    ),
                    subscribers=subscribers,
                ) for kind, pct in notifications
            ] if subscribers else None,
        )

        if config.enable_trail:
            trail_bucket = s3.Bucket(self, "TrailBucket",
                encryption=s3.BucketEncryption.S3_MANAGED,
                block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
                enforce_ssl=True,
                server_access_logs_bucket=logs_bucket,
                server_access_logs_prefix="trail/",
                lifecycle_rules=[s3.LifecycleRule(expiration=Duration.days(365))],
                removal_policy=removal,
                auto_delete_objects=not config.is_prod,
            )
            # The account's first management-event trail is free; data events are $0.10 per 100k.
            trail = cloudtrail.Trail(self, "Trail",
                trail_name=f"health-track-{config.env_name}",
                bucket=trail_bucket,
                is_multi_region_trail=True,
                include_global_service_events=True,
                enable_file_validation=True,
            )
            # Who read or changed health records: DynamoDB data events on Health Track tables only.
            cfn_trail = trail.node.default_child
            cfn_trail.advanced_event_selectors = [
                cloudtrail.CfnTrail.AdvancedEventSelectorProperty(
                    name="Management events",
                    field_selectors=[cloudtrail.CfnTrail.AdvancedFieldSelectorProperty(
                        field="eventCategory", equal_to=["Management"])],
                ),
                cloudtrail.CfnTrail.AdvancedEventSelectorProperty(
                    name="Health Track table data events",
                    field_selectors=[
                        cloudtrail.CfnTrail.AdvancedFieldSelectorProperty(field="eventCategory", equal_to=["Data"]),
                        cloudtrail.CfnTrail.AdvancedFieldSelectorProperty(
                            field="resources.type", equal_to=["AWS::DynamoDB::Table"]),
                        cloudtrail.CfnTrail.AdvancedFieldSelectorProperty(
                            field="resources.ARN", equal_to=health_table_arns),
                    ],
                ),
                cloudtrail.CfnTrail.AdvancedEventSelectorProperty(
                    name="Voice note and doctor document object events",
                    field_selectors=[
                        cloudtrail.CfnTrail.AdvancedFieldSelectorProperty(field="eventCategory", equal_to=["Data"]),
                        cloudtrail.CfnTrail.AdvancedFieldSelectorProperty(
                            field="resources.type", equal_to=["AWS::S3::Object"]),
                        cloudtrail.CfnTrail.AdvancedFieldSelectorProperty(
                            field="resources.ARN", starts_with=[f"{voice_notes_bucket.bucket_arn}/",
                                                              f"{doctor_documents_bucket.bucket_arn}/"]),
                    ],
                ),
            ]

        CfnOutput(self, "AlertTopicArn", value=self.alert_topic.topic_arn)
