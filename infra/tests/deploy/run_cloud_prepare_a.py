# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
# Run as root on dev A only, with PYTHONPATH pointing to the pinned deployment source
# and this directory: uv run --no-project --script run_cloud_prepare_a.py
# Install run_cloud_restore_a.py first; restore the original dev app after the trial.
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
from ipaddress import IPv4Address
from pathlib import Path

from bluegreen.child_execution import MachineIdentity
from bluegreen.coordinator_settings import CoordinatorSettings
from bluegreen.docker_shutdown import ContainerPin
from bluegreen.models import Action, ControlRelease, Slot
from bluegreen.nginx_switch import ProcessRunner
from bluegreen.ports import DeploymentFailure
from bluegreen.spring_status import snapshot
from bluegreen.spring_worker import worker_client
from bluegreen.worker_profile import PROFILE_FORMAT, WorkerProfile, verify_profile
from bluegreen.worker_settings import WorkerSettings
from cloud_worker_runtime import IMAGE, Inspect
from pydantic import SecretStr, TypeAdapter
from run_cloud_restore_a import Recovery


def main() -> None:
    _ = os.umask(0o077)
    if len(sys.argv) != 1 or os.geteuid() != 0 or socket.gethostname() != "ip-10-0-3-232":
        raise DeploymentFailure("not the dev rehearsal A machine")
    runner = ProcessRunner()
    if runner.run(("docker", "image", "inspect", "--format", "{{.Id}}", IMAGE)).strip() != IMAGE:
        raise DeploymentFailure("pinned A candidate image is missing")
    original = TypeAdapter(tuple[Inspect, ...]).validate_json(runner.run(("docker", "inspect", "jarihana-dev-backend-1")))[0]
    if original.Id != "51fd0b39065eaa99ca1459543c97bb653d3acb9a4575f708758a1195bbac4d79":
        raise DeploymentFailure("original dev container changed")
    policy = runner.run(("docker", "inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", original.Id)).strip()
    recovery = Path("/var/lib/jarihana-deploy/a-rehearsal-recovery.json")
    recovery.parent.mkdir(mode=0o700, exist_ok=True)
    if recovery.exists() or Path("/etc/jarihana-deploy/worker-child.json").exists():
        raise DeploymentFailure("A rehearsal files exist; inspect before replacing")
    if runner.run(("docker", "ps", "-aq", "--filter", "name=^/jarihana-worker-rehearsal-a$")).strip():
        raise DeploymentFailure("A candidate already exists")
    service = "actions.runner.woowacourse-teams-2026-jarihana.jarihana-dev.service"
    active = runner.run(("systemctl", "is-active", service)).strip() == "active"
    restored = Recovery.model_validate_json(json.dumps({"original": original.Id, "image": original.Image, "restart": policy,
        "dev_runner_active": active, "service": service, "candidate": "jarihana-worker-rehearsal-a"}))
    with recovery.open("x") as handle:
        _ = handle.write(restored.model_dump_json(indent=2))
        handle.flush()
        os.fsync(handle.fileno())
    environment = dict(original.environment())
    environment.update({"DB_URL": "jdbc:postgresql://jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com:5432/jarihana_dev?sslmode=require",
        "APP_VERSION": IMAGE, "PUSH_ENABLED": "false", "PUSH_WORKER_ENABLED": "false",
        "PUSH_WORKER_CONTROL_ENABLED": "true", "PUSH_WORKER_ENVIRONMENT": "dev-rehearsal",
        "PUSH_WORKER_HOST_ID": "jarihana-rehearsal-a", "WORKER_CONTROL_TOKEN": secrets.token_hex(32)})
    if any("\n" in value or "\r" in value for value in environment.values()):
        raise DeploymentFailure("multiline environment is not allowed")
    _ = runner.run(("systemctl", "stop", service))
    _ = runner.run(("docker", "update", "--restart=no", original.Id))
    _ = runner.run(("docker", "kill", "--signal=TERM", original.Id))
    deadline = time.monotonic() + 90
    while runner.run(("docker", "inspect", "--format", "{{.State.Running}}", original.Id)).strip() != "false":
        if time.monotonic() >= deadline:
            raise DeploymentFailure("original app did not stop; restore without forced kill")
        time.sleep(1)
    body = "\n".join(f"{key}={value}" for key, value in environment.items()) + "\n"
    created = subprocess.run(("docker", "create", "--name", "jarihana-worker-rehearsal-a", "--memory", "896m",
        "--restart=no", "--env-file", "/dev/stdin", "-p", "8080:8080", "-p", "127.0.0.1:8081:8081",
        "--log-driver", "local", "--log-opt", "max-size=10m", "--log-opt", "max-file=3", IMAGE),
        input=body, capture_output=True, text=True, check=True, timeout=15).stdout.strip()
    _ = runner.run(("docker", "start", created))
    machine = MachineIdentity(environment="dev-rehearsal", host_id="jarihana-rehearsal-a", instance_id="i-0a43bb4e0154e0f1f")
    token = SecretStr(environment["WORKER_CONTROL_TOKEN"])
    deadline = time.monotonic() + 150
    with worker_client() as client:
        while True:
            try:
                actual = snapshot(client, 8081, token, machine)
                if actual.healthy and actual.requests_drained():
                    break
            except DeploymentFailure:
                if time.monotonic() >= deadline:
                    raise
            if time.monotonic() >= deadline:
                raise DeploymentFailure("A candidate readiness deadline exceeded")
            time.sleep(2)
    base = CoordinatorSettings.model_validate_json(Path("/opt/jarihana-worker-control-ff6a3ea7/infra/deploy/status-child/coordinator.example.json").read_bytes())
    release = ControlRelease(workflow="backend-bluegreen-worker-child.yml", ref="refs/tags/bluegreen-worker-rehearsal-20261024-02",
        sha="ff6a3ea77d205a768ff966fcef9ea6bcba78f346")
    profile = WorkerProfile.model_validate_json(runner.run(("docker", "inspect", "--format", PROFILE_FORMAT, created)))
    settings = WorkerSettings(repository=base.repository, topology=base.topology.model_copy(update={"control": release}),
        local_slot=Slot.A, coordinator_address=IPv4Address("10.0.3.51"), journal_key=Path("/etc/jarihana-deploy/worker-grant-key"),
        known_hosts=Path("/etc/jarihana-deploy/worker-known-hosts"), worker_token_file=Path("/etc/jarihana-deploy/worker-control-token"),
        management_port=8081, expected_boot=actual.boot_id, expected_image=actual.image,
        allowed_actions=(Action.BEGIN, Action.COMPLETE), container=ContainerPin.model_validate(profile.model_dump(exclude={"environment", "running"})))
    verify_profile(settings, runner)
    files = (Path("/etc/jarihana-deploy/worker-child.json"), settings.worker_token_file, settings.known_hosts)
    for path in (*files, settings.journal_key):
        if path.exists():
            raise DeploymentFailure("A root worker file exists")
    _ = files[0].write_text(settings.model_dump_json(indent=2))
    _ = files[1].write_text(token.get_secret_value() + "\n")
    _ = files[2].write_text("10.0.3.51 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO5ikLlBysXKkf1qANRwkbGs8yp+BaDadDRPtuqHa4oH\n")
    _ = runner.run(("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(settings.journal_key)))
    for path in (*files, settings.journal_key, settings.journal_key.with_suffix(".pub")):
        shutil.chown(path, user="root", group="jarihana-runner")
        path.chmod(0o640)
    print("A_CANDIDATE_READY", created)
    print(actual.model_dump_json())
    print(settings.journal_key.with_suffix(".pub").read_text().strip())


if __name__ == "__main__":
    main()
