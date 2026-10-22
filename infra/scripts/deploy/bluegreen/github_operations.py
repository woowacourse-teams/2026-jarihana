"""Validate exact child identity and the still-current one-shot command grant."""
from datetime import datetime

from .models import Action, AppStatus, Command, DeploymentState, Phase, Receipt, RunIdentity, Topology
from .ports import DeploymentFailure


def validate_run(run: RunIdentity, topology: Topology) -> None:
    release = topology.control
    if (run.workflow != release.workflow or run.ref != release.ref or run.sha != release.sha
            or run.event != "workflow_dispatch" or run.attempt != 1):
        raise DeploymentFailure("child control release, event or attempt does not match")


def authorize(command: Command, state: DeploymentState, now: datetime) -> None:
    """Child adapters must check this immediately before each side effect too."""
    if (state.pending != command or state.deployment_id != command.deployment_id
            or state.phase != command.phase or now >= command.deadline
            or state.phase is Phase.ATTENTION):
        raise DeploymentFailure("expired or superseded deployment command")
    if command.action is Action.STOP_APP and not (state.rollback_sealed and state.phase is Phase.SEALED
                                                and command.host.slot is state.old):
        raise DeploymentFailure("application stop requires sealed cleanup for the previous host")
    if command.action is Action.STOP_EC2:
        stopped = state.old_app
        if (not state.rollback_sealed or state.phase is not Phase.SEALED or command.host.slot is not state.old
                or stopped is None or stopped.running or not stopped.normal_exit or not stopped.requests_drained()):
            raise DeploymentFailure("EC2 stop requires proven normal shutdown of the previous application")


def authorize_local_process(command: Command, actual: AppStatus) -> None:
    """Child adapter calls this on its own identity before applying a local command."""
    if actual.host_id != command.host.host_id or actual.instance_id != command.host.instance_id:
        raise DeploymentFailure("child is running on a different instance")
    if command.boot_id is not None and actual.boot_id != command.boot_id:
        raise DeploymentFailure("local process boot does not match the command")


def validate_receipt(receipt: Receipt, state: DeploymentState, topology: Topology) -> None:
    if receipt.schema_version != 1 or receipt.command != state.pending or receipt.run != state.pending_run:
        raise DeploymentFailure("child result does not belong to the exact command/run")
    validate_run(receipt.run, topology)
    host = topology.host(receipt.command.host.slot)
    status = receipt.status
    if (status.environment != topology.environment or status.host_id != host.host_id
            or status.instance_id != host.instance_id):
        raise DeploymentFailure("child instance identity does not match the allowlist")
    if receipt.command.boot_id is not None and receipt.command.boot_id != status.boot_id:
        raise DeploymentFailure("child process boot changed")
    if receipt.command.action is Action.PREPARE and status.image != receipt.command.image:
        raise DeploymentFailure("prepared image digest does not match")
    if not receipt.success:
        raise DeploymentFailure("child operation failed")
