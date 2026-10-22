"""A success flag cannot replace exact-run identity and shutdown evidence."""
from datetime import timedelta
from pathlib import Path
import json
import hashlib
import sys
import tempfile
import unittest
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/deploy"))
from controller_fakes import NEW_IMAGE, fixture
from bluegreen.child_artifacts import ArtifactExpectation, accept_artifact, serialize_artifact
from bluegreen.docker_shutdown import ContainerPin, ShutdownEvidence
from bluegreen.models import Action, Command, DeploymentState, Phase, Receipt, RunIdentity, Slot
from bluegreen.ports import DeploymentFailure


class ChildArtifactTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        topology, _, adapters = fixture(Path(self.directory.name))
        self.clock = adapters.clock
        self.status = adapters.apps.nodes[Slot.A].model_copy(update={
            "running": False, "normal_exit": True, "worker": "PAUSED",
            "authority": adapters.apps.nodes[Slot.A].authority.model_copy(update={"owner_host": None, "owner_boot": None})})
        run = RunIdentity(run_id=11, attempt=1, workflow=topology.control.workflow, ref=topology.control.ref,
                          sha=topology.control.sha, event="workflow_dispatch")
        command = Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=100, parent_attempt=1,
                          phase=Phase.SEALED, action=Action.STOP_APP, host=topology.a, boot_id=self.status.boot_id,
                          image=NEW_IMAGE, deadline=self.clock.now() + timedelta(seconds=60), authority=self.status.authority)
        self.receipt = Receipt(schema_version=1, command=command, run=run, success=True, status=self.status)
        self.state = DeploymentState(deployment_id=command.deployment_id, session_id=uuid4(), phase=Phase.SEALED,
                                     topology_digest=hashlib.sha256(topology.model_dump_json().encode()).hexdigest(),
                                     rollback_sealed=True, old=Slot.A, target=Slot.B, parent_run_id=100, parent_attempt=1,
                                     pending=command, pending_run=run)
        self.expected = ArtifactExpectation(self.state, topology, self.clock.now())
        self.proof = ShutdownEvidence(command_id=command.command_id, boot_id=self.status.boot_id,
                                      container=ContainerPin(container_id="a" * 64, image_id="sha256:" + "b" * 64,
                                                             started_at=self.clock.now() - timedelta(seconds=10), restart_count=0),
                                      signal="SIGTERM", stop_cli_exit=0, exit_code=143, finished_at=self.clock.now())

    def test_valid_shutdown_artifact_returns_exact_receipt(self):
        # Given
        payload = serialize_artifact(self.receipt, self.proof)
        # When
        result = accept_artifact(payload, self.expected)
        # Then
        self.assertEqual(self.receipt, result)

    def test_success_without_shutdown_proof_is_rejected(self):
        # Given
        payload = serialize_artifact(self.receipt, None)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            accept_artifact(payload, self.expected)

    def test_another_command_boot_or_future_proof_is_rejected(self):
        # Given / When / Then
        for changes in ({"command_id": uuid4()}, {"boot_id": uuid4()},
                        {"finished_at": self.clock.now() + timedelta(minutes=1)}):
            payload = serialize_artifact(self.receipt, self.proof.model_copy(update=changes))
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                accept_artifact(payload, self.expected)

    def test_other_run_or_failed_child_cannot_supply_success(self):
        # Given / When / Then
        for changes in ({"run": self.receipt.run.model_copy(update={"run_id": 12})}, {"success": False}):
            payload = serialize_artifact(self.receipt.model_copy(update=changes), self.proof)
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                accept_artifact(payload, self.expected)

    def test_boolean_schema_and_string_flags_are_rejected(self):
        # Given
        original = json.loads(serialize_artifact(self.receipt, self.proof))
        for location, key, value in [((), "schema_version", True), (("receipt",), "schema_version", True),
                                      (("receipt",), "success", "true"),
                                      (("receipt", "status"), "normal_exit", "true"),
                                      (("shutdown",), "stop_cli_exit", False)]:
            payload = json.loads(json.dumps(original))
            target = payload
            for component in location:
                target = target[component]
            target[key] = value
            # When / Then
            with self.subTest(key=key, value=value), self.assertRaises(DeploymentFailure):
                accept_artifact(json.dumps(payload).encode(), self.expected)

    def test_revoked_or_expired_grant_rejects_completed_artifact(self):
        # Given
        payload = serialize_artifact(self.receipt, self.proof)
        # When / Then
        for expected in [ArtifactExpectation(self.state.model_copy(update={"phase": Phase.ATTENTION}),
                                             self.expected.topology, self.clock.now()),
                         ArtifactExpectation(self.state, self.expected.topology, self.receipt.command.deadline)]:
            with self.assertRaises(DeploymentFailure):
                accept_artifact(payload, expected)

    def test_large_or_malformed_input_is_rejected_without_echoing_input(self):
        # Given / When / Then
        for payload in [b"x" * 65537, b'{"secret": "private-machine-token"}']:
            with self.assertRaises(DeploymentFailure) as raised:
                accept_artifact(payload, self.expected)
            self.assertNotIn("private-machine-token", str(raised.exception))

    def test_running_or_undrained_app_cannot_report_successful_shutdown(self):
        # Given / When / Then
        for changes in ({"running": True}, {"normal_exit": False}, {"http_in_flight": 1},
                        {"background_drained": False}, {"worker": "ACTIVE"},
                        {"authority": self.status.authority.model_copy(update={"owner_host": self.status.host_id})}):
            receipt = self.receipt.model_copy(update={"status": self.status.model_copy(update=changes)})
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                accept_artifact(serialize_artifact(receipt, self.proof), self.expected)

    def test_missing_measurements_or_forced_exit_cannot_be_assumed_successful(self):
        # Given / When / Then
        for field in ["normal_exit", "http_in_flight", "background_drained"]:
            raw = json.loads(serialize_artifact(self.receipt, self.proof))
            del raw["receipt"]["status"][field]
            with self.subTest(field=field), self.assertRaises(DeploymentFailure):
                accept_artifact(json.dumps(raw).encode(), self.expected)
        with self.assertRaises(DeploymentFailure):
            accept_artifact(serialize_artifact(self.receipt, self.proof.model_copy(update={"exit_code": 137})), self.expected)

    def test_coordinator_operation_cannot_be_returned_by_application_child(self):
        # Given
        command = self.receipt.command.model_copy(update={"action": Action.SWITCH})
        receipt = self.receipt.model_copy(update={"command": command, "status": self.status.model_copy(update={"normal_exit": False})})
        state = self.state.model_copy(update={"pending": command})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            accept_artifact(serialize_artifact(receipt, None), ArtifactExpectation(state, self.expected.topology, self.clock.now()))
