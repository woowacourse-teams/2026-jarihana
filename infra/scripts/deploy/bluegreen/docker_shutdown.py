"""Prove a pinned old container exited after SIGTERM without forcing its exit."""
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Annotated, Literal, Protocol
from uuid import UUID
import math

from pydantic import AwareDatetime, Field, StrictBool

from .github_operations import authorize_local_process
from .models import Action, AppStatus, Command, Counter, Digest, Record
from .ports import Clock, DeploymentFailure, UnknownResult


class ContainerPin(Record):
    container_id: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    image_id: Digest
    started_at: AwareDatetime
    restart_count: Counter


class ContainerSnapshot(ContainerPin):
    running: StrictBool
    paused: StrictBool
    restarting: StrictBool
    dead: StrictBool
    oom_killed: StrictBool
    auto_remove: StrictBool
    exit_code: Annotated[int, Field(strict=True)]
    finished_at: AwareDatetime

    def pin(self) -> ContainerPin:
        return ContainerPin(container_id=self.container_id, image_id=self.image_id,
                            started_at=self.started_at, restart_count=self.restart_count)


class ShutdownEvidence(Record):
    command_id: UUID
    boot_id: UUID
    container: ContainerPin
    signal: Literal["SIGTERM"]
    stop_cli_exit: Literal[0]
    exit_code: Literal[0, 143]
    finished_at: AwareDatetime


@dataclass(frozen=True, slots=True)
class StoppedApplication:
    status: AppStatus
    evidence: ShutdownEvidence


class StopCall(Protocol):
    def poll(self) -> int | None: ...


class Docker(Protocol):
    def inspect(self, container: str) -> ContainerSnapshot: ...
    def begin_stop(self, container: str) -> AbstractContextManager[StopCall]: ...


class StopGrant(Protocol):
    """Re-read the exact pending sealed grant, including deadline and host, each call."""
    def check(self, command: Command, actual: AppStatus) -> None: ...


@dataclass(frozen=True, slots=True)
class StopRuntime:
    docker: Docker
    clock: Clock
    grant: StopGrant


@dataclass(frozen=True, slots=True)
class ShutdownPolicy:
    """Draft bounded observation only; expiration never forces the app to exit."""
    wait_seconds: float = 120
    poll_seconds: float = 0.25

    def __post_init__(self) -> None:
        if not all(math.isfinite(value) and value > 0 for value in (self.wait_seconds, self.poll_seconds)):
            raise DeploymentFailure("shutdown waits must be finite and positive")


class DockerStopper:
    def __init__(self, runtime: StopRuntime, policy: ShutdownPolicy = ShutdownPolicy()):
        self.runtime = runtime
        self.policy = policy

    def stop(self, command: Command, actual: AppStatus, pin: ContainerPin) -> StoppedApplication:
        """A timeout loses automatic cleanup permission; never send a second signal."""
        if command.action is not Action.STOP_APP or command.boot_id is None:
            raise DeploymentFailure("shutdown requires an exact STOP_APP process grant")
        authorize_local_process(command, actual)
        if (not actual.running or not actual.requests_drained()
                or actual.authority.owner_host == actual.host_id):
            raise DeploymentFailure("old app must drain and relinquish worker authority before shutdown")
        self.runtime.grant.check(command, actual)
        before = self.runtime.docker.inspect(pin.container_id)
        if (before.pin() != pin or not before.running or before.paused or before.restarting
                or before.dead or before.oom_killed or before.auto_remove):
            raise DeploymentFailure("pinned container generation is not ready for graceful shutdown")
        # Recheck after inspection, immediately before the sole external mutation.
        self.runtime.grant.check(command, actual)
        deadline = self.runtime.clock.monotonic() + self.policy.wait_seconds
        with self.runtime.docker.begin_stop(pin.container_id) as call:
            while True:
                self.runtime.grant.check(command, actual)
                if self.runtime.clock.monotonic() >= deadline:
                    raise UnknownResult("SIGTERM completion timed out; preserve both EC2 instances")
                after = self.runtime.docker.inspect(pin.container_id)
                if (after.pin() != pin or after.oom_killed or after.paused or after.restarting or after.dead):
                    raise UnknownResult("container restarted, changed generation or has an abnormal termination")
                completed = call.poll()
                if completed is not None and completed != 0:
                    raise UnknownResult("Docker stop result is uncertain; do not retry or stop EC2")
                if not after.running and completed == 0:
                    self.runtime.grant.check(command, actual)
                    break
                self.runtime.clock.sleep(min(self.policy.poll_seconds, max(0, deadline - self.runtime.clock.monotonic())))
        if (after.exit_code not in (0, 143) or after.finished_at <= before.started_at
                or after.finished_at == before.finished_at):
            raise DeploymentFailure("container exit does not prove a clean SIGTERM shutdown")
        evidence = ShutdownEvidence(command_id=command.command_id, boot_id=actual.boot_id, container=pin,
                                    signal="SIGTERM", stop_cli_exit=0, exit_code=after.exit_code,
                                    finished_at=after.finished_at)
        return StoppedApplication(actual.model_copy(update={"running": False, "normal_exit": True}), evidence)
