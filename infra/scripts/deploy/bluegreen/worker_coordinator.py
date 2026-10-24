import hashlib
import os

from pydantic import ValidationError

from .github_operations import authorize, validate_receipt, validate_run
from .models import (
    Action,
    AppStatus,
    Command,
    DeploymentState,
    Phase,
    Receipt,
    RunIdentity,
    Topology,
)
from .ports import Applications, Clock, DeploymentFailure, UnknownResult
from .state_store import StateConflict, StateStore
from .worker_command import expected_authority, payload


class WorkerCoordinator:
    """Resolve one recorded worker intent; uncertainty preserves the grant for reconciliation."""

    def __init__(self, store: StateStore, topology: Topology, apps: Applications, clock: Clock) -> None:
        self.store: StateStore = store
        self.topology: Topology = topology
        self.apps: Applications = apps
        self.clock: Clock = clock
        self.state: DeploymentState | None = None

    def execute(self, command: Command) -> Receipt:
        _ = payload(command)
        with self.store.lock():
            state = self.store.read()
            if state is None:
                raise StateConflict("worker intent must be recorded before dispatch")
            authorize(command, state, self.clock.now())
            digest = hashlib.sha256(self.topology.model_dump_json().encode()).hexdigest()
            if (state.topology_digest != digest or state.pending_run is not None
                    or command.host != self.topology.host(command.host.slot) or command.parent_attempt != 1
                    or state.parent_run_id != command.parent_run_id or state.parent_attempt != command.parent_attempt):
                raise StateConflict("worker intent identity differs or an execution is already bound")
            before = state.old_app if command.host.slot is state.old else state.target_app
            if (before is None or before.boot_id != command.boot_id or before.host_id != command.host.host_id
                    or before.instance_id != command.host.instance_id or before.environment != self.topology.environment
                    or state.authority != before.authority):
                raise DeploymentFailure("worker intent requires the exact previous process snapshot")
            expected = expected_authority(command, before)
            self.state = state
            try:
                run = self.apps.dispatch(command) if self._claim_dispatch(command) else None
                if run is None:
                    run = self._find(command)
                validate_run(run, self.topology)
                self._save(self.current.model_copy(update={"pending_run": run}))
                receipt = self._collect(command, run)
                state = self.current
                if self.store.read() != state:
                    raise StateConflict("worker grant changed during result collection")
                authorize(command, state, self.clock.now())
                validate_receipt(receipt, state, self.topology)
                after = receipt.status
                if after.authority != expected or after.image != before.image or not after.running:
                    raise DeploymentFailure("worker result differs from the expected authority or process")
                self._check_worker(command, after)
                key = "old_app" if command.host.slot is state.old else "target_app"
                self._save(state.model_copy(update={key: after, "authority": after.authority,
                    "pending": None, "pending_run": None, "receipts": state.receipts + (receipt,)}))
                return receipt
            except (DeploymentFailure, OSError, StateConflict):
                latest = self.store.read()
                if latest is not None and latest == self.state:
                    self._save(latest.model_copy(update={"phase": Phase.ATTENTION,
                        "reason": "worker result uncertain; preserve command and execution; do not redispatch"}))
                raise

    @property
    def current(self) -> DeploymentState:
        if self.state is None:
            raise StateConflict("worker exchange has not started")
        return self.state

    def _save(self, changed: DeploymentState) -> None:
        previous = self.current
        self.state = self.store.save(previous, changed.model_copy(update={
            "revision": previous.revision + 1, "heartbeat": self.clock.now()}))

    def _claim_dispatch(self, command: Command) -> bool:
        """Fsync a one-shot marker before POST; a restart may only search for its original run."""
        path = self.store.directory / f"dispatch-{command.command_id}.json"
        try:
            with path.open("x", encoding="utf-8") as handle:
                _ = handle.write(command.model_dump_json())
                handle.flush()
                os.fsync(handle.fileno())
        except FileExistsError:
            try:
                original = Command.model_validate_json(path.read_bytes())
            except ValidationError:
                raise StateConflict("worker dispatch marker is incomplete; reconcile without another POST") from None
            if original != command:
                raise StateConflict("worker command UUID was reused with different content") from None
            return False
        descriptor = os.open(self.store.directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return True

    def _find(self, command: Command) -> RunIdentity:
        while self.clock.now() < command.deadline:
            matches = self.apps.find(command)
            if len(matches) > 1:
                raise UnknownResult("multiple worker executions require reconciliation")
            if matches:
                return matches[0]
            self._wait(command)
        raise UnknownResult("worker dispatch outcome is unknown")

    def _collect(self, command: Command, run: RunIdentity) -> Receipt:
        while self.clock.now() < command.deadline:
            receipt = self.apps.poll(run)
            if receipt is not None:
                return receipt
            self._wait(command)
        raise UnknownResult("worker result deadline exceeded")

    def _wait(self, command: Command) -> None:
        if self.store.read() != self.current:
            raise StateConflict("worker grant changed while waiting")
        authorize(command, self.current, self.clock.now())
        self._save(self.current)
        self.clock.sleep(min(5, max(0, (command.deadline - self.clock.now()).total_seconds())))

    @staticmethod
    def _check_worker(command: Command, after: AppStatus) -> None:
        if command.action is Action.PAUSE and after.worker not in ("DRAINING", "PAUSED"):
            raise DeploymentFailure("pause did not stop worker admission")
        if command.action is Action.RELEASE and not after.drained():
            raise DeploymentFailure("release did not prove worker drain")
        if command.action is Action.ACTIVATE and (not after.healthy or after.worker != "ACTIVE"):
            raise DeploymentFailure("activation did not prove a healthy active worker")
