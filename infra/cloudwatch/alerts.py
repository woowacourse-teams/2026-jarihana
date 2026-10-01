#!/usr/bin/env python3
"""Render CloudFormation for Jarihana alarms and the Discord webhook route."""

import json


def parameter(description, default=None, allowed_pattern=None, no_echo=False):
    result = {"Type": "String", "Description": description}
    if default is not None:
        result["Default"] = default
    if allowed_pattern is not None:
        result["AllowedPattern"] = allowed_pattern
    if no_echo:
        result["NoEcho"] = True
    return result


def dimension(name, value):
    return {"Name": name, "Value": value}


def alarm(name, description, namespace, metric, dimensions, statistic, period,
          threshold, comparison, evaluation_periods, datapoints_to_alarm,
          missing_data, condition=None):
    properties = {
        "AlarmName": name,
        "AlarmDescription": description,
        "ActionsEnabled": True,
        "Namespace": namespace,
        "MetricName": metric,
        "Statistic": statistic,
        "Period": period,
        "EvaluationPeriods": evaluation_periods,
        "DatapointsToAlarm": datapoints_to_alarm,
        "Threshold": threshold,
        "ComparisonOperator": comparison,
        "TreatMissingData": missing_data,
    }
    if dimensions:
        properties["Dimensions"] = dimensions
    resource = {"Type": "AWS::CloudWatch::Alarm", "Properties": properties}
    if condition:
        resource["Condition"] = condition
    return resource


def app_dimensions(environment, status_class=None):
    result = [
        dimension("application", "jarihana"),
        dimension("environment", environment),
    ]
    if status_class is not None:
        result.append(dimension("status_class", status_class))
    return result


def non_empty(parameter_name):
    return {"Fn::Not": [{"Fn::Equals": [{"Ref": parameter_name}, ""]}]}


def parameter_is_true(parameter_name):
    return {"Fn::Equals": [{"Ref": parameter_name}, "true"]}


def log_filter_enabled(environment):
    prefix = environment.title()
    configured = {
        "Fn::And": [
            non_empty(f"{prefix}BackendLogGroupName"),
            non_empty(f"{prefix}Http5xxLogPattern"),
        ]
    }
    if environment == "dev":
        return {"Fn::And": [{"Condition": "EnableDevApplicationAlarms"}, configured]}
    return configured


def log_filter_rule(environment):
    prefix = environment.title()
    group_empty = {"Fn::Equals": [{"Ref": f"{prefix}BackendLogGroupName"}, ""]}
    pattern_empty = {"Fn::Equals": [{"Ref": f"{prefix}Http5xxLogPattern"}, ""]}
    return {
        "Assertions": [{
            "Assert": {
                "Fn::Or": [
                    {"Fn::And": [group_empty, pattern_empty]},
                    {
                        "Fn::And": [
                            {"Fn::Not": [group_empty]},
                            {"Fn::Not": [pattern_empty]},
                        ]
                    },
                ]
            },
            "AssertDescription": (
                f"Set both {prefix}BackendLogGroupName and "
                f"{prefix}Http5xxLogPattern, or leave both empty."
            ),
        }]
    }


def log_filter_resources(environment):
    prefix = environment.title()
    label = environment.upper()
    metric_name = f"http-5xx-{environment}"
    condition = f"Use{prefix}Log5xx"
    alarm_name = f"[{label}] HTTP 5xx detected (application log)"
    filter_name = f"jarihana-{environment}-http-5xx"
    return {
        f"{prefix}Http5xxLogFilter": {
            "Type": "AWS::Logs::MetricFilter",
            "Condition": condition,
            "Properties": {
                "FilterName": filter_name,
                "LogGroupName": {"Ref": f"{prefix}BackendLogGroupName"},
                "FilterPattern": {"Ref": f"{prefix}Http5xxLogPattern"},
                "MetricTransformations": [{
                    "MetricNamespace": "Jarihana/Alerts",
                    "MetricName": metric_name,
                    "MetricValue": "1",
                }],
            },
        },
        f"{prefix}Http5xxLogAlarm": alarm(
            alarm_name,
            f"[{label}] At least one HTTP 5xx request was recorded in the last minute.",
            "Jarihana/Alerts",
            metric_name,
            [],
            "Sum",
            60,
            1,
            "GreaterThanOrEqualToThreshold",
            1,
            1,
            "notBreaching",
            condition,
        ),
    }


def discord_alarm_target(target_id):
    return {
        "Id": target_id,
        "Arn": {"Fn::GetAtt": ["DiscordApiDestination", "Arn"]},
        "RoleArn": {"Fn::GetAtt": ["DiscordInvokeRole", "Arn"]},
        "RetryPolicy": {
            "MaximumEventAgeInSeconds": 3600,
            "MaximumRetryAttempts": 12,
        },
        "DeadLetterConfig": {
            "Arn": {"Fn::GetAtt": ["DiscordAlarmDeliveryDlq", "Arn"]}
        },
        "InputTransformer": {
            "InputPathsMap": {
                "alarmName": "$.detail.alarmName",
                "state": "$.detail.state.value",
                "time": "$.time",
            },
            "InputTemplate": (
                "{\"content\":\"**CloudWatch <state>** | <alarmName>\\n"
                "<time>\",\"allowed_mentions\":{\"parse\":[]}}"
            ),
        },
    }


def discord_alarm_event_pattern(state, previous_state=None):
    detail = {
        "alarmName": [
            {"prefix": "[PROD]"},
            {"prefix": "[DEV]"},
            {"prefix": "[EC2]"},
        ],
        "state": {"value": [state]},
    }
    if previous_state is not None:
        detail["previousState"] = {"value": [previous_state]}
    return {
        "source": ["aws.cloudwatch"],
        "detail-type": ["CloudWatch Alarm State Change"],
        "detail": detail,
    }


def template():
    resources = {
        "DiscordConnection": {
            "Type": "AWS::Events::Connection",
            "Properties": {
                "Name": "jarihana-discord",
                "Description": "Connection for the Jarihana Discord webhook.",
                "AuthorizationType": "API_KEY",
                "AuthParameters": {
                    "ApiKeyAuthParameters": {
                        "ApiKeyName": "X-EventBridge-Connection",
                        "ApiKeyValue": "discord-webhook-auth-is-in-url",
                    }
                },
            },
        },
        "DiscordApiDestination": {
            "Type": "AWS::Events::ApiDestination",
            "Properties": {
                "Name": "jarihana-discord-alerts",
                "Description": "Deliver CloudWatch alarm state changes to Discord.",
                "ConnectionArn": {"Fn::GetAtt": ["DiscordConnection", "Arn"]},
                "InvocationEndpoint": {
                    "Fn::Sub": "${DiscordWebhookUrl}?wait=true"
                },
                "HttpMethod": "POST",
                "InvocationRateLimitPerSecond": 1,
            },
        },
        "DiscordInvokeRole": {
            "Type": "AWS::IAM::Role",
            "Properties": {
                "AssumeRolePolicyDocument": {
                    "Version": "2012-10-17",
                    "Statement": [{
                        "Effect": "Allow",
                        "Principal": {"Service": "events.amazonaws.com"},
                        "Action": "sts:AssumeRole",
                    }],
                },
                "Policies": [{
                    "PolicyName": "InvokeJarihanaDiscordDestination",
                    "PolicyDocument": {
                        "Version": "2012-10-17",
                        "Statement": [{
                            "Effect": "Allow",
                            "Action": "events:InvokeApiDestination",
                            "Resource": {"Fn::GetAtt": ["DiscordApiDestination", "Arn"]},
                        }],
                    },
                }],
            },
        },
        "DiscordAlarmDeliveryDlq": {
            "Type": "AWS::SQS::Queue",
            "Properties": {
                "QueueName": "jarihana-discord-alerts-dlq",
                "MessageRetentionPeriod": 1209600,
                "SqsManagedSseEnabled": True,
            },
        },
        "DiscordAlarmDeliveryDlqPolicy": {
            "Type": "AWS::SQS::QueuePolicy",
            "Properties": {
                "Queues": [{"Ref": "DiscordAlarmDeliveryDlq"}],
                "PolicyDocument": {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": {"Service": "events.amazonaws.com"},
                            "Action": "sqs:SendMessage",
                            "Resource": {"Fn::GetAtt": ["DiscordAlarmDeliveryDlq", "Arn"]},
                            "Condition": {
                                "ArnEquals": {
                                    "aws:SourceArn": {
                                        "Fn::GetAtt": ["DiscordAlarmEnteredAlarm", "Arn"]
                                    }
                                }
                            },
                        },
                        {
                            "Effect": "Allow",
                            "Principal": {"Service": "events.amazonaws.com"},
                            "Action": "sqs:SendMessage",
                            "Resource": {"Fn::GetAtt": ["DiscordAlarmDeliveryDlq", "Arn"]},
                            "Condition": {
                                "ArnEquals": {
                                    "aws:SourceArn": {
                                        "Fn::GetAtt": ["DiscordAlarmRecovered", "Arn"]
                                    }
                                }
                            },
                        },
                    ],
                },
            },
        },
        "DiscordAlarmEnteredAlarm": {
            "Type": "AWS::Events::Rule",
            "Properties": {
                "Name": "jarihana-cloudwatch-alarm-alarm",
                "Description": "Send Jarihana alarm transitions to Discord.",
                "State": "ENABLED",
                "EventPattern": discord_alarm_event_pattern("ALARM"),
                "Targets": [discord_alarm_target("JarihanaDiscordAlarm")],
            },
        },
        "DiscordAlarmRecovered": {
            "Type": "AWS::Events::Rule",
            "Properties": {
                "Name": "jarihana-cloudwatch-alarm-recovered",
                "Description": "Send Jarihana recovery transitions to Discord.",
                "State": "ENABLED",
                "EventPattern": discord_alarm_event_pattern("OK", "ALARM"),
                "Targets": [discord_alarm_target("JarihanaDiscordRecovery")],
            },
        },
    }

    for environment in ("prod", "dev"):
        prefix = environment.title()
        label = environment.upper()
        log_condition = f"Use{prefix}Log5xx"
        metric_condition = f"Use{prefix}Metric5xx"
        resources[f"{prefix}Http5xxMetricAlarm"] = alarm(
            f"[{label}] HTTP 5xx detected (Prometheus metric)",
            (
                f"[{label}] At least one reported HTTP 5xx in 60 seconds. "
                "A new Prometheus counter series can miss its first increment."
            ),
            "Jarihana",
            "http_server_requests_seconds_count",
            app_dimensions(environment, "5xx"),
            "Sum",
            60,
            1,
            "GreaterThanOrEqualToThreshold",
            1,
            1,
            "notBreaching",
            metric_condition,
        )
        resources[f"{prefix}ApplicationCpuHigh"] = alarm(
            f"[{label}] Application CPU at least 80% for five minutes",
            f"[{label}] Application process CPU usage averaged at least 80% for five minutes.",
            "Jarihana",
            "process_cpu_usage",
            app_dimensions(environment),
            "Average",
            60,
            0.8,
            "GreaterThanOrEqualToThreshold",
            5,
            5,
            "missing",
        )
        resources[f"{prefix}GcOverheadHigh"] = alarm(
            f"[{label}] JVM GC overhead at least 10%",
            f"[{label}] JVM GC overhead was at least 10% in three of five minutes.",
            "Jarihana",
            "jvm_gc_overhead",
            app_dimensions(environment),
            "Average",
            60,
            0.1,
            "GreaterThanOrEqualToThreshold",
            5,
            3,
            "notBreaching",
        )
        resources[f"{prefix}AppTelemetryMissing"] = alarm(
            f"[{label}] Application telemetry missing",
            (
                f"[{label}] No process CPU metric for three consecutive minutes. "
                "This can indicate an application or CloudWatch Agent problem."
            ),
            "Jarihana",
            "process_cpu_usage",
            app_dimensions(environment),
            "Average",
            60,
            -1,
            "LessThanThreshold",
            3,
            3,
            "breaching",
        )
        if environment == "dev":
            for resource_name in (
                "DevApplicationCpuHigh",
                "DevGcOverheadHigh",
                "DevAppTelemetryMissing",
            ):
                resources[resource_name]["Condition"] = "EnableDevApplicationAlarms"
        resources.update(log_filter_resources(environment))

    host_dimensions = [dimension("InstanceId", {"Ref": "InstanceId"})]
    resources.update({
        "Ec2StatusFailed": alarm(
            "[EC2] Instance status check failed",
            "The shared EC2 instance has a failed status check.",
            "AWS/EC2",
            "StatusCheckFailed",
            host_dimensions,
            "Maximum",
            60,
            1,
            "GreaterThanOrEqualToThreshold",
            2,
            1,
            "breaching",
        ),
        "Ec2CpuHigh": alarm(
            "[EC2] CPU at least 70% for ten minutes",
            "The shared EC2 CPU average was at least 70% for two five-minute periods.",
            "AWS/EC2",
            "CPUUtilization",
            host_dimensions,
            "Average",
            300,
            70,
            "GreaterThanOrEqualToThreshold",
            2,
            2,
            "missing",
        ),
        "Ec2MemoryHigh": alarm(
            "[EC2] Memory at least 70% for five minutes",
            "The shared EC2 memory average was at least 70% for five one-minute periods.",
            "Jarihana",
            "mem_used_percent",
            host_dimensions,
            "Average",
            60,
            70,
            "GreaterThanOrEqualToThreshold",
            5,
            5,
            "missing",
        ),
        "Ec2DiskHigh": alarm(
            "[EC2] Root disk at least 80% for five minutes",
            "The shared EC2 root filesystem average was at least 80% for five minutes.",
            "Jarihana",
            "disk_used_percent",
            host_dimensions + [
                dimension("path", "/"),
                dimension("fstype", {"Ref": "RootFilesystemType"}),
            ],
            "Average",
            60,
            80,
            "GreaterThanOrEqualToThreshold",
            5,
            5,
            "missing",
        ),
    })

    conditions = {
        "EnableDevApplicationAlarms": parameter_is_true("EnableDevApplicationAlarms"),
    }
    for environment in ("prod", "dev"):
        prefix = environment.title()
        log_condition = f"Use{prefix}Log5xx"
        conditions[log_condition] = log_filter_enabled(environment)
        metric_fallback = {
            "Fn::Not": [{"Condition": log_condition}]
        }
        if environment == "dev":
            conditions[f"Use{prefix}Metric5xx"] = {
                "Fn::And": [
                    {"Condition": "EnableDevApplicationAlarms"},
                    metric_fallback,
                ]
            }
        else:
            conditions[f"Use{prefix}Metric5xx"] = metric_fallback

    return {
        "AWSTemplateFormatVersion": "2010-09-09",
        "Description": (
            "Jarihana prod/dev CloudWatch alarms on one shared EC2 instance, "
            "with alarm state changes delivered to Discord through EventBridge."
        ),
        "Parameters": {
            "InstanceId": parameter(
                "The shared EC2 instance ID used by host metric alarms.",
                allowed_pattern="^i-[0-9a-f]+$",
            ),
            "RootFilesystemType": parameter(
                "Root filesystem type from df -T /; it is a CloudWatch metric dimension."
            ),
            "DiscordWebhookUrl": parameter(
                "Discord incoming webhook URL. Keep it in the GitHub Actions secret DISCORD_WEBHOOK_URL.",
                no_echo=True,
            ),
            "EnableDevApplicationAlarms": {
                "Type": "String",
                "Description": (
                    "Enable dev application alarms after dev metrics are present in CloudWatch."
                ),
                "Default": "false",
                "AllowedValues": ["true", "false"],
            },
            "ProdBackendLogGroupName": parameter(
                "Existing prod application log group; keep blank until the ECS log group is known.",
                default="",
            ),
            "ProdHttp5xxLogPattern": parameter(
                "Tested filter pattern matching exactly one prod HTTP 5xx request event.",
                default="",
            ),
            "DevBackendLogGroupName": parameter(
                "Existing dev application log group; keep blank until the ECS log group is known.",
                default="",
            ),
            "DevHttp5xxLogPattern": parameter(
                "Tested filter pattern matching exactly one dev HTTP 5xx request event.",
                default="",
            ),
        },
        "Rules": {
            "ProdLogFilterConfiguration": log_filter_rule("prod"),
            "DevLogFilterConfiguration": log_filter_rule("dev"),
        },
        "Conditions": conditions,
        "Resources": resources,
        "Outputs": {
            "DiscordApiDestinationArn": {
                "Value": {"Fn::GetAtt": ["DiscordApiDestination", "Arn"]}
            },
            "DiscordAlarmDeliveryDlqUrl": {
                "Value": {"Ref": "DiscordAlarmDeliveryDlq"}
            },
            "DevApplicationAlarmsEnabled": {
                "Value": {"Ref": "EnableDevApplicationAlarms"}
            },
        },
    }


if __name__ == "__main__":
    print(json.dumps(template(), ensure_ascii=False, indent=2))
