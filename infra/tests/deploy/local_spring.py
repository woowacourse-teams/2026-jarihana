"""Local-only real JVM adapter. Never accepts production DB/instance inputs."""
from datetime import datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo
import json
import os
import time
from pydantic import StrictBool, ValidationError

from bluegreen.models import Action, AppStatus, Authority, Command, Counter, Host, Record
from bluegreen.nginx_switch import ApiProbe, ProcessRunner
from bluegreen.ports import DeploymentFailure, SystemClock
from bluegreen.docker_runtime import DockerRuntime
from bluegreen.docker_shutdown import ContainerPin, DockerStopper, StopGrant, StopRuntime

TOKEN = "local-e2e-machine-token-fixture-0123456789abcdef"


class EndpointIdentity(Record):
    hostId: str
    bootId: UUID


class EndpointWorker(Record):
    state: str
    inFlight: int
    unresolved: int


class EndpointAuthority(Record):
    environment: str
    deploymentId: UUID
    epoch: int
    phase: str
    revision: int
    authorityRevision: int
    owner: EndpointIdentity | None
    status: str


class EndpointActivity(Record):
    httpInFlight: Counter
    backgroundInFlight: Counter
    backgroundDrained: StrictBool


class EndpointStatus(Record):
    version: str
    environment: str
    identity: EndpointIdentity
    worker: EndpointWorker
    authority: EndpointAuthority | None
    activity: EndpointActivity


class SpringNode:
    """Own one isolated local JVM; fixture has no schedulers, users or external push."""
    def __init__(self, host: Host, database: str, directory: Path):
        self.host, self.database, self.directory = host, database, directory
        self.http_port = 0
        self.management_port = 0
        self.container = ""
        self.network = ""
        self.image = ""
        self.runner = ProcessRunner()
        self.docker = DockerRuntime(self.runner)
        self.pin: ContainerPin | None = None

    def start(self, image: str) -> None:
        java_image = os.environ.get("JARIHANA_E2E_JAVA_IMAGE", "")
        if not java_image.startswith("sha256:"):
            raise DeploymentFailure("set JARIHANA_E2E_JAVA_IMAGE to a locally verified Java 21 image ID")
        self.image = image
        environment = {"DB_URL": self.database, "DB_USERNAME": "fixture", "DB_PASSWORD": "fixture",
                       "APP_VERSION": image, "PUSH_ENABLED": "false", "PUSH_WORKER_ENABLED": "false",
                       "PUSH_WORKER_CONTROL_ENABLED": "true", "PUSH_WORKER_HOST_ID": self.host.host_id,
                       "PUSH_WORKER_ENVIRONMENT": "local-e2e", "WORKER_CONTROL_TOKEN": TOKEN,
                       "ACCESS_TOKEN_SECRET": "local-fixture-jwt-secret-0123456789abcdef",
                       "INVITATION_TOKEN_KEY_PRIMARY": "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
                       "GITHUB_OAUTH_CLIENT_ID": "fixture", "GITHUB_OAUTH_CLIENT_SECRET": "fixture",
                       "AWS_EC2_METADATA_DISABLED": "true", "SENTRY_BACKEND_DSN": ""}
        jar = Path(__file__).parents[3] / "backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar"
        env_arguments = tuple(argument for key, value in environment.items() for argument in ("--env", f"{key}={value}"))
        self.runner.run(("docker", "run", "-d", "--name", self.container, "--network", self.network,
                         "--ip", self.host.upstream.split(":")[0], "-p", "127.0.0.1::8080", "-p", "127.0.0.1::8081",
                         "--entrypoint", "java", "-v", f"{jar}:/tmp/fixture-backend.jar:ro", *env_arguments,
                         java_image, "-Xmx256m", "-jar", "/tmp/fixture-backend.jar", "--spring.profiles.active=prod"))
        self.http_port = int(self.runner.run(("docker", "port", self.container, "8080/tcp")).strip().rsplit(":", 1)[1])
        self.management_port = int(self.runner.run(("docker", "port", self.container, "8081/tcp")).strip().rsplit(":", 1)[1])
        self.pin = self.docker.inspect(self.container).pin()
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if self.runner.run(("docker", "inspect", "--format", "{{.State.Running}}", self.container)).strip() != "true":
                raise DeploymentFailure(f"fixture JVM {self.host.slot} exited; inspect local logs")
            try:
                if self.snapshot().healthy:
                    return
            except DeploymentFailure:
                time.sleep(0.25)
        raise DeploymentFailure("fixture JVM readiness timed out")

    def endpoint(self) -> EndpointStatus:
        raw = self.runner.run(("curl", "--fail", "--silent", "--max-time", "2", "--header",
                               f"X-Jarihana-Worker-Control-Token: {TOKEN}",
                               f"http://127.0.0.1:{self.management_port}/actuator/workercontrol"))
        return EndpointStatus.model_validate_json(raw)

    def snapshot(self) -> AppStatus:
        raw = self.endpoint()
        healthy = True
        try:
            ApiProbe.model_validate_json(self.runner.run(("curl", "--fail", "--silent", "--max-time", "2",
                                                          f"http://127.0.0.1:{self.http_port}/api/groups?size=1")))
        except (DeploymentFailure, ValidationError):
            healthy = False
        authority = Authority()
        if raw.authority is not None:
            value = raw.authority
            authority = Authority(deployment_id=value.deploymentId, epoch=value.epoch, revision=value.revision,
                                  phase=value.phase, owner_host=value.owner.hostId if value.owner else None,
                                  owner_boot=value.owner.bootId if value.owner else None, status=value.status)
        return AppStatus(environment=raw.environment, host_id=raw.identity.hostId, instance_id=self.host.instance_id,
                         boot_id=raw.identity.bootId, image=raw.version, worker=raw.worker.state,
                         in_flight=raw.worker.inFlight, unresolved=raw.worker.unresolved, authority=authority,
                         healthy=healthy, running=True,
                         http_in_flight=raw.activity.httpInFlight,
                         background_drained=raw.activity.backgroundDrained and raw.activity.backgroundInFlight == 0)

    def control(self, command: Command) -> AppStatus:
        status = self.snapshot()
        authority = command.authority
        if authority is None:
            raise DeploymentFailure("worker command has no expected authority")
        phases = {Action.HANDOFF: "HANDOFF", Action.OBSERVE: "OBSERVE", Action.COMPLETE: "COMPLETE"}
        operation = "phase" if command.action in phases else command.action.value
        payload = {"deploymentId": str(command.deployment_id), "epoch": authority.epoch,
                   "commandId": str(command.command_id), "targetHostId": status.host_id,
                   "targetBootId": str(status.boot_id), "expectedPhase": authority.phase,
                   "expectedRevision": authority.revision,
                   "deadline": (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(seconds=30)).replace(tzinfo=None).isoformat()}
        if command.action in phases:
            payload["nextPhase"] = phases[command.action]
        self.runner.run(("curl", "--fail", "--silent", "--max-time", "3", "--header", "Content-Type: application/json",
                         "--header", f"X-Jarihana-Worker-Control-Token: {TOKEN}", "--data", json.dumps(payload),
                         f"http://127.0.0.1:{self.management_port}/actuator/workercontrol/{operation}"))
        return self.snapshot()

    def stop(self, command: Command, grant: StopGrant) -> AppStatus:
        if self.pin is None:
            raise DeploymentFailure("fixture container generation was not captured at startup")
        result = DockerStopper(StopRuntime(self.docker, SystemClock(), grant)).stop(command, self.snapshot(), self.pin)
        (self.directory / f"shutdown-{command.command_id}.json").write_text(result.evidence.model_dump_json(indent=2))
        self._remove()
        return result.status

    def close(self) -> None:
        if self.container:
            names = self.runner.run(("docker", "ps", "--all", "--filter", f"name=^/{self.container}$", "--format", "{{.Names}}"))
            if names.strip() == self.container:
                self._remove()

    def _remove(self) -> None:
        logs = self.runner.run(("docker", "logs", self.container))
        (self.directory / f"{self.host.slot.value}-{uuid4()}.log").write_text(logs)
        self.runner.run(("docker", "rm", "--force", self.container))
