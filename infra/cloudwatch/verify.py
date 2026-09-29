import argparse
import datetime
import json
import subprocess
import sys
import time


def aws(*arguments):
    result = subprocess.run(
        ["aws", *arguments, "--output", "json"], capture_output=True, text=True, timeout=45
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def application_metrics(events):
    metrics = {}
    for event in events:
        try:
            message = json.loads(event["message"])
        except (ValueError, KeyError):
            continue
        declarations = message.get("_aws", message).get("CloudWatchMetrics", [])
        for declaration in declarations:
            if declaration.get("Namespace") != "Jarihana":
                continue
            if message.get("environment") != "prod":
                continue
            for dimension_names in declaration["Dimensions"]:
                dimensions = [{"Name": name, "Value": str(message[name])} for name in dimension_names]
                for metric in declaration["Metrics"]:
                    metrics[metric["Name"]] = dimensions
    return metrics


def datapoints(namespace, metric, dimensions, start, end):
    result = aws(
        "cloudwatch", "get-metric-statistics", "--namespace", namespace,
        "--metric-name", metric, "--dimensions", json.dumps(dimensions),
        "--start-time", start, "--end-time", end,
        "--period", "60", "--statistics", "Sum", "Average"
    )
    return result["Datapoints"]


def verify(instance_id, root_filesystem):
    required = {
        "http_server_requests_seconds_count", "jvm_memory_used_bytes",
        "jvm_threads_live_threads", "jvm_gc_overhead",
        "hikaricp_connections_active", "hikaricp_connections_pending",
        "http_server_requests_seconds_sum", "process_cpu_usage"
    }
    completed = set()
    for attempt in range(1, 11):
        now = datetime.datetime.now(datetime.timezone.utc)
        start_time = now - datetime.timedelta(minutes=8)
        start, end = start_time.isoformat(), now.isoformat()
        result = aws(
            "logs", "filter-log-events", "--log-group-name", "/jarihana/current/prometheus",
            "--start-time", str(int(start_time.timestamp() * 1000)), "--max-items", "500"
        )
        observed = application_metrics(result.get("events", []))
        for metric in sorted(required - completed):
            if metric in observed and datapoints("Jarihana", metric, observed[metric], start, end):
                completed.add(metric)
                print(f"CloudWatch prod application datapoints verified: {metric}", flush=True)
        for metric in ("mem_used_percent", "disk_used_percent", "cpu_usage_active"):
            if metric in completed:
                continue
            dimensions = [{"Name": "InstanceId", "Value": instance_id}]
            if metric == "disk_used_percent":
                dimensions += [{"Name": "path", "Value": "/"}, {"Name": "fstype", "Value": root_filesystem}]
            if metric == "cpu_usage_active":
                dimensions += [{"Name": "cpu", "Value": "cpu-total"}]
            if datapoints("Jarihana", metric, dimensions, start, end):
                completed.add(metric)
                print(f"CloudWatch shared EC2 datapoints verified: {metric}", flush=True)
        missing = (required | {"mem_used_percent", "disk_used_percent", "cpu_usage_active"}) - completed
        if not missing:
            print("Actual CloudWatch log events and all required metric groups verified.")
            return
        print(f"Attempt {attempt}/10; waiting for: {', '.join(sorted(missing))}", flush=True)
        if attempt < 10:
            time.sleep(30)
    raise RuntimeError("No actual CloudWatch datapoints for: " + ", ".join(sorted(missing)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--root-filesystem", required=True)
    options = parser.parse_args()
    try:
        verify(options.instance_id, options.root_filesystem)
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
