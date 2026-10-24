import hashlib
import tempfile
import unittest
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from bluegreen.models import (
    Action,
    Authority,
    Command,
    DeploymentState,
    Phase,
    Slot,
    Topology,
)
from bluegreen.ports import DeploymentFailure, Policy, UnknownResult
from bluegreen.state_store import StateStore
from bluegreen.worker_command import expected_authority
from bluegreen.worker_coordinator import WorkerCoordinator
from bluegreen.worker_handoff import WorkerHandoff
from bluegreen.worker_trial import TrialOperation, WorkerTrial
from controller_fakes import FakeApps, FakeClock, fixture
from test_worker_handoff import LostActivationApps


@dataclass(frozen=True, slots=True)
class TrialFixture:
    topology: Topology
    store: StateStore
    clock: FakeClock
    apps: FakeApps

    def trial(self) -> WorkerTrial:
        _ = self.store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4(),
            old=Slot.A, target=Slot.B, parent_run_id=100, parent_attempt=1, authority=self.apps.authority,
            old_app=self.apps.nodes[Slot.A].model_copy(update={"authority": self.apps.authority}),
            target_app=self.apps.nodes[Slot.B].model_copy(update={"authority": self.apps.authority}),
            topology_digest=hashlib.sha256(self.topology.model_dump_json().encode()).hexdigest(), heartbeat=self.clock.now()))
        return WorkerTrial(WorkerHandoff(WorkerCoordinator(self.store, self.topology, self.apps, self.clock),
            Policy(command_seconds=5, worker_drain_seconds=2, poll_seconds=1)))


@contextmanager
def runtime(app_type: type[FakeApps] = FakeApps) -> Generator[TrialFixture, None, None]:
    with tempfile.TemporaryDirectory() as directory:
        topology, store, _ = fixture(Path(directory))
        clock = FakeClock()
        apps = app_type(topology, store, clock)
        apps.authority = Authority()
        for slot in Slot:
            apps.nodes[slot] = apps.nodes[slot].model_copy(update={"worker": "PAUSED", "running": True,
                "authority": apps.authority})
        yield TrialFixture(topology, store, clock, apps)


class WorkerTrialTest(unittest.TestCase):
    def test_bootstrap_cleanup_and_new_bootstrap_keep_both_processes_and_database_history(self) -> None:
        # Given
        with runtime() as live:
            # When
            started = live.trial().run(TrialOperation.BOOTSTRAP)
            stopped = live.trial().run(TrialOperation.CLEANUP)
            restarted = live.trial().run(TrialOperation.BOOTSTRAP)
            # Then
            assert started.authority is not None and stopped.authority is not None and restarted.authority is not None
            self.assertEqual(live.topology.a.host_id, started.authority.owner_host)
            self.assertEqual("COMPLETE", stopped.authority.phase)
            self.assertEqual("UNASSIGNED", stopped.authority.status)
            self.assertIsNone(stopped.authority.owner_host)
            self.assertIsNone(stopped.authority.owner_boot)
            self.assertTrue(stopped.old_app is not None and stopped.old_app.drained())
            self.assertTrue(stopped.target_app is not None and stopped.target_app.drained())
            self.assertEqual(stopped.authority.epoch + 1, restarted.authority.epoch)
            self.assertNotEqual(started.deployment_id, restarted.deployment_id)
            self.assertTrue(all(node.running for node in live.apps.nodes.values()))

    def test_bootstrap_cannot_replace_existing_owner(self) -> None:
        # Given
        with runtime() as live:
            _ = live.trial().run(TrialOperation.BOOTSTRAP)
            authority = live.apps.authority
            trial = live.trial()
            issued = len(live.apps.commands)
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = trial.run(TrialOperation.BOOTSTRAP)
            self.assertEqual(authority, live.apps.authority)
            self.assertEqual(issued, len(live.apps.commands))

    def test_cleanup_timeout_never_releases_or_completes_the_draining_owner(self) -> None:
        # Given
        with runtime() as live:
            _ = live.trial().run(TrialOperation.BOOTSTRAP)
            live.apps.worker_busy = True
            trial = live.trial()
            issued = len(live.apps.commands)
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = trial.run(TrialOperation.CLEANUP)
            commands = live.apps.commands[issued:]
            self.assertFalse(any(command.action in (Action.RELEASE, Action.COMPLETE) for command in commands))
            self.assertEqual(live.topology.a.host_id, live.apps.authority.owner_host)
            state = live.store.read()
            assert state is not None
            self.assertEqual(Phase.ATTENTION, state.phase)

    def test_uncertain_bootstrap_preserves_pending_activation_without_cleanup(self) -> None:
        # Given
        with runtime(LostActivationApps) as live:
            trial = live.trial()
            # When / Then
            with self.assertRaises(UnknownResult):
                _ = trial.run(TrialOperation.BOOTSTRAP)
            final = live.store.read()
            assert final is not None and final.pending is not None
            self.assertEqual(Action.ACTIVATE, final.pending.action)
            self.assertIsNotNone(final.pending_run)
            self.assertEqual(live.topology.a.host_id, live.apps.authority.owner_host)
            self.assertEqual(Action.ACTIVATE, live.apps.commands[-1].action)

    def test_handoff_completion_requires_released_authority_and_local_drain(self) -> None:
        # Given
        with runtime() as live:
            before = live.apps.nodes[Slot.A].model_copy(update={"authority": live.apps.authority.model_copy(update={
                "deployment_id": uuid4(), "phase": "HANDOFF"})})
            assert before.authority.deployment_id is not None
            command = Command(command_id=uuid4(), deployment_id=before.authority.deployment_id,
                parent_run_id=100, parent_attempt=1, phase=Phase.HANDOFF, action=Action.COMPLETE,
                host=live.topology.a, boot_id=before.boot_id, image=before.image,
                deadline=live.clock.now() + timedelta(seconds=5), authority=before.authority)
            # When / Then
            actual = expected_authority(command, before)
            self.assertEqual("COMPLETE", actual.phase)
            self.assertEqual(before.authority.revision + 1, actual.revision)
            for changes in ({"worker": "BLOCKED", "unresolved": 1}, {"in_flight": 1},
                            {"authority": before.authority.model_copy(update={"owner_host": before.host_id,
                                "owner_boot": before.boot_id, "status": "ACTIVE"})}):
                blocked = before.model_copy(update=changes)
                with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                    _ = expected_authority(command.model_copy(update={"authority": blocked.authority}), blocked)
