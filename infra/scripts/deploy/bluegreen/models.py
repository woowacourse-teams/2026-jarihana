"""Validated records persisted at deployment and child-operation boundaries."""
from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, model_validator

Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")]
Digest = Annotated[str, Field(pattern=r"^sha256:[a-f0-9]{64}$")]
Counter = Annotated[int, Field(ge=0, strict=True)]


class InvalidTopology(ValueError):
    """The fixed A/B topology cannot be safely used for start/stop operations."""


class Record(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Slot(StrEnum):
    A = "A"
    B = "B"

    def other(self) -> "Slot":
        return Slot.B if self is Slot.A else Slot.A


class Phase(StrEnum):
    PREPARING = "PREPARING"
    HANDOFF = "HANDOFF"
    SWITCHING = "SWITCHING"
    OBSERVING = "OBSERVING"
    DRAINING_HTTP = "DRAINING_HTTP"
    SEALED = "SEALED"
    COMPLETE = "COMPLETE"
    ROLLING_BACK = "ROLLING_BACK"
    ROLLED_BACK = "ROLLED_BACK"
    ATTENTION = "NEEDS_ATTENTION"


class Action(StrEnum):
    STATUS = "status"
    PREPARE = "prepare"
    BEGIN = "begin"
    HANDOFF = "phase_handoff"
    PAUSE = "pause"
    RELEASE = "release"
    ACTIVATE = "activate"
    OBSERVE = "phase_observe"
    COMPLETE = "phase_complete"
    STOP_APP = "stop_app"
    START_EC2 = "start_ec2"
    STOP_EC2 = "stop_ec2"
    SWITCH = "switch_http"


class Host(Record):
    slot: Slot
    host_id: Identifier
    instance_id: Annotated[str, Field(pattern=r"^i-[a-f0-9]{8,17}$")]
    upstream: Annotated[str, Field(pattern=r"^[a-zA-Z0-9.-]+:[0-9]{1,5}$")]


class ControlRelease(Record):
    workflow: str
    ref: Annotated[str, Field(pattern=r"^refs/tags/[A-Za-z0-9_./-]+$")]
    sha: Annotated[str, Field(pattern=r"^[a-f0-9]{40}$")]


class Topology(Record):
    environment: Identifier
    coordinator_instance_id: str
    a: Host
    b: Host
    control: ControlRelease

    @model_validator(mode="after")
    def distinct_hosts(self) -> "Topology":
        if self.a.slot is not Slot.A or self.b.slot is not Slot.B:
            raise InvalidTopology("host slots must be A and B")
        if (self.a.instance_id == self.b.instance_id or self.a.host_id == self.b.host_id
                or self.a.upstream == self.b.upstream):
            raise InvalidTopology("A/B identities and upstreams must be distinct")
        if self.coordinator_instance_id in (self.a.instance_id, self.b.instance_id):
            raise InvalidTopology("coordinator cannot be an application instance")
        return self

    def host(self, slot: Slot) -> Host:
        return self.a if slot is Slot.A else self.b


class Authority(Record):
    deployment_id: UUID | None = None
    epoch: Counter = 0
    revision: Counter = 0
    phase: str = "IDLE"
    owner_host: str | None = None
    owner_boot: UUID | None = None
    status: str = "UNASSIGNED"


class AppStatus(Record):
    environment: Identifier
    host_id: Identifier
    instance_id: str
    boot_id: UUID
    image: Digest
    worker: str
    in_flight: Counter
    unresolved: Counter
    healthy: StrictBool
    running: StrictBool
    normal_exit: bool = False
    http_in_flight: Counter | None = None
    background_drained: bool = False
    authority: Authority

    def drained(self) -> bool:
        return self.worker == "PAUSED" and self.in_flight == 0 and self.unresolved == 0

    def requests_drained(self) -> bool:
        return self.drained() and self.http_in_flight == 0 and self.background_drained


class RunIdentity(Record):
    run_id: Annotated[int, Field(gt=0, strict=True)]
    attempt: Annotated[int, Field(gt=0, strict=True)]
    workflow: str
    ref: str
    sha: str
    event: str


class Command(Record):
    command_id: UUID
    deployment_id: UUID
    parent_run_id: Annotated[int, Field(gt=0, strict=True)]
    parent_attempt: Annotated[int, Field(gt=0, strict=True)]
    phase: Phase
    action: Action
    host: Host
    boot_id: UUID | None
    image: Digest
    deadline: AwareDatetime
    authority: Authority | None


class Receipt(Record):
    schema_version: Literal[1]
    command: Command
    run: RunIdentity
    success: bool
    status: AppStatus


class DrainTicket(Record):
    container_id: str
    workers: tuple[str, ...]


class DeploymentState(Record):
    schema_version: int = 1
    deployment_id: UUID
    session_id: UUID
    revision: Counter = 0
    phase: Phase = Phase.PREPARING
    old: Slot = Slot.A
    target: Slot = Slot.B
    image: str = ""
    topology_digest: str = ""
    parent_run_id: int = 1
    parent_attempt: int = 1
    heartbeat: AwareDatetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    authority: Authority | None = None
    old_app: AppStatus | None = None
    target_app: AppStatus | None = None
    pending: Command | None = None
    pending_run: RunIdentity | None = None
    receipts: tuple[Receipt, ...] = ()
    drain_ticket: DrainTicket | None = None
    switched_at: AwareDatetime | None = None
    rollback_sealed: bool = False
    http_recovered: bool = False
    worker_recovered: bool = False
    reason: str = ""


class DeploymentRequest(Record):
    deployment_id: UUID = Field(default_factory=uuid4)
    image: Digest
    parent_run_id: Annotated[int, Field(gt=0, strict=True)]
    parent_attempt: Annotated[int, Field(gt=0, strict=True)] = 1
    rollback_compatible: StrictBool = False
