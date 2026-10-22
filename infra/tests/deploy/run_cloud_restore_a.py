# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# Run as root on dev A only: uv run --no-project --script run_cloud_restore_a.py
# Uses the root-owned recovery record from run_cloud_prepare_a.py; retains it for audit.
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import ClassVar, Literal

from bluegreen.ports import DeploymentFailure
from pydantic import BaseModel, ConfigDict, StrictBool


class Recovery(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    original: Literal["51fd0b39065eaa99ca1459543c97bb653d3acb9a4575f708758a1195bbac4d79"]
    image: Literal["sha256:f1f33d81d7bbf43b860ab579ee05cd310403f266b7c33a32bf1a119e07fe1621"]
    restart: Literal["unless-stopped"]
    dev_runner_active: StrictBool
    service: Literal["actions.runner.woowacourse-teams-2026-jarihana.jarihana-dev.service"]
    candidate: Literal["jarihana-worker-rehearsal-a"]


class Readiness(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")
    status: Literal["UP", "DOWN", "OUT_OF_SERVICE", "UNKNOWN"]


def run(*arguments: str) -> str:
    return subprocess.run(arguments, capture_output=True, text=True, check=True, timeout=15).stdout.strip()


def main() -> None:
    if len(sys.argv) != 1 or os.geteuid() != 0 or socket.gethostname() != "ip-10-0-3-232":
        raise DeploymentFailure("not the A rehearsal machine")
    path = Path("/var/lib/jarihana-deploy/a-rehearsal-recovery.json")
    recovery = Recovery.model_validate_json(path.read_bytes())
    if run("docker", "inspect", "--format", "{{.Image}}", recovery.original) != recovery.image:
        raise DeploymentFailure("original dev container identity changed")
    if run("docker", "ps", "-aq", "--filter", f"name=^/{recovery.candidate}$"):
        if run("docker", "inspect", "--format", "{{.Image}}", recovery.candidate) != "sha256:16068322d45c10c99724439ebfdc85201a463110b58782aacbfe7c99d3867cb8":
            raise DeploymentFailure("candidate image changed")
        if run("docker", "inspect", "--format", "{{.State.Running}}", recovery.candidate) == "true":
            _ = run("docker", "kill", "--signal=TERM", recovery.candidate)
        deadline = time.monotonic() + 90
        while run("docker", "inspect", "--format", "{{.State.Running}}", recovery.candidate) != "false":
            if time.monotonic() >= deadline:
                raise DeploymentFailure("candidate drain timed out; no forced kill")
            time.sleep(1)
        _ = run("docker", "rm", recovery.candidate)
    _ = run("docker", "update", f"--restart={recovery.restart}", recovery.original)
    if run("docker", "inspect", "--format", "{{.State.Running}}", recovery.original) != "true":
        _ = run("docker", "start", recovery.original)
    deadline = time.monotonic() + 120
    while True:
        health = subprocess.run(("curl", "-fsS", "--max-time", "3", "http://127.0.0.1:8081/actuator/health/readiness"),
            capture_output=True, text=True, check=False, timeout=5)
        if health.returncode == 0 and Readiness.model_validate_json(health.stdout).status == "UP":
            break
        if time.monotonic() >= deadline:
            raise DeploymentFailure("original dev readiness not restored")
        time.sleep(2)
    if recovery.dev_runner_active:
        _ = run("systemctl", "start", recovery.service)
    _ = Path("/var/lib/jarihana-deploy/a-rehearsal-restored.json").write_text(json.dumps({
        "original_container": recovery.original, "restart": recovery.restart, "readiness_up": True,
        "dev_runner_restored": recovery.dev_runner_active}))
    print("ORIGINAL_DEV_APP_AND_RUNNER_RESTORED")


if __name__ == "__main__":
    main()
