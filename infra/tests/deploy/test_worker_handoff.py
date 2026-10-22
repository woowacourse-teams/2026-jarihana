import hashlib
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from typing import final, override
from uuid import uuid4

from bluegreen.models import (
    Action,
    DeploymentState,
    Phase,
    Receipt,
    RunIdentity,
    Slot,
    Topology,
)
from bluegreen.ports import DeploymentFailure, Policy, UnknownResult
from bluegreen.state_store import StateConflict, StateStore
from bluegreen.worker_coordinator import WorkerCoordinator
from bluegreen.worker_handoff import WorkerHandoff
from controller_fakes import FakeApps, FakeClock, fixture


@final
class FinishingApps(FakeApps):
    @override
    def poll(self, run: RunIdentity) -> Receipt | None:
        _, command = self.runs[run.run_id]
        node = self.nodes[command.host.slot]
        if command.action is Action.STATUS and node.worker == "DRAINING":
            finished = self.clock.elapsed >= 1
            self.nodes[command.host.slot] = node.model_copy(update={"in_flight": 0,
                "unresolved": 0 if finished else 1, "worker": "PAUSED" if finished else "DRAINING"})
        return super().poll(run)


@final
class LostActivationApps(FakeApps):
    @override
    def poll(self, run: RunIdentity) -> Receipt | None:
        receipt = super().poll(run)
        if self.runs[run.run_id][1].action is Action.ACTIVATE:
            raise UnknownResult("activation applied but response lost")
        return receipt


@final
class UnhealthyStandbyApps(FakeApps):
    @override
    def poll(self, run: RunIdentity) -> Receipt | None:
        command = self.runs[run.run_id][1]
        if command.action is Action.STATUS and command.host.slot is Slot.B and self.authority.status == "UNASSIGNED":
            self.candidate_healthy = False
        return super().poll(run)


@final
class RevokingApps(FakeApps):
    @override
    def poll(self, run: RunIdentity) -> Receipt | None:
        receipt = super().poll(run)
        if self.runs[run.run_id][1].action is Action.PAUSE:
            current = self.store.read()
            assert current is not None
            _ = self.store.update(current, phase=Phase.ATTENTION, reason="operator revoked handoff")
        return receipt


@dataclass(frozen=True, slots=True)
class HandoffResources:
    topology: Topology
    store: StateStore
    clock: FakeClock


@final
class WorkerHandoffTest(unittest.TestCase):
    def __init__(self, methodName: str = "runTest") -> None:
        super().__init__(methodName)
        self.resources: HandoffResources | None = None

    @override
    def setUp(self) -> None:
        directory = Path(self.enterContext(tempfile.TemporaryDirectory()))
        topology, store, _ = fixture(directory)
        self.resources = HandoffResources(topology, store, FakeClock())

    @property
    def context(self) -> HandoffResources:
        if self.resources is None:
            self.fail("handoff fixture is not initialized")
        return self.resources

    def prepare(self, apps: FakeApps, old: Slot = Slot.A) -> WorkerHandoff:
        target = old.other()
        state = DeploymentState(deployment_id=uuid4(), session_id=uuid4(), old=old, target=target,
            parent_run_id=100, parent_attempt=1,
            topology_digest=hashlib.sha256(self.context.topology.model_dump_json().encode()).hexdigest(),
            old_app=apps.nodes[old].model_copy(update={"authority": apps.authority}),
            target_app=apps.nodes[target].model_copy(update={"authority": apps.authority, "running": True}),
            authority=apps.authority, heartbeat=self.context.clock.now())
        assert state.target_app is not None
        apps.nodes[target] = state.target_app
        _ = self.context.store.create(state)
        return WorkerHandoff(WorkerCoordinator(self.context.store, self.context.topology, apps, self.context.clock),
            Policy(command_seconds=5, worker_drain_seconds=2, poll_seconds=1))

    def test_transfer_and_return_preserve_exclusive_owner_and_both_processes(self) -> None:
        # Given
        apps = FakeApps(self.context.topology, self.context.store, self.context.clock)
        outward = self.prepare(apps)
        # When
        first = outward.run()
        returned = self.prepare(apps, Slot.B).run()
        # Then
        assert first.authority is not None and returned.authority is not None
        self.assertEqual(self.context.topology.b.host_id, first.authority.owner_host)
        self.assertEqual(self.context.topology.a.host_id, returned.authority.owner_host)
        self.assertEqual(Phase.COMPLETE, returned.phase)
        self.assertTrue(all(node.running for node in apps.nodes.values()))
        self.assertEqual("PAUSED", apps.nodes[Slot.B].worker)
        self.assertEqual("ACTIVE", apps.nodes[Slot.A].worker)
        self.assertFalse(any(command.action in (Action.STOP_APP, Action.STOP_EC2, Action.SWITCH) for command in apps.commands))

    def test_release_waits_for_finish_confirmation_after_in_flight_reaches_zero(self) -> None:
        # Given
        apps = FinishingApps(self.context.topology, self.context.store, self.context.clock)
        apps.worker_busy = True
        handoff = self.prepare(apps)
        # When
        final = handoff.run()
        # Then
        actions = [receipt.command.action for receipt in final.receipts]
        pause, release = actions.index(Action.PAUSE), actions.index(Action.RELEASE)
        waiting = final.receipts[pause + 1:release]
        self.assertEqual(2, len(waiting))
        self.assertEqual(0, waiting[0].status.in_flight)
        self.assertEqual(1, waiting[0].status.unresolved)
        self.assertTrue(waiting[1].status.drained())

    def test_drain_timeout_preserves_owner_and_never_releases_or_activates(self) -> None:
        # Given
        apps = FakeApps(self.context.topology, self.context.store, self.context.clock)
        apps.worker_busy = True
        handoff = self.prepare(apps)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = handoff.run()
        final = self.context.store.read()
        assert final is not None
        self.assertEqual(Phase.ATTENTION, final.phase)
        self.assertEqual(self.context.topology.a.host_id, apps.authority.owner_host)
        self.assertFalse(any(command.action in (Action.RELEASE, Action.ACTIVATE) for command in apps.commands))

    def test_unhealthy_standby_after_release_is_not_activated(self) -> None:
        # Given
        apps = UnhealthyStandbyApps(self.context.topology, self.context.store, self.context.clock)
        handoff = self.prepare(apps)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = handoff.run()
        self.assertIsNone(apps.authority.owner_host)
        self.assertFalse(any(command.action is Action.ACTIVATE for command in apps.commands))
        final = self.context.store.read()
        assert final is not None
        self.assertEqual(Phase.ATTENTION, final.phase)

    def test_unknown_activation_keeps_exact_pending_run_without_compensating_commands(self) -> None:
        # Given
        apps = LostActivationApps(self.context.topology, self.context.store, self.context.clock)
        handoff = self.prepare(apps)
        # When / Then
        with self.assertRaises(UnknownResult):
            _ = handoff.run()
        final = self.context.store.read()
        assert final is not None and final.pending is not None
        self.assertEqual(Phase.ATTENTION, final.phase)
        self.assertEqual(Action.ACTIVATE, final.pending.action)
        self.assertIsNotNone(final.pending_run)
        self.assertEqual(Action.ACTIVATE, apps.commands[-1].action)
        self.assertEqual(self.context.topology.b.host_id, apps.authority.owner_host)

    def test_completed_handoff_cannot_be_replayed(self) -> None:
        # Given
        apps = FakeApps(self.context.topology, self.context.store, self.context.clock)
        handoff = self.prepare(apps)
        final = handoff.run()
        issued = len(apps.commands)
        # When / Then
        with self.assertRaises(StateConflict):
            _ = WorkerHandoff(handoff.exchange).run()
        self.assertEqual(final, self.context.store.read())
        self.assertEqual(issued, len(apps.commands))

    def test_operator_revocation_is_preserved_without_release(self) -> None:
        # Given
        apps = RevokingApps(self.context.topology, self.context.store, self.context.clock)
        handoff = self.prepare(apps)
        # When / Then
        with self.assertRaises(StateConflict):
            _ = handoff.run()
        final = self.context.store.read()
        assert final is not None
        self.assertEqual("operator revoked handoff", final.reason)
        self.assertEqual(Action.PAUSE, apps.commands[-1].action)
        self.assertEqual(self.context.topology.a.host_id, apps.authority.owner_host)

    def test_concurrent_handoff_is_rejected_without_changing_journal(self) -> None:
        # Given
        apps = FakeApps(self.context.topology, self.context.store, self.context.clock)
        handoff = self.prepare(apps)
        initial = self.context.store.read()
        # When / Then
        with self.context.store.lock("worker-handoff"), self.assertRaises(StateConflict):
            _ = handoff.run()
        self.assertEqual(initial, self.context.store.read())
        self.assertEqual([], apps.commands)

    def test_production_environment_cannot_use_the_worker_only_rehearsal(self) -> None:
        # Given
        apps = FakeApps(self.context.topology, self.context.store, self.context.clock)
        handoff = self.prepare(apps)
        production = self.context.topology.model_copy(update={"environment": "prod"})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = WorkerHandoff(WorkerCoordinator(self.context.store, production, apps, self.context.clock))
        self.assertEqual(handoff.latest, self.context.store.read())
        self.assertEqual([], apps.commands)
