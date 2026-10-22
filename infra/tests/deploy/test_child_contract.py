from datetime import timedelta
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from controller_fakes import NEW_IMAGE, fixture
from bluegreen.controller import DeploymentController
from bluegreen.github_operations import authorize, validate_receipt
from bluegreen.models import DeploymentRequest, Phase
from bluegreen.ports import DeploymentFailure


class ChildContractTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.topology, self.store, self.adapters = fixture(Path(self.directory.name))
        self.controller = DeploymentController(self.store, self.adapters, self.topology)
        self.request = DeploymentRequest(image=NEW_IMAGE, parent_run_id=100, rollback_compatible=True)

    def test_control_tag_movement_rejects_child_before_any_mutation(self):
        # Given
        original = self.adapters.apps.dispatch
        def dispatch(command):
            return original(command).model_copy(update={"sha": "f" * 40})
        # When
        with patch.object(self.adapters.apps, "dispatch", side_effect=dispatch):
            result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual({}, self.adapters.apps.results)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_child_result_from_other_attempt_is_not_accepted(self):
        # Given
        original = self.adapters.apps.poll
        def poll(run):
            receipt = original(run)
            return receipt.model_copy(update={"run": run.model_copy(update={"attempt": 2})})
        # When
        with patch.object(self.adapters.apps, "poll", side_effect=poll):
            result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertIsNotNone(result.pending)
        self.assertEqual([], self.adapters.cloud.stops)

    def test_expired_child_grant_is_rejected_even_if_parent_is_still_running(self):
        # Given
        self.adapters.apps.queue_forever = True
        self.controller.run(self.request)
        state = self.store.read()
        command = state.pending
        live = state.model_copy(update={"phase": command.phase})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            authorize(command, live, command.deadline + timedelta(seconds=1))

    def test_duplicate_dispatch_matches_require_reconciliation_instead_of_selecting_latest(self):
        # Given
        self.adapters.apps.lost_dispatch = True
        self.adapters.apps.match_count = 2
        # When
        result = self.controller.run(self.request)
        # Then
        self.assertEqual(Phase.ATTENTION, result.phase)
        self.assertEqual(1, len(self.adapters.apps.commands))
        self.assertEqual([], self.adapters.cloud.stops)
