from pathlib import Path
from uuid import UUID

from pydantic import model_validator

from .child_execution import MachineIdentity
from .docker_shutdown import ContainerPin
from .models import Action, Command, Digest, Host, RunIdentity, Slot
from .ports import DeploymentFailure
from .status_settings import StatusSettings
from .worker_command import WORKER_ACTIONS


class WorkerSettings(StatusSettings):
    local_slot: Slot = Slot.B
    expected_boot: UUID
    expected_image: Digest
    container: ContainerPin
    allowed_actions: tuple[Action, ...] = ()

    @model_validator(mode="after")
    def worker_rehearsal_only(self) -> "WorkerSettings":
        if (self.repository.id != 1321030074
                or self.topology.control.workflow != "backend-bluegreen-worker-child.yml"
                or not self.topology.control.ref.startswith("refs/tags/bluegreen-worker-rehearsal-")
                or self.journal_key != Path("/etc/jarihana-deploy/worker-grant-key")
                or self.known_hosts != Path("/etc/jarihana-deploy/worker-known-hosts")
                or self.worker_token_file != Path("/etc/jarihana-deploy/worker-control-token")
                or self.management_port != (8081 if self.local_slot is Slot.A else 18081)
                or self.container.image_id != self.expected_image
                or not set(self.allowed_actions).issubset(WORKER_ACTIONS | {Action.STATUS})):
            raise DeploymentFailure("worker settings are not the isolated A/B rehearsal contract")
        return self

    @property
    def host(self) -> Host:
        return self.topology.host(self.local_slot)


def authorize_worker_machine(settings: WorkerSettings, machine: MachineIdentity) -> None:
    if (machine.instance_id != settings.host.instance_id or machine.host_id != settings.host.host_id
            or machine.environment != settings.topology.environment):
        raise DeploymentFailure("worker child is not on its administrator-approved rehearsal machine")


def worker_route(settings: WorkerSettings, command: Command, run: RunIdentity,
                 repository: str, deployment: str, command_id: str, slot: str) -> None:
    release = settings.topology.control
    if (repository != settings.repository.full_name or slot != settings.local_slot.value
            or deployment != str(command.deployment_id) or command_id != str(command.command_id)
            or command.host != settings.host or command.boot_id != settings.expected_boot
            or command.action not in settings.allowed_actions or run.attempt != 1
            or run.workflow != release.workflow or run.ref != release.ref or run.sha != release.sha
            or run.event != "workflow_dispatch"):
        raise DeploymentFailure("worker routing does not match the administrator-approved release and process")
