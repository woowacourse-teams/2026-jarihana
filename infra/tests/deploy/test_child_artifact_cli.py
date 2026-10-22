"""Drive the read-only validator as the process a workflow would execute."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import hashlib
import os
import subprocess
import sys
import tempfile
import unittest
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/deploy"))
from controller_fakes import NEW_IMAGE, fixture
from bluegreen.child_artifacts import serialize_artifact
from bluegreen.models import Action, Command, DeploymentState, Phase, Receipt, RunIdentity, Slot


class ChildArtifactCliTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        topology, _, adapters = fixture(self.base / "fixture")
        run = RunIdentity(run_id=10, attempt=1, workflow=topology.control.workflow, ref=topology.control.ref,
                          sha=topology.control.sha, event="workflow_dispatch")
        status = adapters.apps.nodes[Slot.A]
        command = Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=100, parent_attempt=1,
                          phase=Phase.PREPARING, action=Action.STATUS, host=topology.a, boot_id=status.boot_id,
                          image=NEW_IMAGE, deadline=datetime.now(timezone.utc) + timedelta(minutes=1), authority=status.authority)
        state = DeploymentState(deployment_id=command.deployment_id, session_id=uuid4(), parent_run_id=100,
                                topology_digest=hashlib.sha256(topology.model_dump_json().encode()).hexdigest(),
                                parent_attempt=1, pending=command, pending_run=run)
        receipt = Receipt(schema_version=1, command=command, run=run, success=True, status=status)
        self.paths = (self.base / "topology.json", self.base / "state.json", self.base / "artifact.json")
        self.paths[0].write_text(topology.model_dump_json())
        self.paths[1].write_text(state.model_dump_json())
        self.paths[2].write_bytes(serialize_artifact(receipt, None))
        self.script = Path(__file__).resolve().parents[2] / "scripts/deploy/verify-child-artifact.py"

    def invoke(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run((sys.executable, str(self.script), *(str(p) for p in self.paths)),
                              cwd=self.base, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                              capture_output=True, text=True, timeout=10, check=False)

    def test_valid_result_succeeds_without_changing_the_journal(self):
        # Given
        original = self.paths[1].read_bytes()
        # When
        result = self.invoke()
        # Then
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertTrue(json.loads(result.stdout)["validated"])
        self.assertEqual(original, self.paths[1].read_bytes())

    def test_wrong_run_fails_the_process(self):
        # Given
        raw = json.loads(self.paths[2].read_bytes())
        raw["receipt"]["run"]["run_id"] = 99
        self.paths[2].write_text(json.dumps(raw))
        # When
        result = self.invoke()
        # Then
        self.assertEqual(1, result.returncode)
        self.assertEqual("", result.stdout)

    def test_invalid_input_is_not_echoed_to_workflow_logs(self):
        # Given
        self.paths[2].write_text('{"secret":"private-machine-token"}')
        # When
        result = self.invoke()
        # Then
        self.assertEqual(1, result.returncode)
        self.assertNotIn("private-machine-token", result.stdout + result.stderr)
