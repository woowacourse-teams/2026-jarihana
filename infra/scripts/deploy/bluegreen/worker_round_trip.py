import hashlib
import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from .models import DeploymentState, Phase, RunIdentity, Slot
from .ports import DeploymentFailure
from .state_store import StateConflict
from .worker_coordinator import WorkerCoordinator
from .worker_handoff import WorkerHandoff
from .worker_parent_settings import WorkerRoundTripPlan
from .worker_trial import TrialOperation, WorkerTrial


def sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


@dataclass(frozen=True, slots=True)
class RoundTripContext:
    parent: RunIdentity
    plan: WorkerRoundTripPlan
    directory: Path
    verify: Callable[[], None]


class WorkerRoundTrip:
    """Run four fenced trial stages once; failures never trigger speculative cleanup."""

    def __init__(self, exchange: WorkerCoordinator, context: RoundTripContext) -> None:
        self.exchange: WorkerCoordinator = exchange
        self.context: RoundTripContext = context

    def run(self) -> tuple[DeploymentState, ...]:
        store, context = self.exchange.store, self.context
        context.directory.mkdir(mode=0o700, parents=True, exist_ok=False)
        with store.lock("worker-round-trip"):
            context.verify()
            previous = store.read()
            if previous is not None and (previous.phase not in (Phase.COMPLETE, Phase.ROLLED_BACK)
                    or previous.pending is not None or previous.pending_run is not None):
                raise StateConflict("unfinished trial must be reconciled before another round trip")
            marker = store.directory / f"round-trip-{context.parent.run_id}-{context.parent.attempt}.json"
            try:
                with marker.open("x") as handle:
                    _ = handle.write(context.parent.model_dump_json())
                    handle.flush()
                    os.fsync(handle.fileno())
            except FileExistsError:
                raise StateConflict("this parent already claimed a round trip; do not replay it") from None
            sync_directory(store.directory)
            snapshots = {Slot.A: context.plan.a, Slot.B: context.plan.b}
            stages: tuple[tuple[str, Slot, TrialOperation | None], ...] = (
                ("bootstrap", Slot.A, TrialOperation.BOOTSTRAP),
                ("A-to-B", Slot.A, None), ("B-to-A", Slot.B, None),
                ("cleanup", Slot.A, TrialOperation.CLEANUP),
            )
            results: list[DeploymentState] = []
            try:
                for name, old, operation in stages:
                    context.verify()
                    with store.lock():
                        if store.read() != previous:
                            raise StateConflict("another controller changed the completed stage")
                        _ = store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4(),
                            old=old, target=old.other(), old_app=snapshots[old], target_app=snapshots[old.other()],
                            image=snapshots[old.other()].image, authority=snapshots[old].authority,
                            parent_run_id=context.parent.run_id, parent_attempt=context.parent.attempt,
                            topology_digest=hashlib.sha256(self.exchange.topology.model_dump_json().encode()).hexdigest(),
                            heartbeat=self.exchange.clock.now()))
                    handoff = WorkerHandoff(self.exchange)
                    final = handoff.run() if operation is None else WorkerTrial(handoff).run(operation)
                    context.verify()
                    if final.old_app is None or final.target_app is None or final.phase is not Phase.COMPLETE:
                        raise DeploymentFailure("trial stage did not prove both process snapshots")
                    if store.read() != final:
                        raise StateConflict("completed trial stage was revoked before archival")
                    self.archive(name, final)
                    snapshots = {final.old: final.old_app, final.target: final.target_app}
                    previous = final
                    results.append(final)
            except (DeploymentFailure, OSError, StateConflict):
                current = store.read()
                if current is not None:
                    self.archive("interrupted", current)
                raise
            return tuple(results)

    def archive(self, name: str, state: DeploymentState) -> None:
        with (self.context.directory / f"{name}.json").open("x") as handle:
            _ = handle.write(state.model_dump_json(indent=2))
            handle.flush()
            os.fsync(handle.fileno())
        sync_directory(self.context.directory)
