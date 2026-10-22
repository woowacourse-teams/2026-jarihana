"""The exact queued child needs a fresh grant and the correct local machine."""
from datetime import timedelta
from pathlib import Path
import hashlib
import sys
import tempfile
import unittest
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/deploy"))
from controller_fakes import NEW_IMAGE, fixture
from bluegreen.child_execution import ChildContext, ChildGate, MachineIdentity
from bluegreen.models import Action, Command, DeploymentState, Phase, RunIdentity, Slot
from bluegreen.ports import DeploymentFailure


class ChildExecutionTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.topology, self.store, adapters = fixture(Path(self.directory.name))
        self.clock = adapters.clock
        self.actual = adapters.apps.nodes[Slot.A]
        self.run = RunIdentity(run_id=11, attempt=1, workflow=self.topology.control.workflow,
                               ref=self.topology.control.ref, sha=self.topology.control.sha, event="workflow_dispatch")
        self.command = Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=100, parent_attempt=1,
                               phase=Phase.PREPARING, action=Action.STATUS, host=self.topology.a,
                               boot_id=self.actual.boot_id, image=NEW_IMAGE,
                               deadline=self.clock.now() + timedelta(seconds=60), authority=self.actual.authority)
        self.state = self.store.create(DeploymentState(deployment_id=self.command.deployment_id, session_id=uuid4(),
                                                      parent_run_id=100, parent_attempt=1, image=NEW_IMAGE,
                                                      topology_digest=hashlib.sha256(self.topology.model_dump_json().encode()).hexdigest(),
                                                      pending=self.command, pending_run=self.run))
        self.machine = MachineIdentity(environment=self.topology.environment, host_id=self.topology.a.host_id,
                                        instance_id=self.topology.a.instance_id)
        self.context = ChildContext(self.topology, self.run, self.machine)
        self.gate = ChildGate(self.context, self.store, self.clock)

    def test_matching_run_and_process_are_authorized(self):
        # Given / When
        self.gate.check(self.command, self.actual)
        # Then
        self.assertEqual(self.state, self.gate.state(self.command))

    def test_watchdog_revocation_is_seen_on_next_check(self):
        # Given
        self.gate.check(self.command, self.actual)
        self.store.update(self.state, phase=Phase.ATTENTION)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.gate.check(self.command, self.actual)

    def test_wrong_machine_and_application_environment_are_rejected(self):
        # Given / When / Then
        for changes in ({"instance_id": self.topology.b.instance_id}, {"environment": "prod"},
                        {"host_id": "other"}, {"instance_id": self.topology.coordinator_instance_id}):
            context = ChildContext(self.topology, self.run, self.machine.model_copy(update=changes))
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                ChildGate(context, self.store, self.clock).check(self.command, self.actual)
        with self.assertRaises(DeploymentFailure):
            self.gate.check(self.command, self.actual.model_copy(update={"environment": "other"}))

    def test_other_run_rerun_control_sha_or_parent_cannot_use_grant(self):
        # Given / When / Then
        for changes in ({"run_id": 12}, {"attempt": 2}, {"sha": "f" * 40}, {"event": "push"}):
            context = ChildContext(self.topology, self.run.model_copy(update=changes), self.machine)
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                ChildGate(context, self.store, self.clock).check(self.command, self.actual)
        self.store.save(self.state, self.state.model_copy(update={"revision": 1, "parent_attempt": 2}))
        with self.assertRaises(DeploymentFailure):
            self.gate.check(self.command, self.actual)

    def test_missing_process_is_allowed_only_for_prepare(self):
        # Given / When / Then
        with self.assertRaises(DeploymentFailure):
            self.gate.check(self.command, None)
        prepared = self.command.model_copy(update={"action": Action.PREPARE, "boot_id": None, "host": self.topology.b})
        self.store.save(self.state, self.state.model_copy(update={"revision": 1, "pending": prepared}))
        context = ChildContext(self.topology, self.run, self.machine.model_copy(update={
            "host_id": self.topology.b.host_id, "instance_id": self.topology.b.instance_id}))
        ChildGate(context, self.store, self.clock).check(prepared, None)

    def test_expired_or_changed_command_is_rejected(self):
        # Given / When / Then
        with self.assertRaises(DeploymentFailure):
            self.gate.check(self.command.model_copy(update={"command_id": uuid4()}), self.actual)
        self.clock.sleep(60)
        with self.assertRaises(DeploymentFailure):
            self.gate.check(self.command, self.actual)

    def test_preparing_active_slot_or_unpinned_mutation_is_rejected(self):
        # Given
        previous = self.state
        for changes in ({"action": Action.PREPARE, "boot_id": None},
                        {"action": Action.BEGIN, "boot_id": None}, {"action": Action.START_EC2}):
            command = self.command.model_copy(update=changes)
            previous = self.store.save(previous, previous.model_copy(update={
                "revision": previous.revision + 1, "pending": command}))
            # When / Then
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                self.gate.check(command, self.actual)

    def test_changed_topology_cannot_reuse_a_queued_grant(self):
        # Given
        self.store.save(self.state, self.state.model_copy(update={"revision": 1, "topology_digest": "f" * 64}))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.gate.check(self.command, self.actual)
