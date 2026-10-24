import json
import subprocess
import sys
import unittest
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from ipaddress import IPv4Address
from pathlib import Path
from uuid import uuid4

from bluegreen.child_execution import MachineIdentity
from bluegreen.coordinator_settings import CoordinatorSettings
from bluegreen.docker_shutdown import ContainerPin
from bluegreen.models import Action, Authority, Command, Phase, RunIdentity, Slot
from bluegreen.ports import DeploymentFailure
from bluegreen.worker_profile import DB_URL, PROFILE_FORMAT, verify_profile
from bluegreen.worker_settings import (
    WorkerSettings,
    authorize_worker_machine,
    worker_route,
)
from pydantic import ValidationError


def settings(slot: Slot = Slot.B) -> WorkerSettings:
    base = CoordinatorSettings.model_validate_json((Path(__file__).parents[2]
        / "deploy/status-child/coordinator.example.json").read_bytes())
    control = base.topology.control.model_copy(update={"workflow": "backend-bluegreen-worker-child.yml",
        "ref": "refs/tags/bluegreen-worker-rehearsal-test", "sha": "a" * 40})
    return WorkerSettings(repository=base.repository, topology=base.topology.model_copy(update={"control": control}),
        coordinator_address=IPv4Address("10.0.3.51"), journal_key=Path("/etc/jarihana-deploy/worker-grant-key"),
        known_hosts=Path("/etc/jarihana-deploy/worker-known-hosts"),
        worker_token_file=Path("/etc/jarihana-deploy/worker-control-token"),
        local_slot=slot, management_port=8081 if slot is Slot.A else 18081,
        expected_boot=uuid4(), expected_image=base.expected_image, allowed_actions=(Action.PAUSE,),
        container=ContainerPin(container_id="f" * 64, image_id=base.expected_image,
                               started_at=datetime.now(UTC), restart_count=0))


@dataclass(frozen=True, slots=True)
class ProfileRunner:
    value: WorkerSettings
    body: str

    def run(self, arguments: tuple[str, ...]) -> str:
        if arguments != ("docker", "inspect", "--format", PROFILE_FORMAT, "--", self.value.container.container_id):
            raise DeploymentFailure("profile attempted an unexpected process command")
        return self.body


def profile_body(value: WorkerSettings, changes: Mapping[str, str] | None = None) -> str:
    environment = {"DB_URL": DB_URL, "APP_VERSION": value.expected_image, "PUSH_ENABLED": "false",
        "PUSH_WORKER_ENABLED": "false", "PUSH_WORKER_CONTROL_ENABLED": "true",
        "PUSH_WORKER_ENVIRONMENT": value.topology.environment, "PUSH_WORKER_HOST_ID": value.host.host_id}
    environment.update(changes or {})
    return json.dumps({**value.container.model_dump(mode="json"), "running": True,
                      "environment": [f"{name}={entry}" for name, entry in environment.items()]})


class WorkerSettingsTest(unittest.TestCase):
    def test_a_command_and_profile_use_the_a_machine(self) -> None:
        value = settings(Slot.A)
        command = self.command(value)
        run = self.run_identity(value)

        worker_route(value, command, run, value.repository.full_name, str(command.deployment_id), str(command.command_id), "A")
        verify_profile(value, ProfileRunner(value, profile_body(value)))
        authorize_worker_machine(value, MachineIdentity(environment=value.topology.environment,
            host_id=value.host.host_id, instance_id=value.host.instance_id))

        self.assertEqual(value.topology.a, command.host)

    def test_other_slot_command_cannot_execute_on_the_local_machine(self) -> None:
        for slot in Slot:
            value = settings(slot)
            command = self.command(value).model_copy(update={"host": value.topology.host(slot.other())})

            with self.subTest(slot=slot), self.assertRaises(DeploymentFailure):
                worker_route(value, command, self.run_identity(value), value.repository.full_name,
                    str(command.deployment_id), str(command.command_id), slot.value)

    def test_other_instance_cannot_impersonate_the_a_runner(self) -> None:
        value = settings(Slot.A)
        machine = MachineIdentity(environment=value.topology.environment, host_id=value.host.host_id,
            instance_id=value.topology.b.instance_id)

        with self.assertRaises(DeploymentFailure):
            authorize_worker_machine(value, machine)

    def test_a_profile_cannot_reuse_the_b_host_identity(self) -> None:
        value = settings(Slot.A)

        with self.assertRaises(DeploymentFailure):
            verify_profile(value, ProfileRunner(value, profile_body(value, {"PUSH_WORKER_HOST_ID": value.topology.b.host_id})))

    def test_slot_cannot_use_the_other_management_port(self) -> None:
        for slot in Slot:
            value = settings(slot)

            with self.subTest(slot=slot), self.assertRaises(DeploymentFailure):
                _ = WorkerSettings.model_validate({**value.model_dump(), "management_port": 18081 if slot is Slot.A else 8081})

    def test_exact_release_command_and_process_are_accepted(self) -> None:
        value = settings()
        command = self.command(value)
        run = self.run_identity(value)

        worker_route(value, command, run, value.repository.full_name, str(command.deployment_id), str(command.command_id), "B")

        self.assertEqual((Action.PAUSE,), value.allowed_actions)

    def test_missing_action_opt_in_blocks_execution(self) -> None:
        value = settings().model_copy(update={"allowed_actions": ()})
        command = self.command(value)

        with self.assertRaises(DeploymentFailure):
            worker_route(value, command, self.run_identity(value), value.repository.full_name,
                         str(command.deployment_id), str(command.command_id), "B")

    def test_status_key_or_non_worker_action_cannot_enable_mutations(self) -> None:
        value = settings()
        for changed in ({"journal_key": Path("/etc/jarihana-deploy/status-grant-key")},
                        {"allowed_actions": (Action.STOP_EC2,)}, {"allowed_actions": (Action.PREPARE,)}):
            with self.subTest(changed=changed), self.assertRaises((DeploymentFailure, ValidationError)):
                _ = WorkerSettings.model_validate({**value.model_dump(), **changed})

    def test_status_requires_explicit_worker_route_opt_in_on_each_slot(self) -> None:
        # Given
        for slot in Slot:
            base = settings(slot)
            command = self.command(base).model_copy(update={"action": Action.STATUS})
            value = WorkerSettings.model_validate({**base.model_dump(), "allowed_actions": (Action.STATUS,)})
            # When
            worker_route(value, command, self.run_identity(value), value.repository.full_name,
                         str(command.deployment_id), str(command.command_id), slot.value)
            # Then
            with self.assertRaises(DeploymentFailure):
                worker_route(base, command, self.run_identity(base), base.repository.full_name,
                             str(command.deployment_id), str(command.command_id), slot.value)

    def test_stale_boot_other_run_or_rerun_cannot_execute(self) -> None:
        value = settings()
        command, run = self.command(value), self.run_identity(value)
        for changed_command, changed_run, slot in (
            (command.model_copy(update={"boot_id": uuid4()}), run, "B"),
            (command, run.model_copy(update={"attempt": 2}), "B"),
            (command, run.model_copy(update={"event": "push"}), "B"),
            (command, run.model_copy(update={"sha": "b" * 40}), "B"),
            (command, run, "A"),
        ):
            with self.subTest(command=changed_command.command_id, run=changed_run, slot=slot), self.assertRaises(DeploymentFailure):
                worker_route(value, changed_command, changed_run, value.repository.full_name,
                             str(command.deployment_id), str(command.command_id), slot)

    def test_exact_container_dev_database_and_disabled_delivery_are_accepted(self) -> None:
        value = settings()

        verify_profile(value, ProfileRunner(value, profile_body(value)))

        self.assertEqual(0, value.container.restart_count)

    def test_wrong_database_or_enabled_delivery_is_rejected_without_values_in_error(self) -> None:
        value = settings()
        for changes in ({"DB_URL": "jdbc:postgresql://sensitive-prod/database"}, {"PUSH_ENABLED": "true"},
                        {"PUSH_WORKER_ENABLED": "true"}, {"PUSH_WORKER_HOST_ID": "other"},
                        {"APP_VERSION": "sha256:" + "b" * 64}):
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure) as error:
                verify_profile(value, ProfileRunner(value, profile_body(value, changes)))
            self.assertNotIn("sensitive-prod", str(error.exception))

    def test_restarted_container_cannot_reuse_old_process_pin(self) -> None:
        value = settings()
        changed = value.model_copy(update={"container": value.container.model_copy(update={"restart_count": 1})})

        with self.assertRaises(DeploymentFailure):
            verify_profile(changed, ProfileRunner(changed, profile_body(value)))

    def test_cli_rejects_arguments_before_environment_or_server_access(self) -> None:
        script = Path(__file__).parents[2] / "scripts/deploy/worker-child.py"

        result = subprocess.run([sys.executable, str(script), "unexpected"], capture_output=True, text=True, check=False)

        self.assertEqual(1, result.returncode)
        self.assertIn("worker child failed", result.stderr)

    @staticmethod
    def command(value: WorkerSettings) -> Command:
        return Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=100, parent_attempt=1,
            phase=Phase.HANDOFF, action=Action.PAUSE, host=value.host, boot_id=value.expected_boot,
            image=value.expected_image, deadline=datetime.now(UTC) + timedelta(seconds=60), authority=Authority())

    @staticmethod
    def run_identity(value: WorkerSettings) -> RunIdentity:
        return RunIdentity(run_id=200, attempt=1, workflow=value.topology.control.workflow,
            ref=value.topology.control.ref, sha=value.topology.control.sha, event="workflow_dispatch")
