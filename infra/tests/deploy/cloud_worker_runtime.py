# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# Imported by run_cloud_worker_e2e.py; SSH changes are restricted to the dev rehearsal hosts.
import json
import secrets
import shlex
import subprocess
import time
from collections.abc import Generator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, Final

from bluegreen.ports import DeploymentFailure
from pydantic import BaseModel, ConfigDict, SecretStr, TypeAdapter

KEY: Final = str(Path.home() / "Desktop/aws-key-pair/key-jarihana.pem")
IMAGE: Final = "sha256:16068322d45c10c99724439ebfdc85201a463110b58782aacbfe7c99d3867cb8"
DB_HOST: Final = "jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com"
DB_URL: Final = f"jdbc:postgresql://{DB_HOST}:5432/jarihana_dev?sslmode=require"
CANDIDATE: Final = "jarihana-worker-rehearsal-a"


class Config(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="ignore", frozen=True, hide_input_in_errors=True)
    Env: tuple[str, ...]


class Inspect(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="ignore", frozen=True, hide_input_in_errors=True)
    Id: str
    Image: str
    Config: Config

    def environment(self) -> Mapping[str, str]:
        return dict(item.split("=", 1) for item in self.Config.Env)


@dataclass(frozen=True, slots=True)
class Remote:
    host: str
    instance_id: str

    def arguments(self, *command: str) -> tuple[str, ...]:
        return ("ssh", "-C", "-i", KEY, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                f"ubuntu@{self.host}", shlex.join(command))

    def run(self, *command: str, payload: str | None = None) -> str:
        return subprocess.run(self.arguments(*command), input=payload, text=True, capture_output=True,
                              check=True, timeout=180).stdout.strip()

    def docker(self, *command: str, payload: str | None = None) -> str:
        return self.run("sudo", "docker", *command, payload=payload)

    def inspect(self, container: str) -> Inspect:
        return TypeAdapter(tuple[Inspect]).validate_json(self.docker("inspect", container))[0]

    def identify(self) -> None:
        command = ('set -eu; t="$(curl -fsS --max-time 3 -X PUT '
                   '-H "X-aws-ec2-metadata-token-ttl-seconds: 60" '
                   'http://169.254.169.254/latest/api/token)"; '
                   'curl -fsS --max-time 3 -H "X-aws-ec2-metadata-token: $t" '
                   'http://169.254.169.254/latest/meta-data/instance-id')
        if self.run("bash", "-c", command) != self.instance_id:
            raise DeploymentFailure("SSH instance does not match the rehearsal allowlist")


A: Final = Remote("ec2-43-203-178-208.ap-northeast-2.compute.amazonaws.com", "i-0a43bb4e0154e0f1f")
B: Final = Remote("ec2-15-165-209-224.ap-northeast-2.compute.amazonaws.com", "i-0430ff91d1af2fb37")


def control_token(inspect: Inspect) -> SecretStr:
    environment = inspect.environment()
    if inspect.Image != IMAGE or environment.get("APP_VERSION") != IMAGE:
        raise DeploymentFailure("rehearsal requires the pinned container image and matching version")
    if (environment.get("DB_URL") != DB_URL or environment.get("PUSH_ENABLED") != "false"
            or environment.get("PUSH_WORKER_ENABLED") != "false"
            or environment.get("PUSH_WORKER_CONTROL_ENABLED") != "true"
            or environment.get("PUSH_WORKER_ENVIRONMENT") != "dev-rehearsal"):
        raise DeploymentFailure("rehearsal requires the fixed dev DB and disabled push/scheduler")
    return SecretStr(environment["WORKER_CONTROL_TOKEN"])


def wait_stopped(remote: Remote, container: str) -> None:
    deadline = time.monotonic() + 90
    while remote.docker("inspect", "--format", "{{.State.Running}}", container) != "false":
        if time.monotonic() >= deadline:
            raise DeploymentFailure("graceful exit timed out; no forced kill is allowed")
        time.sleep(1)
    if remote.docker("inspect", "--format", "{{.State.OOMKilled}}", container) != "false":
        raise DeploymentFailure("container was OOM killed")
    if remote.docker("inspect", "--format", "{{.State.ExitCode}}", container) not in {"0", "143"}:
        raise DeploymentFailure("container did not exit normally")


def copy_image() -> None:
    with subprocess.Popen(B.arguments("sudo", "docker", "save", IMAGE), stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE) as source:
        _ = subprocess.run(A.arguments("sudo", "docker", "load"), stdin=source.stdout,
                           capture_output=True, check=True, timeout=180)
        if source.wait(timeout=10) != 0:
            raise DeploymentFailure("pinned image transfer failed")
    if A.docker("image", "inspect", "--format", "{{.Id}}", IMAGE) != IMAGE:
        raise DeploymentFailure("transferred image identity differs")


@contextmanager
def candidate_a(source: Inspect, recovery: Path) -> Generator[Inspect, None, None]:
    original = A.inspect("jarihana-dev-backend-1")
    policy = A.docker("inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", original.Id)
    if A.docker("ps", "-aq", "--filter", f"name=^/{CANDIDATE}$"):
        raise DeploymentFailure("a previous candidate exists; inspect it before another test")
    _ = control_token(source)
    _ = recovery.write_text(json.dumps({"original_container": original.Id,
                                       "original_image": original.Image,
                                       "original_restart_policy": policy,
                                       "candidate_name": CANDIDATE}, indent=2))
    copy_image()
    environment = dict(source.environment())
    environment.update({"PUSH_WORKER_HOST_ID": "jarihana-rehearsal-a",
                        "WORKER_CONTROL_TOKEN": secrets.token_hex(32)})
    if any("\n" in value or "\r" in value for value in environment.values()):
        raise DeploymentFailure("Docker env-file values must be single line")
    payload = "\n".join(f"{key}={value}" for key, value in environment.items()) + "\n"
    created = ""
    try:
        _ = A.docker("update", "--restart=no", original.Id)
        _ = A.docker("kill", "--signal=TERM", original.Id)
        wait_stopped(A, original.Id)
        created = A.docker("create", "--name", CANDIDATE, "--memory", "896m", "--restart=no",
                           "--env-file", "/dev/stdin", "-p", "8080:8080", "-p", "127.0.0.1:8081:8081",
                           "--log-driver", "local", "--log-opt", "max-size=10m", "--log-opt", "max-file=3",
                           IMAGE, payload=payload)
        _ = A.docker("start", created)
        yield A.inspect(created)
    finally:
        try:
            if created:
                if A.docker("inspect", "--format", "{{.State.Running}}", created) == "true":
                    _ = A.docker("kill", "--signal=TERM", created)
                wait_stopped(A, created)
                _ = A.docker("rm", created)
        finally:
            _ = A.docker("update", f"--restart={policy}", original.Id)
            if A.docker("inspect", "--format", "{{.State.Running}}", original.Id) != "true":
                _ = A.docker("start", original.Id)
            health = ('set -euo pipefail; for n in $(seq 1 45); do '
                      'if curl -fsS --max-time 3 http://127.0.0.1:8081/actuator/health/readiness '
                      '| jq -e \' .status == "UP" \' >/dev/null; then echo ORIGINAL_DEV_RESTORED; exit 0; fi; '
                      'sleep 2; done; exit 1')
            print(A.run("bash", "-c", health), flush=True)


@contextmanager
def tunnel(remote: Remote, forwards: tuple[str, ...], control: Path) -> Generator[None, None, None]:
    arguments = ["ssh", "-M", "-S", str(control), "-f", "-N", "-i", KEY,
                 "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                 "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=10"]
    for forward in forwards:
        arguments.extend(("-L", forward))
    arguments.append(f"ubuntu@{remote.host}")
    _ = subprocess.run(arguments, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       check=True, timeout=30)
    try:
        yield
    finally:
        _ = subprocess.run(("ssh", "-S", str(control), "-O", "exit", f"ubuntu@{remote.host}"),
                           capture_output=True, check=True, timeout=10)
