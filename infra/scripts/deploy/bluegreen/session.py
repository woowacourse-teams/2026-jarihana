"""Write-ahead side effects and exact child result collection for one controller run."""
from collections.abc import Callable
from datetime import timedelta
from typing import TypeVar
from uuid import uuid4

from .github_operations import authorize, validate_receipt, validate_run
from .models import Action, AppStatus, Command, DeploymentState, Phase, Slot, Topology
from .ports import Adapters, DeploymentFailure, Policy, UnknownResult
from .state_store import StateConflict, StateStore

Result = TypeVar("Result")


class Session:
    """Mutable cursor into a CAS journal; only its owning controller advances it."""
    def __init__(self, store: StateStore, topology: Topology, adapters: Adapters):
        self.store = store
        self.topology = topology
        self.adapters = adapters
        state = store.read()
        if state is None:
            raise StateConflict("deployment journal is missing")
        self.state = state
        self.deadline = adapters.clock.monotonic() + 3600

    def save(self, changed: DeploymentState) -> None:
        changed = changed.model_copy(update={"revision": self.state.revision + 1,
                                             "heartbeat": self.adapters.clock.now()})
        self.state = self.store.save(self.state, changed)

    def phase(self, phase: Phase) -> None:
        if self.state.pending is not None:
            raise UnknownResult("an outstanding command must be reconciled first")
        self.save(self.state.model_copy(update={"phase": phase}))

    def tick(self) -> None:
        if self.remaining() <= 0:
            raise DeploymentFailure("controller deadline exceeded")
        if self.store.read() != self.state or self.state.phase is Phase.ATTENTION:
            raise StateConflict("watchdog or another writer changed the deployment")
        self.save(self.state)

    def remaining(self) -> float:
        return self.deadline - self.adapters.clock.monotonic()

    def wait(self, check: Callable[[], bool], seconds: float, policy: Policy) -> None:
        deadline = self.adapters.clock.monotonic() + seconds
        while True:
            self.tick()
            passed = check()
            if self.adapters.clock.monotonic() >= deadline:
                raise DeploymentFailure("phase deadline exceeded")
            if passed:
                return
            self.adapters.clock.sleep(min(policy.poll_seconds, deadline - self.adapters.clock.monotonic()))

    def intent(self, action: Action, slot: Slot, seconds: float) -> Command:
        self.tick()
        if self.state.pending is not None:
            raise UnknownResult("outstanding command cannot be overwritten")
        app = self.state.old_app if slot is self.state.old else self.state.target_app
        command = Command(command_id=uuid4(), deployment_id=self.state.deployment_id,
                          parent_run_id=self.state.parent_run_id, parent_attempt=self.state.parent_attempt,
                          phase=self.state.phase, action=action, host=self.topology.host(slot),
                          boot_id=None if action is Action.PREPARE else (app.boot_id if app else None),
                          image=self.state.image, deadline=self.adapters.clock.now() + timedelta(seconds=min(seconds, self.remaining())),
                          authority=self.state.authority)
        self.save(self.state.model_copy(update={"pending": command, "pending_run": None}))
        return command

    def effect(self, action: Action, slot: Slot, callback: Callable[[], Result]) -> Result:
        command = self.intent(action, slot, 30)
        authorize(command, self.state, self.adapters.clock.now())
        result = callback()
        latest = self.store.read()
        if latest is None:
            raise StateConflict("deployment journal disappeared during an operation")
        authorize(command, latest, self.adapters.clock.now())
        self.save(self.state.model_copy(update={"pending": None}))
        return result

    def app(self, action: Action, slot: Slot, policy: Policy) -> AppStatus:
        command = self.intent(action, slot, policy.command_seconds)
        authorize(command, self.state, self.adapters.clock.now())
        run = self.adapters.apps.dispatch(command)
        if run is None:
            matches = self.adapters.apps.find(command)
            if len(matches) != 1:
                raise UnknownResult("dispatch response lost; exact child run cannot be identified")
            run = matches[0]
        validate_run(run, self.topology)
        self.save(self.state.model_copy(update={"pending_run": run}))
        result = None

        def completed() -> bool:
            nonlocal result
            result = self.adapters.apps.poll(run)
            return result is not None

        try:
            self.wait(completed, policy.command_seconds, policy)
        except DeploymentFailure:
            self.adapters.apps.cancel(run)
            raise
        if result is None:
            raise UnknownResult("child result is missing")
        authorize(command, self.state, self.adapters.clock.now())
        validate_receipt(result, self.state, self.topology)
        key = "old_app" if slot is self.state.old else "target_app"
        self.save(self.state.model_copy(update={key: result.status, "authority": result.status.authority,
                                               "receipts": self.state.receipts + (result,),
                                               "pending": None, "pending_run": None}))
        return result.status
