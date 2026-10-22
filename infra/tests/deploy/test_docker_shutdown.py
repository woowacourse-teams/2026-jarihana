"""Stop only a pinned, drained old process; missing evidence must hold cleanup."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from uuid import uuid4
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/deploy"))
from controller_fakes import NEW_IMAGE, fixture
from bluegreen.docker_shutdown import ContainerSnapshot, DockerStopper, ShutdownPolicy, StopRuntime
from bluegreen.github_operations import authorize
from bluegreen.models import Action, Command, DeploymentState, Phase, Slot
from bluegreen.ports import DeploymentFailure


class FakeStopCall:
    def poll(self) -> int | None:
        return 0


class FakeDocker:
    """Explicit mutable process simulation with a signal ledger."""
    def __init__(self):
        self.current = ContainerSnapshot(container_id="a" * 64, image_id="sha256:" + "b" * 64,
                                         started_at="2026-01-01T00:00:00Z", restart_count=0,
                                         running=True, paused=False, restarting=False, dead=False,
                                         oom_killed=False, auto_remove=False, exit_code=0,
                                         finished_at="0001-01-01T00:00:00Z")
        self.signals: list[str] = []
        self.hang = False
        self.exit_code = 143
        self.oom = False
        self.restart = False

    def inspect(self, container: str) -> ContainerSnapshot:
        return self.current

    @contextmanager
    def begin_stop(self, container: str):
        self.signals.append(container)
        if not self.hang:
            self.current = self.current.model_copy(update={
                "running": False, "exit_code": self.exit_code, "oom_killed": self.oom,
                "restart_count": int(self.restart), "finished_at": datetime(2026, 1, 1, 0, 0, 2, tzinfo=timezone.utc)})
        yield FakeStopCall()


class StoreGrant:
    def __init__(self, store, clock):
        self.store, self.clock = store, clock
        self.revoke = False

    def check(self, command, actual) -> None:
        state = self.store.read()
        if self.revoke:
            state = state.model_copy(update={"phase": Phase.ATTENTION})
        authorize(command, state, self.clock.now())


class DockerShutdownTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        topology, self.store, adapters = fixture(Path(self.directory.name))
        old = adapters.apps.nodes[Slot.A]
        self.actual = old.model_copy(update={"worker": "PAUSED", "authority": old.authority.model_copy(
            update={"owner_host": topology.b.host_id})})
        deployment = uuid4()
        self.command = Command(command_id=uuid4(), deployment_id=deployment, parent_run_id=1,
                               parent_attempt=1, phase=Phase.SEALED, action=Action.STOP_APP,
                               host=topology.a, boot_id=self.actual.boot_id, image=NEW_IMAGE,
                               deadline=adapters.clock.now() + timedelta(seconds=60), authority=self.actual.authority)
        self.store.create(DeploymentState(deployment_id=deployment, session_id=uuid4(), old=Slot.A,
                                           target=Slot.B, phase=Phase.SEALED, rollback_sealed=True,
                                           old_app=self.actual, pending=self.command))
        self.docker = FakeDocker()
        self.grant = StoreGrant(self.store, adapters.clock)
        self.stopper = DockerStopper(StopRuntime(self.docker, adapters.clock, self.grant))
        self.pin = self.docker.current.pin()

    def test_sigterm_requires_matching_container_and_clean_exit(self):
        # Given / When
        result = self.stopper.stop(self.command, self.actual, self.pin)
        # Then
        self.assertFalse(result.status.running)
        self.assertTrue(result.status.normal_exit)
        self.assertEqual(143, result.evidence.exit_code)
        self.assertEqual(self.actual.boot_id, result.evidence.boot_id)
        self.assertEqual([self.pin.container_id], self.docker.signals)

    def test_oom_sigkill_and_restart_are_not_normal_exit(self):
        # Given
        original = self.docker.current
        for code, oom, restart in [(137, False, False), (143, True, False), (143, False, True), (1, False, False)]:
            with self.subTest(code=code, oom=oom, restart=restart):
                self.docker.current = original
                self.docker.exit_code, self.docker.oom, self.docker.restart = code, oom, restart
                # When / Then
                with self.assertRaises(DeploymentFailure):
                    self.stopper.stop(self.command, self.actual, self.pin)

    def test_pending_http_or_active_worker_prevents_signal(self):
        # Given
        for changed in ({"http_in_flight": 1}, {"http_in_flight": None}, {"worker": "ACTIVE"},
                        {"background_drained": False}, {"unresolved": 1}):
            # When / Then
            with self.subTest(changed=changed), self.assertRaises(DeploymentFailure):
                self.stopper.stop(self.command, self.actual.model_copy(update=changed), self.pin)
        self.assertEqual([], self.docker.signals)

    def test_replaced_process_or_revoked_grant_prevents_signal(self):
        # Given
        self.docker.current = self.docker.current.model_copy(update={"started_at": "2026-01-01T00:00:01Z"})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.stopper.stop(self.command, self.actual, self.pin)
        self.assertEqual([], self.docker.signals)
        # Given
        self.docker.current = self.docker.current.model_copy(update={"started_at": self.pin.started_at})
        self.grant.revoke = True
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.stopper.stop(self.command, self.actual, self.pin)
        self.assertEqual([], self.docker.signals)

    def test_stop_timeout_does_not_send_another_or_forced_signal(self):
        # Given
        self.docker.hang = True
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.stopper.stop(self.command, self.actual, self.pin)
        self.assertTrue(self.docker.current.running)
        self.assertEqual([self.pin.container_id], self.docker.signals)

    def test_other_boot_or_autoremoval_prevents_stop(self):
        # Given / When / Then
        with self.assertRaises(DeploymentFailure):
            self.stopper.stop(self.command, self.actual.model_copy(update={"boot_id": uuid4()}), self.pin)
        self.docker.current = self.docker.current.model_copy(update={"auto_remove": True})
        with self.assertRaises(DeploymentFailure):
            self.stopper.stop(self.command, self.actual, self.pin)
        self.assertEqual([], self.docker.signals)

    def test_revoked_grant_after_signal_does_not_produce_success(self):
        # Given
        original = self.docker.begin_stop
        @contextmanager
        def revoked(container):
            with original(container) as call:
                self.grant.revoke = True
                yield call
        # When / Then
        with patch.object(self.docker, "begin_stop", side_effect=revoked), self.assertRaises(DeploymentFailure):
            self.stopper.stop(self.command, self.actual, self.pin)
        self.assertEqual([self.pin.container_id], self.docker.signals)

    def test_nonzero_stop_cli_result_does_not_produce_success(self):
        # Given / When / Then
        with patch.object(FakeStopCall, "poll", return_value=1), self.assertRaises(DeploymentFailure):
            self.stopper.stop(self.command, self.actual, self.pin)
        self.assertEqual([self.pin.container_id], self.docker.signals)

    def test_invalid_wait_policy_is_rejected(self):
        # Given / When / Then
        for seconds in (0, -1, float("nan"), float("inf")):
            with self.subTest(seconds=seconds), self.assertRaises(DeploymentFailure):
                ShutdownPolicy(wait_seconds=seconds)
