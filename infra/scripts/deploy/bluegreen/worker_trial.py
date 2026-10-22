from enum import StrEnum
from typing import assert_never

from .models import Action, DeploymentState, Phase
from .ports import DeploymentFailure
from .state_store import StateConflict
from .worker_handoff import WorkerHandoff


class TrialOperation(StrEnum):
    BOOTSTRAP = "bootstrap"
    CLEANUP = "cleanup"


class WorkerTrial:
    """Prepare or quiesce isolated trial workers through fenced commands, never direct DB writes."""

    def __init__(self, handoff: WorkerHandoff) -> None:
        self.handoff: WorkerHandoff = handoff

    def run(self, operation: TrialOperation) -> DeploymentState:
        control = self.handoff
        store = control.exchange.store
        with store.lock("worker-handoff"):
            state = control.current()
            if (state.phase is not Phase.PREPARING or state.pending is not None
                    or state.pending_run is not None or state.receipts or state.old is state.target):
                raise StateConflict("worker trial requires a new journal without outstanding commands")
            try:
                self.validate(operation)
                _ = control.step(Action.STATUS, state.old)
                _ = control.step(Action.STATUS, state.target)
                self.validate(operation)
                _ = control.step(Action.BEGIN, state.old)
                _ = control.step(Action.HANDOFF, state.old)
                match operation:
                    case TrialOperation.BOOTSTRAP:
                        _ = control.step(Action.ACTIVATE, state.old)
                        _ = control.step(Action.OBSERVE, state.old)
                        _ = control.step(Action.COMPLETE, state.old)
                        _ = control.step(Action.STATUS, state.target)
                        control.check_owner(state.old)
                        control.check_standby(state.target)
                    case TrialOperation.CLEANUP:
                        _ = control.step(Action.PAUSE, state.old)
                        control.wait_drained(state.old)
                        _ = control.step(Action.RELEASE, state.old)
                        _ = control.step(Action.STATUS, state.target)
                        self.unassigned()
                        _ = control.step(Action.COMPLETE, state.target)
                        _ = control.step(Action.STATUS, state.old)
                        self.unassigned()
                    case _:
                        assert_never(operation)
                with store.lock():
                    control.latest = store.update(control.current(), phase=Phase.COMPLETE)
                return control.latest
            except (DeploymentFailure, OSError, StateConflict):
                with store.lock():
                    current = store.read()
                    if current is not None and current == control.latest and current.phase is not Phase.ATTENTION:
                        control.latest = store.update(current, phase=Phase.ATTENTION,
                            reason="worker trial result uncertain; preserve hosts and reconcile before cleanup or restart")
                raise

    def validate(self, operation: TrialOperation) -> None:
        control = self.handoff
        state = control.current()
        if state.authority is None or state.authority.phase not in ("IDLE", "COMPLETE"):
            raise DeploymentFailure("worker trial cannot replace an unfinished database deployment")
        match operation:
            case TrialOperation.BOOTSTRAP:
                self.unassigned()
            case TrialOperation.CLEANUP:
                control.check_owner(state.old)
                control.check_standby(state.target)
            case _:
                assert_never(operation)

    def unassigned(self) -> None:
        control = self.handoff
        state = control.current()
        authority = state.authority
        if (authority is None or authority.status != "UNASSIGNED"
                or authority.owner_host is not None or authority.owner_boot is not None):
            raise DeploymentFailure("worker trial requires released shared authority")
        for slot in (state.old, state.target):
            control.check_standby(slot)
