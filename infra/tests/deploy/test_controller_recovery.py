from pathlib import Path
from datetime import timedelta
import tempfile
import unittest
from unittest.mock import patch

from controller_fakes import NEW_IMAGE, fixture
from bluegreen.controller import DeploymentController
from bluegreen.github_operations import authorize
from bluegreen.models import DeploymentRequest, Phase, Slot
from bluegreen.ports import DeploymentFailure, Policy
from bluegreen.recovery import rollback
from bluegreen.session import Session
from bluegreen.watchdog import inspect


class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.topology, self.store, self.adapters = fixture(Path(self.directory.name))
        self.controller = DeploymentController(self.store, self.adapters, self.topology)
        self.request = DeploymentRequest(image=NEW_IMAGE, parent_run_id=100, rollback_compatible=True)

    def test_failure_during_observation_restores_http_and_worker_but_records_failed_deployment(self):
        # Given
        self.adapters.telemetry.failure_at = 20
        # When
        result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ROLLED_BACK, result.phase)
        self.assertTrue(result.http_recovered)
        self.assertTrue(result.worker_recovered)
        self.assertEqual(Slot.A, self.adapters.proxy.active())
        self.assertEqual(self.topology.a.host_id, self.adapters.apps.authority.owner_host)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_unreachable_candidate_worker_allows_http_recovery_but_never_activates_old_worker(self):
        # Given
        self.adapters.telemetry.failure_at = 20
        self.adapters.apps.unreachable_after_rollback = True
        # When
        result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertTrue(result.http_recovered)
        self.assertFalse(result.worker_recovered)
        self.assertEqual("PAUSED", self.adapters.apps.nodes[Slot.A].worker)
        self.assertEqual(self.topology.b.host_id, self.adapters.apps.authority.owner_host)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_unhealthy_old_application_does_not_cause_repeated_switching(self):
        # Given
        self.adapters.telemetry.failure_at = 20
        original = self.adapters.telemetry.health
        def health(host):
            if self.adapters.clock.elapsed >= 20:
                self.adapters.apps.old_healthy = False
            return original(host)
        # When
        with patch.object(self.adapters.telemetry, "health", side_effect=health):
            result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([Slot.B], self.adapters.proxy.switches)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_sealed_cleanup_rejects_a_late_automatic_rollback(self):
        # Given
        self.controller.run(self.request)
        session = Session(self.store, self.topology, self.adapters)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            rollback(session, Policy())
        self.assertEqual(Slot.B, self.adapters.proxy.active())

    def test_watchdog_fences_queued_child_after_controller_interrupt(self):
        # Given
        with patch.object(self.adapters.apps, "poll", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.controller.run(self.request)
        state = self.store.read()
        command = state.pending
        # When
        stale = inspect(self.store, self.adapters.clock.now() + timedelta(seconds=61))
        # Then
        self.assertEqual(Phase.ATTENTION, stale.phase)
        with self.assertRaises(DeploymentFailure):
            authorize(command, stale, self.adapters.clock.now())
        self.assertEqual([], self.adapters.cloud.stops)
        reconciled = self.controller.reconcile()
        self.assertEqual(Phase.ATTENTION, reconciled.phase)
        self.assertIsNotNone(reconciled.pending)
