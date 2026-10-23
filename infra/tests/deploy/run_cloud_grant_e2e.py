#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# Run with PYTHONPATH=infra/scripts/deploy:infra/tests/deploy; uses SSH and a disposable read-only grant account.
import hashlib
import json
import os
import selectors
import subprocess
import tarfile
import tempfile
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from time import monotonic
from typing import Final
from uuid import uuid4

from bluegreen.models import (
    Action,
    Command,
    ControlRelease,
    DeploymentState,
    Host,
    Phase,
    RunIdentity,
    Slot,
    Topology,
)
from bluegreen.ports import DeploymentFailure, SystemClock
from cloud_worker_runtime import B, Remote

NGINX: Final = Remote("ec2-16-184-50-182.ap-northeast-2.compute.amazonaws.com", "i-01449d708ceef309b")


def transfer(source: tuple[str, ...], target: tuple[str, ...]) -> None:
    with subprocess.Popen(source, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
        _ = subprocess.run(target, stdin=process.stdout, capture_output=True, check=True, timeout=60)
        if process.wait(timeout=10) != 0:
            raise DeploymentFailure("rehearsal runtime transfer failed")


def bundle(topology: Topology, command: Command, run: RunIdentity) -> bytes:
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for source in (Path(__file__).parents[2] / "scripts/deploy/bluegreen").glob("*.py"):
            archive.add(source, arcname=f"bluegreen/{source.name}")
        archive.add(Path(__file__).with_name("remote_grant_probe.py"), arcname="probe.py")
        for name, payload in (("topology.json", topology.model_dump_json()),
                              ("command.json", command.model_dump_json()), ("run.json", run.model_dump_json())):
            data = payload.encode()
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, BytesIO(data))
    return buffer.getvalue()


def probe(invocation: tuple[str, ...], expected: str) -> str:
    result = subprocess.run(B.arguments(*invocation, expected), capture_output=True, text=True, timeout=180, check=False)
    if result.returncode != 0:
        print(result.stderr[-2000:], flush=True)
        raise DeploymentFailure("remote grant probe failed")
    return result.stdout.strip()


def publish(root: str, state: DeploymentState) -> None:
    temporary = f"{root}/state-{uuid4().hex}.json"
    _ = NGINX.run("sudo", "install", "-m", "0644", "-o", "jarihana-coordinator", "/dev/stdin", temporary,
                  payload=state.model_dump_json())
    _ = NGINX.run("sudo", "mv", "--", temporary, root + "/state.json")


def ready_line(descriptor: int) -> str:
    deadline, payload = monotonic() + 120, b""
    with selectors.DefaultSelector() as selector:
        _ = selector.register(descriptor, selectors.EVENT_READ)
        while b"\n" not in payload:
            left = deadline - monotonic()
            if left <= 0 or not selector.select(timeout=left) or len(payload) >= 128:
                raise DeploymentFailure("probe did not become ready")
            chunk = os.read(descriptor, 128 - len(payload))
            if not chunk:
                raise DeploymentFailure("probe exited before becoming ready")
            payload += chunk
    return payload.decode("ascii").strip()


def watch_revocation(invocation: tuple[str, ...], root: str, revoked: DeploymentState) -> str:
    with tempfile.TemporaryFile(mode="w+") as errors, subprocess.Popen[str](
        B.arguments(*invocation, "watch"), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True,
    ) as process:
        try:
            if process.stdout is None:
                raise DeploymentFailure("probe output pipe is missing")
            ready = ready_line(process.stdout.fileno())
            if not ready.startswith("REMOTE_GRANT_ALLOWED"):
                raise DeploymentFailure("probe could not read the initial grant")
            publish(root, revoked)
            output, _ = process.communicate("\n", timeout=30)
            if process.returncode != 0 or output.strip() != "REMOTE_GRANT_REVOKED":
                raise DeploymentFailure("same-process grant revocation failed")
            return output.strip()
        finally:
            if process.poll() is None:
                process.kill()
                _ = process.wait(timeout=10)


def main() -> None:
    NGINX.identify()
    B.identify()
    if NGINX.run("bash", "-c", "getent passwd jarihana-grant || true"):
        raise DeploymentFailure("grant account already exists; do not replace its configuration")
    root = f"/var/tmp/jarihana-grant-{uuid4().hex}"
    artifacts = Path("local-plans/blue-green-deployment/artifacts/cloud-grant") / Path(root).name
    artifacts.mkdir(parents=True)
    clock = SystemClock()
    topology = Topology(environment="dev-rehearsal", coordinator_instance_id=NGINX.instance_id,
                        a=Host(slot=Slot.A, host_id="rehearsal-a", instance_id="i-0a43bb4e0154e0f1f", upstream="10.0.3.232:8080"),
                        b=Host(slot=Slot.B, host_id="rehearsal-b", instance_id=B.instance_id, upstream="10.0.3.184:18080"),
                        control=ControlRelease(workflow="synthetic-grant.yml", ref="refs/tags/grant-rehearsal", sha="a" * 40))
    run = RunIdentity(run_id=1, attempt=1, workflow=topology.control.workflow, ref=topology.control.ref,
                      sha=topology.control.sha, event="workflow_dispatch")
    command = Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=1, parent_attempt=1,
                      phase=Phase.PREPARING, action=Action.STATUS, host=topology.b, boot_id=None,
                      image="sha256:" + "1" * 64, deadline=clock.now() + timedelta(minutes=10), authority=None)
    state = DeploymentState(deployment_id=command.deployment_id, session_id=uuid4(), pending=command,
                            pending_run=run, topology_digest=hashlib.sha256(topology.model_dump_json().encode()).hexdigest())
    created = False
    try:
        _ = B.run("sudo", "install", "-d", "-m", "0700", "-o", "jarihana-runner", "-g", "jarihana-runner", root)
        _ = NGINX.run("sudo", "install", "-d", "-m", "0755", root)
        _ = NGINX.run("sudo", "useradd", "--system", "--create-home", "--home-dir", root + "/home",
                      "--shell", "/bin/sh", "jarihana-grant")
        created = True
        _ = B.run("sudo", "-u", "jarihana-runner", "ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", root + "/key")
        public_key = B.run("sudo", "cat", root + "/key.pub")
        host_key = NGINX.run("sudo", "cat", "/etc/ssh/ssh_host_ed25519_key.pub")
        _ = NGINX.run("sudo", "install", "-d", "-m", "0755", root + "/home/.ssh")
        authorized = f'from="10.0.3.184",restrict,command="/usr/bin/head -c 65537 -- {root}/state.json" {public_key}\n'
        _ = NGINX.run("sudo", "install", "-m", "0644", "/dev/stdin", root + "/home/.ssh/authorized_keys", payload=authorized)
        _ = B.run("sudo", "install", "-m", "0644", "/dev/stdin", root + "/known_hosts", payload="10.0.3.51 " + host_key + "\n")
        transfer(NGINX.arguments("sudo", "cat", "/usr/local/bin/uv"),
                 B.arguments("sudo", "install", "-m", "0755", "/dev/stdin", root + "/uv"))
        _ = subprocess.run(B.arguments("sudo", "-u", "jarihana-runner", "tar", "-xzf", "-", "-C", root),
                           input=bundle(topology, command, run), capture_output=True, check=True, timeout=30)
        publish(root, state)
        invocation = ("sudo", "-u", "jarihana-runner", "env", f"PYTHONPATH={root}", f"UV_CACHE_DIR={root}/cache",
                      "UV_PYTHON_DOWNLOADS=never", root + "/uv", "--directory", root,
                      "run", "--no-project", "--script", root + "/probe.py", root)
        allowed = probe(invocation, "allow")
        print(allowed, flush=True)
        revoked = state.model_copy(update={"phase": Phase.ATTENTION, "revision": 1})
        denied = watch_revocation(invocation, root, revoked)
        print(denied, flush=True)
        fixed = B.run("sudo", "-u", "jarihana-runner", "ssh", "-F", "/dev/null", "-i", root + "/key",
                      "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={root}/known_hosts",
                      "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ConnectTimeout=3", "jarihana-grant@10.0.3.51", "id")
        if DeploymentState.model_validate_json(fixed) != revoked:
            raise DeploymentFailure("forced SSH command was bypassed")
        _ = (artifacts / "result.json").write_text(json.dumps({
            "instance": B.instance_id, "allowed": allowed, "revoked": denied, "forced_command_verified": True,
            "same_process_revocation": True,
            "github_run_is_synthetic": True, "application_status_checked": False,
            "application_mutated": False, "cloudfront_mutated": False}, indent=2))
    finally:
        try:
            if created:
                _ = NGINX.run("bash", "-c", "for n in $(seq 1 80); do sudo userdel jarihana-grant && exit 0; sleep 0.25; done; exit 1")
        finally:
            try:
                _ = NGINX.run("sudo", "rm", "-rf", "--", root)
            finally:
                _ = B.run("sudo", "rm", "-rf", "--", root)
    print("CLOUD_GRANT_REHEARSAL_PASSED_AND_CLEANED", flush=True)


if __name__ == "__main__":
    main()
