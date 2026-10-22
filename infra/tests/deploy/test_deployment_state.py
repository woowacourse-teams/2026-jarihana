"""Durable controller state is the fence for repeated and interrupted deployments."""
from pathlib import Path
import sys
import tempfile
import unittest
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parents[2] / "scripts" / "deploy"))

from bluegreen.models import DeploymentState, Phase
from bluegreen.state_store import StateStore, StateConflict


class DeploymentStateTest(unittest.TestCase):
    def test_stale_revision_cannot_overwrite_another_controller_result(self):
        # Given
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory))
            first = store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4()))
            # When
            changed = store.update(first, phase=Phase.ATTENTION, reason="watchdog_stale")
            # Then
            with self.assertRaises(StateConflict):
                store.update(first, phase=Phase.COMPLETE)
            self.assertEqual(changed, store.read())

    def test_unfinished_deployment_cannot_be_replaced(self):
        # Given
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory))
            store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4()))
            # When / Then
            with self.assertRaises(StateConflict):
                store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4()))
