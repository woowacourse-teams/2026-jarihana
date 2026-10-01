#!/usr/bin/env python3
"""Poll CloudWatch alarm state changes and deliver them to Discord.

This is the delivery path used when EventBridge API Destinations cannot be
created with the available AWS role. It needs only ``cloudwatch:DescribeAlarms``
and an existing Discord incoming webhook stored in ``DISCORD_WEBHOOK_URL``.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib import error
from urllib import request


DEFAULT_REGION = "ap-northeast-2"
DEFAULT_STATE_FILE = Path.home() / ".cache" / "jarihana" / "cloudwatch-alarm-state.json"
ALARM_NAME_PREFIXES = ("[PROD]", "[DEV]", "[EC2]")
KNOWN_STATES = {"ALARM", "OK", "INSUFFICIENT_DATA"}


def relevant_alarms(response):
    """Return the allowlisted alarm state fields keyed by alarm name."""
    alarms = {}
    for alarm in response.get("MetricAlarms", []):
        name = alarm.get("AlarmName", "")
        state = alarm.get("StateValue")
        if not name.startswith(ALARM_NAME_PREFIXES) or state not in KNOWN_STATES:
            continue
        alarms[name] = {
            "state": state,
            "updated": alarm.get("StateUpdatedTimestamp", ""),
        }
    return dict(sorted(alarms.items()))


def state_transition(previous, current):
    """Return whether a transition should be sent to Discord."""
    return (
        current == "ALARM" and previous != "ALARM"
    ) or (
        previous == "ALARM" and current == "OK"
    )


def load_state(path):
    if not path.exists():
        return {}
    try:
        content = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not read monitor state file: {path}") from exc
    alarms = content.get("alarms")
    if not isinstance(alarms, dict):
        raise RuntimeError(f"Invalid monitor state file: {path}")
    return alarms


def save_state(path, alarms):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as output:
            temporary = Path(output.name)
            json.dump({"version": 1, "alarms": alarms}, output, ensure_ascii=False, indent=2)
            output.write("\n")
        temporary.replace(path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def fetch_alarms(region):
    command = [
        "aws", "cloudwatch", "describe-alarms",
        "--region", region,
        "--output", "json",
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AWS returned invalid alarm JSON") from exc


def discord_payload(name, state, updated):
    timestamp = updated or "timestamp unavailable"
    return {
        "content": f"**CloudWatch {state}** | {name}\n{timestamp}",
        "allowed_mentions": {"parse": []},
    }


def send_to_discord(webhook_url, payload):
    separator = "&" if "?" in webhook_url else "?"
    endpoint = f"{webhook_url}{separator}wait=true"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    http_request = request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(http_request, timeout=10) as response:
            if response.status >= 300:
                raise RuntimeError(f"Discord webhook returned HTTP {response.status}")
    except error.HTTPError as exc:
        # Do not include exc.url: it contains the secret webhook URL.
        raise RuntimeError(f"Discord webhook returned HTTP {exc.code}") from exc
    except error.URLError as exc:
        raise RuntimeError("Discord webhook request failed") from exc


def run_once(region, state_path, webhook_url):
    current = relevant_alarms(fetch_alarms(region))
    if not current:
        raise RuntimeError("No [PROD], [DEV], or [EC2] CloudWatch alarms were returned")

    previous = load_state(state_path)
    first_run = not previous
    sent = 0
    if not first_run:
        for name, state in current.items():
            before = previous.get(name, {}).get("state")
            after = state["state"]
            if not state_transition(before, after):
                continue
            send_to_discord(webhook_url, discord_payload(name, after, state["updated"]))
            sent += 1
            print(f"Discord notification sent: {name}: {before} -> {after}")

    save_state(state_path, current)
    if first_run:
        print(f"CloudWatch alarm baseline initialized: {len(current)} alarms")
    else:
        print(f"CloudWatch alarms checked: {len(current)}; notifications sent: {sent}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", DEFAULT_REGION))
    parser.add_argument("--state-file", type=Path, default=DEFAULT_STATE_FILE)
    options = parser.parse_args()
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        raise RuntimeError("DISCORD_WEBHOOK_URL is not set")
    run_once(options.region, options.state_file, webhook_url)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        print(exc, file=os.sys.stderr)
        raise SystemExit(1)
