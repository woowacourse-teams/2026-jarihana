"""Child-side fencing against the current journal, exact run and local identity."""
from dataclasses import dataclass
import hashlib
from typing import Protocol

from pydantic import ValidationError

from .github_operations import authorize, authorize_local_process, validate_run
from .models import Action, AppStatus, Command, DeploymentState, Identifier, Phase, Record, RunIdentity, Topology
from .ports import Clock, DeploymentFailure


class MachineIdentity(Record):
    environment: Identifier
    host_id: Identifier
    instance_id: str


class JournalReader(Protocol):
    """Implementations must fetch current state, never cache the initial dispatch payload."""
    def read(self) -> DeploymentState | None: ...


@dataclass(frozen=True, slots=True)
class ChildContext:
    topology: Topology
    run: RunIdentity
    machine: MachineIdentity


class ChildGate:
    def __init__(self, context: ChildContext, journal: JournalReader, clock: Clock) -> None:
        self.context, self.journal, self.clock = context, journal, clock

    def state(self, command: Command) -> DeploymentState:
        """Fetch a fresh grant before each operation, including each shutdown poll."""
        validate_run(self.context.run, self.context.topology)
        try:
            state = self.journal.read()
        except (OSError, ValidationError) as error:
            raise DeploymentFailure("current child grant could not be read") from error
        if state is None:
            raise DeploymentFailure("child grant journal is missing")
        digest = hashlib.sha256(self.context.topology.model_dump_json().encode()).hexdigest()
        if (state.old is state.target or state.topology_digest != digest or state.pending_run != self.context.run
                or command.parent_run_id != state.parent_run_id or command.parent_attempt != state.parent_attempt):
            raise DeploymentFailure("child run, parent attempt or topology does not match the current grant")
        authorize(command, state, self.clock.now())
        host = self.context.topology.host(command.host.slot)
        machine = self.context.machine
        if (command.host != host or machine.environment != self.context.topology.environment
                or machine.host_id != host.host_id or machine.instance_id != host.instance_id):
            raise DeploymentFailure("child is not on the allowlisted local machine")
        if command.action in (Action.START_EC2, Action.STOP_EC2, Action.SWITCH):
            raise DeploymentFailure("coordinator operations cannot run on an application child")
        if command.action is Action.PREPARE and (command.host.slot is not state.target
                                                or command.phase is not Phase.PREPARING or command.boot_id is not None):
            raise DeploymentFailure("preparation must target the standby slot without reusing an old boot")
        if command.action not in (Action.STATUS, Action.PREPARE) and command.boot_id is None:
            raise DeploymentFailure("mutations require the exact process boot")
        return state

    def check(self, command: Command, actual: AppStatus | None) -> None:
        self.state(command)
        if actual is None:
            if command.action is not Action.PREPARE or command.boot_id is not None:
                raise DeploymentFailure("only candidate preparation may start without a process")
            return
        if actual.environment != self.context.topology.environment:
            raise DeploymentFailure("local application environment does not match")
        authorize_local_process(command, actual)
