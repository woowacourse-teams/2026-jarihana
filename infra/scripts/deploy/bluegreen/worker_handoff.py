from datetime import timedelta
from uuid import uuid4

from .models import Action, AppStatus, Command, DeploymentState, Phase, Slot
from .ports import DeploymentFailure, Policy
from .state_store import StateConflict
from .worker_coordinator import WorkerCoordinator


class WorkerHandoff:
    """Own a rehearsal journal snapshot; HTTP switching and timed observation are separate."""

    def __init__(self, exchange: WorkerCoordinator, policy: Policy | None = None) -> None:
        if exchange.topology.environment not in ("test", "local-e2e", "dev-rehearsal"):
            raise DeploymentFailure("worker handoff sequencer is restricted to isolated rehearsals")
        self.exchange: WorkerCoordinator = exchange
        self.policy: Policy = policy if policy is not None else Policy()
        initial = exchange.store.read()
        if initial is None:
            raise StateConflict("worker handoff requires an initialized journal")
        self.latest: DeploymentState = initial

    def run(self) -> DeploymentState:
        with self.exchange.store.lock("worker-handoff"):
            state = self.current()
            if (state.phase is not Phase.PREPARING or state.pending is not None
                    or state.pending_run is not None or state.receipts or state.old is state.target):
                raise StateConflict("worker handoff cannot resume or replace an existing exchange")
            try:
                self.check_owner(state.old)
                self.check_standby(state.target)
                _ = self.step(Action.STATUS, state.old)
                _ = self.step(Action.STATUS, state.target)
                self.check_owner(state.old)
                self.check_standby(state.target)
                _ = self.step(Action.BEGIN, state.old)
                _ = self.step(Action.HANDOFF, state.old)
                _ = self.step(Action.PAUSE, state.old)
                self.wait_drained(state.old)
                _ = self.step(Action.RELEASE, state.old)
                _ = self.step(Action.STATUS, state.target)
                self.check_standby(state.target)
                _ = self.step(Action.ACTIVATE, state.target)
                _ = self.step(Action.STATUS, state.old)
                self.check_owner(state.target)
                if not self.app(state.old).drained() or self.app(state.old).authority != self.current().authority:
                    raise DeploymentFailure("completed handoff requires both hosts to agree and the previous worker paused")
                if not self.app(state.old).drained():
                    raise DeploymentFailure("previous worker no longer proves drain")
                _ = self.step(Action.OBSERVE, state.target)
                _ = self.step(Action.COMPLETE, state.target)
                _ = self.step(Action.STATUS, state.old)
                self.check_owner(state.target)
                with self.exchange.store.lock():
                    self.latest = self.exchange.store.update(self.current(), phase=Phase.COMPLETE)
                return self.latest
            except (DeploymentFailure, OSError, StateConflict):
                with self.exchange.store.lock():
                    current = self.exchange.store.read()
                    if current == self.latest and current is not None and current.phase is not Phase.ATTENTION:
                        self.latest = self.exchange.store.update(current, phase=Phase.ATTENTION,
                            reason="worker handoff stopped; preserve both hosts and reconcile before another command")
                raise

    def current(self) -> DeploymentState:
        state = self.exchange.store.read()
        if state is None or state != self.latest or state.phase is Phase.ATTENTION:
            raise StateConflict("worker handoff journal changed or requires attention")
        return state

    def app(self, slot: Slot) -> AppStatus:
        state = self.current()
        result = state.old_app if slot is state.old else state.target_app
        host = self.exchange.topology.host(slot)
        if (result is None or result.environment != self.exchange.topology.environment
                or result.host_id != host.host_id or result.instance_id != host.instance_id or not result.running):
            raise DeploymentFailure("worker handoff requires both exact running processes")
        return result

    def check_owner(self, slot: Slot) -> None:
        status = self.app(slot)
        authority = self.current().authority
        if (authority is None or status.authority != authority or not status.healthy or status.worker != "ACTIVE"
                or authority.status != "ACTIVE" or authority.owner_host != status.host_id
                or authority.owner_boot != status.boot_id):
            raise DeploymentFailure("worker handoff requires the exact healthy current owner")

    def check_standby(self, slot: Slot) -> None:
        status = self.app(slot)
        if not status.healthy or not status.drained() or status.authority != self.current().authority:
            raise DeploymentFailure("worker handoff requires a healthy paused standby with current authority")

    def step(self, action: Action, slot: Slot, *, seconds: float | None = None) -> AppStatus:
        with self.exchange.store.lock():
            state = self.current()
            if state.pending is not None or state.pending_run is not None:
                raise StateConflict("outstanding worker command cannot be replaced")
            app = self.app(slot)
            phase = Phase.HANDOFF if action is Action.HANDOFF else state.phase
            command = Command(command_id=uuid4(), deployment_id=state.deployment_id,
                parent_run_id=state.parent_run_id, parent_attempt=state.parent_attempt, phase=phase,
                action=action, host=self.exchange.topology.host(slot), boot_id=app.boot_id, image=app.image,
                deadline=self.exchange.clock.now() + timedelta(seconds=self.policy.command_seconds if seconds is None else seconds),
                authority=state.authority)
            self.latest = self.exchange.store.save(state, state.model_copy(update={
                "revision": state.revision + 1, "pending": command, "phase": phase,
                "heartbeat": self.exchange.clock.now()}))
        receipt = self.exchange.execute(command)
        self.latest = self.exchange.current
        return receipt.status

    def wait_drained(self, slot: Slot) -> None:
        deadline = self.exchange.clock.monotonic() + self.policy.worker_drain_seconds
        while not self.app(slot).drained():
            left = deadline - self.exchange.clock.monotonic()
            if left <= 0:
                raise DeploymentFailure("worker drain timed out; do not release, activate or stop either host")
            _ = self.step(Action.STATUS, slot, seconds=min(left, self.policy.command_seconds))
            if self.exchange.clock.monotonic() > deadline:
                raise DeploymentFailure("worker drain evidence arrived after its deadline")
            if self.app(slot).drained():
                return
            left = deadline - self.exchange.clock.monotonic()
            if left <= 0:
                raise DeploymentFailure("worker drain timed out; do not release, activate or stop either host")
            self.exchange.clock.sleep(min(left, self.policy.poll_seconds))
