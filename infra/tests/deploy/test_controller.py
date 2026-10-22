from pathlib import Path
import tempfile
import unittest

from controller_fakes import NEW_IMAGE, fixture
from bluegreen.controller import DeploymentController
from bluegreen.models import DeploymentRequest, Phase, Slot
from bluegreen.ports import Health, Policy
from bluegreen.state_store import StateConflict


class ControllerTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.topology, self.store, self.adapters = fixture(Path(self.directory.name))
        self.controller = DeploymentController(self.store, self.adapters, self.topology)
        self.request = DeploymentRequest(image=NEW_IMAGE, parent_run_id=100, rollback_compatible=True)

    def run_deployment(self):
        return self.controller.run(self.request)

    def test_normal_and_reverse_deployment_keep_nine_hundred_second_observation(self):
        # Given / When
        first = self.run_deployment()
        second = self.controller.run(DeploymentRequest(image=NEW_IMAGE, parent_run_id=101, rollback_compatible=True))
        # Then
        self.assertEqual(Phase.COMPLETE, first.phase)
        self.assertEqual(Phase.COMPLETE, second.phase)
        self.assertEqual([Slot.A, Slot.B], [slot for slot, _ in self.adapters.cloud.stops])
        self.assertGreaterEqual(self.adapters.cloud.stops[0][1], 900)
        self.assertGreaterEqual(self.adapters.cloud.stops[1][1], 1800)
        self.assertEqual(Slot.A, self.adapters.proxy.active())

    def test_candidate_with_wrong_image_never_receives_traffic(self):
        # Given
        self.adapters.apps.bad_digest = True
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([], self.adapters.proxy.switches)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_candidate_with_active_worker_never_receives_traffic(self):
        # Given
        self.adapters.apps.candidate_active = True
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([], self.adapters.proxy.switches)

    def test_unfinished_old_worker_keeps_http_on_old_server_and_both_instances_running(self):
        # Given
        self.adapters.apps.worker_busy = True
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual(Slot.A, self.adapters.proxy.active())
        self.assertTrue(all(self.adapters.cloud.instances.values()))
        self.assertEqual([], self.adapters.cloud.stops)

    def test_old_http_connections_that_do_not_end_block_cleanup(self):
        # Given
        self.adapters.proxy.drain_ok = False
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual(Slot.B, self.adapters.proxy.active())
        self.assertFalse(result.rollback_sealed)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_forced_application_exit_never_stops_the_ec2(self):
        # Given
        self.adapters.apps.forced_exit = True
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertTrue(result.rollback_sealed)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_missing_telemetry_does_not_count_as_healthy_observation(self):
        # Given
        self.adapters.telemetry.failure_at = 0
        self.adapters.telemetry.health_after_failure = Health.UNKNOWN
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_reload_without_actual_route_change_is_not_success(self):
        # Given
        self.adapters.proxy.apply_switch = False
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_lost_dispatch_response_is_correlated_without_dispatching_twice(self):
        # Given
        self.adapters.apps.lost_dispatch = True
        self.adapters.apps.match_count = 0
        # When
        result = self.run_deployment()
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual(1, len(self.adapters.apps.commands))
        self.assertIsNotNone(result.pending)
        with self.assertRaises(StateConflict):
            self.run_deployment()

    def test_queued_child_times_out_with_pending_grant_preserved(self):
        # Given
        self.adapters.apps.queue_forever = True
        # When
        result = self.controller.run(self.request, Policy(command_seconds=10))
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual(1, len(self.adapters.apps.commands))
        self.assertIsNotNone(result.pending_run)
        self.assertEqual([], self.adapters.cloud.stops)
