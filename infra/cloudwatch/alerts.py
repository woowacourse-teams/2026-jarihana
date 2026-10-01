#!/usr/bin/env python3
"""Render CloudFormation for Jarihana CloudWatch alarms.

Discord delivery is intentionally outside this stack. The self-hosted runner
polls alarm state with the existing CloudWatch read permission and posts state
transitions to Discord. Keeping the webhook out of CloudFormation avoids the
EventBridge Connection resource, which also requires Secrets Manager access.
"""

import json


APPLICATION_LOG_GROUPS = {
    "prod": "/jarihana/prod/application",
    "dev": "/jarihana/dev/application",
}
HTTP_5XX_LOG_PATTERN = (
    '{ $.event.action = "http.request.completed" '
    '&& $.http.response.status_code >= 500 }'
)


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


def app_dimensions(environment):
    return [
        dimension("application", "jarihana"),
        dimension("environment", environment),
    ]


def parameter_is_true(parameter_name):
    return {"Fn::Equals": [{"Ref": parameter_name}, "true"]}


def log_filter_resources(environment):
    prefix = environment.title()
    label = environment.upper()
    metric_name = f"http-5xx-{environment}"
    condition = "EnableDevApplicationAlarms" if environment == "dev" else None
    alarm_name = f"[{label}] HTTP 5xx detected (application log)"
    filter_name = f"jarihana-{environment}-http-5xx"
    metric_filter = {
        "Type": "AWS::Logs::MetricFilter",
        "Properties": {
            "FilterName": filter_name,
            "LogGroupName": APPLICATION_LOG_GROUPS[environment],
            "FilterPattern": HTTP_5XX_LOG_PATTERN,
            "MetricTransformations": [{
                "MetricNamespace": "Jarihana/Alerts",
                "MetricName": metric_name,
                "MetricValue": "1",
                "DefaultValue": 0,
            }],
        },
    }
    if condition:
        metric_filter["Condition"] = condition
    return {
        f"{prefix}Http5xxLogFilter": metric_filter,
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


def template():
    resources = {}

    for environment in ("prod", "dev"):
        prefix = environment.title()
        label = environment.upper()
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

    return {
        "AWSTemplateFormatVersion": "2010-09-09",
        "Description": (
            "Jarihana prod/dev CloudWatch alarms on one shared EC2 instance, "
            "with alarm state changes read by the self-hosted Discord monitor."
        ),
        "Parameters": {
            "InstanceId": parameter(
                "The shared EC2 instance ID used by host metric alarms.",
                allowed_pattern="^i-[0-9a-f]+$",
            ),
            "RootFilesystemType": parameter(
                "Root filesystem type from df -T /; it is a CloudWatch metric dimension."
            ),
            "EnableDevApplicationAlarms": {
                "Type": "String",
                "Description": (
                    "Enable dev application alarms; dev metrics have been verified in CloudWatch."
                ),
                "Default": "true",
                "AllowedValues": ["true", "false"],
            },
        },
        "Conditions": conditions,
        "Resources": resources,
        "Outputs": {
            "DevApplicationAlarmsEnabled": {
                "Value": {"Ref": "EnableDevApplicationAlarms"}
            },
        },
    }


if __name__ == "__main__":
    print(json.dumps(template(), ensure_ascii=False, indent=2))
