from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parents[2] / "scripts" / "deploy"))
from bluegreen.models import DeploymentState, Phase
from bluegreen.state_store import StateStore

WATCHDOG = Path(__file__).parents[2] / "scripts/deploy/watchdog.py"


class WatchdogCliTest(unittest.TestCase):
    def test_real_cli_records_stale_heartbeat_as_attention_without_any_external_adapter(self):
        # Given
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = StateStore(root / "state")
            store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4(), phase=Phase.OBSERVING,
                                         heartbeat=datetime.now(timezone.utc) - timedelta(seconds=61)))
            config = root / "watchdog.json"
            config.write_text(json.dumps({"state_directory": str(store.directory), "stale_seconds": 60}))
            # When
            result = subprocess.run((sys.executable, str(WATCHDOG), str(config)), capture_output=True, text=True, check=False)
            # Then
            self.assertEqual(1, result.returncode)
            self.assertEqual("NEEDS_ATTENTION", json.loads(result.stdout)["phase"])
            self.assertEqual(Phase.ATTENTION, store.read().phase)

    def test_invalid_configuration_fails_without_creating_a_state_directory(self):
        # Given
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "watchdog.json"
            state_directory = root / "state"
            config.write_text(json.dumps({"state_directory": str(state_directory), "stale_seconds": float("inf")}))
            # When
            result = subprocess.run((sys.executable, str(WATCHDOG), str(config)), capture_output=True, text=True, check=False)
            # Then
            self.assertEqual(2, result.returncode)
            self.assertFalse(state_directory.exists())
