import hashlib
from uuid import uuid4

from .github_operations import authorize, validate_receipt, validate_run
from .models import (
    Action,
    Command,
    DeploymentState,
    Phase,
    Receipt,
    RunIdentity,
    Topology,
)
from .ports import Applications, Clock, DeploymentFailure, UnknownResult
from .state_store import StateConflict, StateStore


class StatusCoordinator:
    def __init__(self, store: StateStore, topology: Topology, apps: Applications, clock: Clock) -> None:
        self.store: StateStore = store
        self.topology: Topology = topology
        self.apps: Applications = apps
        self.clock: Clock = clock
        self.state: DeploymentState | None = None

    def execute(self, command: Command) -> Receipt:
        if (command.action is not Action.STATUS or command.phase is not Phase.PREPARING
                or command.host != self.topology.host(command.host.slot) or command.boot_id is None
                or command.parent_attempt != 1 or self.clock.now() >= command.deadline):
            raise DeploymentFailure("coordinator requires a fresh, boot-bound STATUS command")
        with self.store.lock():
            state = self.store.create(DeploymentState(
                deployment_id=command.deployment_id, session_id=uuid4(), target=command.host.slot,
                old=command.host.slot.other(), image=command.image,
                topology_digest=hashlib.sha256(self.topology.model_dump_json().encode()).hexdigest(),
                parent_run_id=command.parent_run_id, parent_attempt=command.parent_attempt,
                heartbeat=self.clock.now(), pending=command))
            self.state = state
            try:
                run = self.apps.dispatch(command)
                if run is None:
                    run = self._find(command)
                validate_run(run, self.topology)
                state = self.state
                state = self._save(state, state.model_copy(update={"pending_run": run}))
                receipt = self._collect(command, run)
                state = self.state
                latest = self.store.read()
                if latest != state:
                    raise StateConflict("STATUS grant changed during result collection")
                authorize(command, state, self.clock.now())
                validate_receipt(receipt, state, self.topology)
                if receipt.status.image != command.image or not receipt.status.healthy or not receipt.status.running:
                    raise DeploymentFailure("STATUS application image or readiness does not match")
                _ = self._save(state, state.model_copy(update={
                    "phase": Phase.COMPLETE, "pending": None, "pending_run": None,
                    "target_app": receipt.status, "receipts": (receipt,)}))
                return receipt
            except (DeploymentFailure, OSError, StateConflict):
                current = self.store.read()
                if current is not None and current == self.state:
                    _ = self._save(current, current.model_copy(update={
                        "phase": Phase.ATTENTION, "reason": "STATUS verification failed; preserve pending execution"}))
                raise

    def _save(self, previous: DeploymentState, changed: DeploymentState) -> DeploymentState:
        self.state = self.store.save(previous, changed.model_copy(update={
            "revision": previous.revision + 1, "heartbeat": self.clock.now()}))
        return self.state

    def _find(self, command: Command) -> RunIdentity:
        while self.clock.now() < command.deadline:
            matches = self.apps.find(command)
            if len(matches) > 1:
                raise UnknownResult("multiple STATUS executions require reconciliation")
            if matches:
                return matches[0]
            self._wait(command)
        raise UnknownResult("STATUS dispatch outcome could not be identified")

    def _collect(self, command: Command, run: RunIdentity) -> Receipt:
        while self.clock.now() < command.deadline:
            receipt = self.apps.poll(run)
            if receipt is not None:
                return receipt
            self._wait(command)
        raise UnknownResult("STATUS result deadline exceeded")

    def _wait(self, command: Command) -> None:
        state = self.state
        if state is None or self.store.read() != state:
            raise StateConflict("STATUS grant changed while waiting")
        authorize(command, state, self.clock.now())
        _ = self._save(state, state)
        self.clock.sleep(min(5, max(0, (command.deadline - self.clock.now()).total_seconds())))
