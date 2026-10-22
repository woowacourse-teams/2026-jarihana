#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
import hashlib
import re
import secrets
import subprocess
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from bluegreen.ports import DeploymentFailure
from cloud_worker_runtime import (
    IMAGE,
    KEY,
    A,
    B,
    Inspect,
    Remote,
    control_token,
    wait_stopped,
)

JAR: Final = Path("backend/build/libs/jarihana-0.0.1-SNAPSHOT-worker-rehearsal.jar")
MAILBOX: Final = "/tmp/worker-finish-rehearsal"


@dataclass(frozen=True, slots=True)
class FixtureHost:
    remote: Remote
    original: str
    candidate: str
    host_id: str
    http_binding: str
    management_binding: str


HOST_A: Final = FixtureHost(A, "jarihana-dev-backend-1", "jarihana-finish-rehearsal-a",
                           "jarihana-rehearsal-a", "8080:8080", "127.0.0.1:8081:8081")
HOST_B: Final = FixtureHost(B, "jarihana-bluegreen-rehearsal-b-backend-1", "jarihana-finish-rehearsal-b",
                           "jarihana-rehearsal-b", "10.0.3.184:18080:8080", "127.0.0.1:18081:8081")


@dataclass(frozen=True, slots=True)
class FixtureRelease:
    schema: str
    jar_hash: str

    def __post_init__(self) -> None:
        if re.fullmatch(r"bg_[0-9a-f]{32}", self.schema) is None or re.fullmatch(r"[0-9a-f]{64}", self.jar_hash) is None:
            raise DeploymentFailure("fixture schema or JAR hash is invalid")

    @property
    def version(self) -> str:
        return "finish-rehearsal-" + self.jar_hash

    @property
    def remote_jar(self) -> str:
        return f"/var/tmp/jarihana-worker-finish-{self.jar_hash}.jar"


def upload(host: FixtureHost, release: FixtureRelease) -> None:
    host.remote.identify()
    _ = subprocess.run(("scp", "-i", KEY, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                        str(JAR), f"ubuntu@{host.remote.host}:{release.remote_jar}"),
                       capture_output=True, check=True, timeout=120)
    actual = host.remote.run("sha256sum", release.remote_jar).split()[0]
    if actual != release.jar_hash or hashlib.sha256(JAR.read_bytes()).hexdigest() != release.jar_hash:
        raise DeploymentFailure("fixture JAR changed during upload")
    if host.remote.docker("image", "inspect", "--format", "{{.Id}}", IMAGE) != IMAGE:
        raise DeploymentFailure("fixture base image differs")


@contextmanager
def replace(host: FixtureHost, release: FixtureRelease, source: Inspect) -> Generator[str, None, None]:
    if host not in (HOST_A, HOST_B):
        raise DeploymentFailure("fixture host differs from the rehearsal allowlist")
    _ = control_token(source)
    original = host.remote.inspect(host.original)
    policy = host.remote.docker("inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", original.Id)
    if host.remote.docker("ps", "-aq", "--filter", f"name=^/{host.candidate}$"):
        raise DeploymentFailure("a prior fixture exists; inspect it before another run")
    environment = dict(source.environment())
    environment.update({"DB_URL": environment["DB_URL"] + "&currentSchema=" + release.schema,
                        "APP_VERSION": release.version, "PUSH_WORKER_HOST_ID": host.host_id,
                        "WORKER_CONTROL_TOKEN": secrets.token_hex(32),
                        "JARIHANA_PUSH_LEASE_DURATION": "5m", "OTEL_SDK_DISABLED": "true",
                        "SENTRY_BACKEND_DSN": ""})
    if any("\n" in value or "\r" in value for value in environment.values()):
        raise DeploymentFailure("Docker env-file values must be single line")
    payload = "\n".join(f"{key}={value}" for key, value in environment.items()) + "\n"
    created = ""
    try:
        _ = host.remote.docker("update", "--restart=no", original.Id)
        _ = host.remote.docker("kill", "--signal=TERM", original.Id)
        wait_stopped(host.remote, original.Id)
        created = host.remote.docker("create", "--name", host.candidate, "--memory", "896m", "--restart=no",
                                     "--env-file", "/dev/stdin", "-p", host.http_binding, "-p", host.management_binding,
                                     "--entrypoint", "java", "-v", f"{release.remote_jar}:/tmp/fixture.jar:ro",
                                     "--log-driver", "local", "--log-opt", "max-size=10m", "--log-opt", "max-file=3",
                                     IMAGE, "-jar", "/tmp/fixture.jar", payload=payload)
        _ = host.remote.docker("start", created)
        yield environment["WORKER_CONTROL_TOKEN"]
    finally:
        try:
            if created:
                if host.remote.docker("inspect", "--format", "{{.State.Running}}", created) == "true":
                    _ = host.remote.docker("kill", "--signal=TERM", created)
                wait_stopped(host.remote, created)
                _ = host.remote.docker("rm", created)
        finally:
            _ = host.remote.docker("update", f"--restart={policy}", original.Id)
            if host.remote.docker("inspect", "--format", "{{.State.Running}}", original.Id) != "true":
                _ = host.remote.docker("start", original.Id)
            port = "8081" if host == HOST_A else "18081"
            ready = ("set -euo pipefail; for n in $(seq 1 50); do if curl -fsS --max-time 3 "
                     + f"http://127.0.0.1:{port}/actuator/health/readiness "
                     + "| jq -e '.status == \"UP\"' >/dev/null; then exit 0; fi; sleep 2; done; exit 1")
            _ = host.remote.run("bash", "-c", ready)
            print(f"ORIGINAL_{host.host_id}_RESTORED", flush=True)
