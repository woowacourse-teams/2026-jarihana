#!/usr/bin/env python3
"""Read-only CloudWatch and SNS evidence for the dev DB failure drill."""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time


REGION = "ap-northeast-2"
ALARM = "[DEV] HTTP 5xx detected (application log)"
PATTERN = '{ $.event.action = "http.request.completed" && $.http.response.status_code >= 500 }'
KST = dt.timezone(dt.timedelta(hours=9))


def aws(service, operation, *args):
    command = ["aws", service, operation, "--region", REGION, *args, "--output", "json"]
    result = subprocess.run(command, capture_output=True, text=True, timeout=50)
    if result.returncode:
        raise RuntimeError(f"AWS {service} {operation} failed (exit {result.returncode})")
    return json.loads(result.stdout)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def only_one(items, what):
    require(len(items) == 1, f"Expected exactly one {what}; found {len(items)}")
    return items[0]


def preflight():
    stack = only_one(aws("cloudformation", "describe-stacks", "--stack-name", "jarihana-alerts")["Stacks"], "alert stack")
    require(stack["StackStatus"] in {"CREATE_COMPLETE", "UPDATE_COMPLETE"}, "Alert stack is not complete")
    parameters = {item["ParameterKey"]: item.get("ParameterValue") for item in stack["Parameters"]}
    require(parameters.get("InstanceId") == os.environ["EXPECTED_INSTANCE_ID"], "Alert stack targets another EC2")
    require(parameters.get("EnableDevApplicationAlarms") == "true", "Dev application alarms are disabled")
    outputs = {item["OutputKey"]: item.get("OutputValue") for item in stack.get("Outputs", [])}
    topic_arn = outputs.get("AlertTopicArn")
    require(topic_arn and topic_arn.startswith(f"arn:aws:sns:{REGION}:"), "Alert SNS topic output is missing")

    for environment in ("prod", "dev"):
        group_name = f"/jarihana/{environment}/application"
        groups = aws("logs", "describe-log-groups", "--log-group-name-prefix", group_name)["logGroups"]
        require(any(group["logGroupName"] == group_name for group in groups), f"Missing {environment} log group")
        dashboard = f"DASHBOARD-jarihana-{environment}"
        dashboards = aws("cloudwatch", "list-dashboards", "--dashboard-name-prefix", dashboard)["DashboardEntries"]
        require(any(item["DashboardName"] == dashboard for item in dashboards), f"Missing {environment} dashboard")

    metric_filter = only_one(aws("logs", "describe-metric-filters", "--log-group-name", "/jarihana/dev/application", "--filter-name-prefix", "jarihana-dev-http-5xx")["metricFilters"], "dev 5xx metric filter")
    require(metric_filter["filterName"] == "jarihana-dev-http-5xx", "Unexpected dev filter name")
    require(metric_filter["filterPattern"] == PATTERN, "Dev 5xx filter pattern differs")
    transforms = metric_filter["metricTransformations"]
    require(len(transforms) == 1 and transforms[0]["metricNamespace"] == "Jarihana/Alerts" and transforms[0]["metricName"] == "http-5xx-dev", "Dev 5xx metric transformation differs")

    alarm = only_one(aws("cloudwatch", "describe-alarms", "--alarm-names", ALARM)["MetricAlarms"], "dev 5xx alarm")
    require(alarm["StateValue"] == "OK", f"Dev 5xx alarm must be OK; current state {alarm['StateValue']}")
    require(alarm["Period"] == 60 and alarm["Threshold"] == 1 and alarm["EvaluationPeriods"] == 1 and alarm["DatapointsToAlarm"] == 1, "Dev 5xx alarm threshold differs")
    require(alarm["MetricName"] == "http-5xx-dev" and alarm["Namespace"] == "Jarihana/Alerts", "Dev alarm uses another metric")
    require(alarm.get("AlarmActions") == [topic_arn], "Dev alarm ALARM action is not the SNS topic")
    require(alarm.get("OKActions") == [topic_arn], "Dev alarm recovery action is not the SNS topic")

    print("Alert stack complete; dev 5xx SNS alarm actions; 1-minute log filter; both dashboards present.")


def kst(instant):
    if isinstance(instant, str):
        instant = dt.datetime.fromisoformat(instant.replace("Z", "+00:00"))
    return instant.astimezone(KST).strftime("%Y-%m-%d %H:%M:%S KST")


def metric_points(namespace, name, dimensions, start, end, statistic):
    args = ["--namespace", namespace, "--metric-name", name, "--start-time", start.isoformat(),
            "--end-time", end.isoformat(), "--period", "60", "--statistics", statistic]
    if dimensions:
        args += ["--dimensions", *[f"Name={dimension['Name']},Value={dimension['Value']}" for dimension in dimensions]]
    result = aws("cloudwatch", "get-metric-statistics", *args)
    return [{"time": kst(point["Timestamp"]), "value": point[statistic]}
            for point in sorted(result["Datapoints"], key=lambda item: item["Timestamp"])]


def collect(start):
    end = dt.datetime.now(dt.timezone.utc)
    history_start = start - dt.timedelta(minutes=2)
    end = end + dt.timedelta(minutes=1)
    logs = aws("logs", "filter-log-events", "--log-group-name", "/jarihana/dev/application",
               "--filter-pattern", PATTERN, "--start-time", str(int(start.timestamp() * 1000)),
               "--end-time", str(int(end.timestamp() * 1000)), "--limit", "100")["events"]
    events = []
    for event in logs:
        try:
            message = json.loads(event["message"])
        except ValueError:
            continue
        events.append({"time": kst(dt.datetime.fromtimestamp(event["timestamp"] / 1000, dt.timezone.utc)),
                       "action": message.get("event", {}).get("action"),
                       "status": message.get("http", {}).get("response", {}).get("status_code"),
                       "method": message.get("http", {}).get("request", {}).get("method"),
                       "route": message.get("jarihana", {}).get("route")})

    history = aws("cloudwatch", "describe-alarm-history", "--alarm-name", ALARM,
                  "--history-item-type", "StateUpdate", "--start-date", history_start.isoformat(),
                  "--end-date", end.isoformat(), "--max-records", "100")["AlarmHistoryItems"]
    transitions = []
    for item in history:
        data = json.loads(item["HistoryData"])
        transitions.append({"time": kst(item["Timestamp"]),
                            "from": data.get("oldState", {}).get("stateValue"),
                            "to": data.get("newState", {}).get("stateValue")})

    metrics = {"log_5xx": metric_points("Jarihana/Alerts", "http-5xx-dev", [], history_start, end, "Sum")}
    metric_names = ("http_server_requests_seconds_count", "hikaricp_connections_timeout_total",
                    "hikaricp_connections_active", "hikaricp_connections_idle", "hikaricp_connections_pending")
    for name in metric_names:
        listed = aws("cloudwatch", "list-metrics", "--namespace", "Jarihana", "--metric-name", name,
                     "--dimensions", "Name=application,Value=jarihana", "Name=environment,Value=dev")["Metrics"]
        series = []
        for metric in listed:
            dimensions = metric["Dimensions"]
            if name == "http_server_requests_seconds_count" and not any(
                    item["Name"] == "status_class" and item["Value"] == "5xx" for item in dimensions):
                continue
            statistic = "Average" if name in {"hikaricp_connections_active", "hikaricp_connections_idle", "hikaricp_connections_pending"} else "Sum"
            series.append({"dimensions": dimensions,
                           "points": metric_points("Jarihana", name, dimensions, history_start, end, statistic)})
        metrics[name] = series

    return {"window_start": kst(start), "window_end": kst(end), "dev_5xx_events": events,
            "alarm_transitions": transitions, "metrics": metrics}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("preflight", "collect"))
    parser.add_argument("--output")
    options = parser.parse_args()
    if options.mode == "preflight":
        preflight()
        return
    temporary = Path(os.environ["RUNNER_TEMP"])
    start = dt.datetime.fromisoformat((temporary / "jarihana-dev-db-drill-start-utc").read_text().strip().replace("Z", "+00:00"))
    # This wait occurs only after the DB has been restored.
    evidence = {}
    for attempt in range(10):
        evidence = collect(start)
        states = [item["to"] for item in sorted(evidence["alarm_transitions"], key=lambda item: item["time"])]
        if evidence["dev_5xx_events"] and "ALARM" in states and "OK" in states[states.index("ALARM") + 1:]:
            break
        if attempt < 9:
            time.sleep(30)
    path = Path(options.output or temporary / "jarihana-dev-db-drill-evidence.json")
    path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(f"Evidence saved: {path}")
    print(f"Dev 5xx log events: {len(evidence['dev_5xx_events'])}; alarm transitions: {len(evidence['alarm_transitions'])}")
    require(evidence["dev_5xx_events"] and "ALARM" in states and "OK" in states[states.index("ALARM") + 1:],
            "Dev 5xx log or ALARM->OK transition not yet observed; inspect evidence and email manually")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
