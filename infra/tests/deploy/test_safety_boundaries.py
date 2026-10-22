from datetime import timedelta
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pydantic import ValidationError
from controller_fakes import NEW_IMAGE, fixture
from bluegreen.controller import DeploymentController
from bluegreen.github_operations import authorize_local_process
from bluegreen.models import DeploymentRequest, Phase, Receipt
from bluegreen.ports import DeploymentFailure, Policy
from bluegreen.state_store import StateConflict


class SafetyBoundariesTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.topology, self.store, self.adapters = fixture(Path(self.directory.name))
        self.controller = DeploymentController(self.store, self.adapters, self.topology)
        self.request = DeploymentRequest(image=NEW_IMAGE, parent_run_id=100, rollback_compatible=True)

    def test_missing_artifact_schema_cannot_default_to_success(self):
        # Given
        result = self.controller.run(self.request)
        raw = result.receipts[0].model_dump(mode="json")
        del raw["schema_version"]
        # When / Then
        with self.assertRaises(ValidationError):
            Receipt.model_validate(raw)

    def test_missing_worker_count_cannot_default_to_zero(self):
        # Given
        result = self.controller.run(self.request)
        raw = result.receipts[0].model_dump(mode="json")
        del raw["status"]["in_flight"]
        # When / Then
        with self.assertRaises(ValidationError):
            Receipt.model_validate(raw)

    def test_different_local_instance_is_rejected_before_its_command_is_applied(self):
        # Given
        self.adapters.apps.queue_forever = True
        result = self.controller.run(self.request)
        command = result.pending
        actual = self.adapters.apps.nodes[command.host.slot].model_copy(update={"instance_id": "i-cccccccc"})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            authorize_local_process(command, actual)
        self.assertEqual({}, self.adapters.apps.results)

    def test_wall_clock_jump_cannot_shorten_the_observation(self):
        # Given
        original = self.adapters.telemetry.health
        def health(host):
            if self.adapters.clock.elapsed >= 20:
                self.adapters.clock.wall_shift = 3600
            return original(host)
        # When
        with patch.object(self.adapters.telemetry, "health", side_effect=health):
            result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_corrupt_journal_prevents_all_child_and_cloud_operations(self):
        # Given
        self.store.path.write_text("{broken")
        # When / Then
        with self.assertRaises(ValidationError):
            self.controller.run(self.request)
        self.assertEqual([], self.adapters.apps.commands)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_another_controller_cannot_enter_while_the_first_holds_the_file_lock(self):
        # Given
        with self.store.lock():
            # When / Then
            with self.assertRaises(StateConflict):
                self.controller.run(self.request)
        self.assertEqual([], self.adapters.apps.commands)

    def test_missing_http_activity_measurement_is_not_zero(self):
        # Given
        original = self.adapters.apps._apply
        def apply(command):
            return original(command).model_copy(update={"http_in_flight": None})
        # When
        with patch.object(self.adapters.apps, "_apply", side_effect=apply):
            result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_insufficient_observation_and_recovery_budget_never_switches_traffic(self):
        # Given / When
        result = self.controller.run(self.request, Policy(total_seconds=1600))
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual([], self.adapters.proxy.switches)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_invalid_structured_result_does_not_copy_untrusted_secret_fields_into_the_journal(self):
        # Given
        secret = "untrusted-artifact-secret-fixture"
        with self.assertRaises(ValidationError) as rejected:
            Receipt.model_validate({"token": secret})
        # When
        with patch.object(self.adapters.apps, "dispatch", side_effect=rejected.exception):
            result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertNotIn(secret, result.model_dump_json())
        self.assertEqual([], self.adapters.cloud.stops)
