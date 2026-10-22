from datetime import datetime
from typing import Final, Literal, assert_never
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from .models import Action, AppStatus, Authority, Command, Counter, Identifier, Record
from .ports import DeploymentFailure

WorkerPhase = Literal["IDLE", "PREPARE", "HANDOFF", "OBSERVE", "COMPLETE", "NEEDS_ATTENTION"]
WORKER_ACTIONS: Final = frozenset((Action.BEGIN, Action.HANDOFF, Action.PAUSE, Action.RELEASE,
                                  Action.ACTIVATE, Action.OBSERVE, Action.COMPLETE))


class WorkerPayload(Record):
    deploymentId: UUID
    epoch: Counter
    commandId: UUID
    targetHostId: Identifier
    targetBootId: UUID
    expectedPhase: WorkerPhase
    deadline: datetime
    expectedRevision: Counter
    nextPhase: WorkerPhase | None = None


def payload(command: Command) -> WorkerPayload:
    if command.action not in WORKER_ACTIONS or command.authority is None or command.boot_id is None:
        raise DeploymentFailure("worker command requires an allowed action, authority and exact boot")
    authority = command.authority
    if command.action is not Action.BEGIN and authority.deployment_id != command.deployment_id:
        raise DeploymentFailure("worker command deployment differs from its expected authority")
    phases: dict[Action, WorkerPhase] = {Action.HANDOFF: "HANDOFF", Action.OBSERVE: "OBSERVE", Action.COMPLETE: "COMPLETE"}
    try:
        return WorkerPayload.model_validate({
            "deploymentId": command.deployment_id, "epoch": authority.epoch, "commandId": command.command_id,
            "targetHostId": command.host.host_id, "targetBootId": command.boot_id,
            "expectedPhase": authority.phase, "expectedRevision": authority.revision,
            "deadline": command.deadline.astimezone(ZoneInfo("Asia/Seoul")).replace(tzinfo=None),
            "nextPhase": phases.get(command.action),
        })
    except ValidationError:
        raise DeploymentFailure("worker command does not match the Spring control contract") from None


def expected_authority(command: Command, before: AppStatus) -> Authority:
    authority = command.authority
    if authority is None or before.authority != authority:
        raise DeploymentFailure("worker authority changed before the command")
    changed = authority.model_copy(update={"revision": authority.revision + 1})
    owner = authority.owner_host == before.host_id and authority.owner_boot == before.boot_id
    match command.action:
        case Action.BEGIN:
            return changed.model_copy(update={"deployment_id": command.deployment_id,
                                               "epoch": authority.epoch + 1, "phase": "PREPARE"})
        case Action.HANDOFF | Action.OBSERVE | Action.COMPLETE:
            if command.action is Action.COMPLETE and authority.phase == "HANDOFF" and (
                    authority.status != "UNASSIGNED" or authority.owner_host is not None
                    or authority.owner_boot is not None or not before.drained()):
                raise DeploymentFailure("handoff completion requires released authority and a fully paused worker")
            phase = {Action.HANDOFF: "HANDOFF", Action.OBSERVE: "OBSERVE", Action.COMPLETE: "COMPLETE"}[command.action]
            return changed.model_copy(update={"phase": phase})
        case Action.PAUSE:
            if not owner or authority.phase != "HANDOFF":
                raise DeploymentFailure("pause requires the current owner in HANDOFF")
            return changed.model_copy(update={"status": "DRAINING"})
        case Action.RELEASE:
            if not owner or authority.phase != "HANDOFF" or authority.status != "DRAINING" or not before.drained():
                raise DeploymentFailure("release requires a drained current owner in HANDOFF")
            return changed.model_copy(update={"owner_host": None, "owner_boot": None, "status": "UNASSIGNED"})
        case Action.ACTIVATE:
            if (not before.healthy or authority.phase != "HANDOFF" or authority.status != "UNASSIGNED" or authority.owner_host is not None
                    or authority.owner_boot is not None or not before.drained()):
                raise DeploymentFailure("activation requires released authority and a paused worker")
            return changed.model_copy(update={"owner_host": before.host_id, "owner_boot": before.boot_id, "status": "ACTIVE"})
        case Action.STATUS | Action.PREPARE | Action.STOP_APP | Action.START_EC2 | Action.STOP_EC2 | Action.SWITCH:
            raise DeploymentFailure("action is not a worker control operation")
        case _:
            assert_never(command.action)
