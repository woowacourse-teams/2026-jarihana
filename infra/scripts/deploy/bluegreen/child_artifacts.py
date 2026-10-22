"""Bounded, strict child-result JSON with command-bound shutdown evidence."""
from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
from typing import Annotated, Final

from pydantic import Field, StrictBool, ValidationError

from .docker_shutdown import ShutdownEvidence
from .github_operations import authorize, validate_receipt
from .models import Action, AppStatus, Counter, DeploymentState, Receipt, Record, Topology
from .ports import DeploymentFailure

MAX_ARTIFACT_BYTES: Final = 65536
VersionOne = Annotated[int, Field(strict=True, ge=1, le=1)]


class ArtifactStatus(AppStatus):
    normal_exit: StrictBool
    http_in_flight: Counter | None
    background_drained: StrictBool


class ArtifactReceipt(Receipt):
    schema_version: VersionOne
    success: StrictBool
    status: ArtifactStatus


class ArtifactShutdown(ShutdownEvidence):
    stop_cli_exit: Annotated[int, Field(strict=True, ge=0, le=0)]
    exit_code: Annotated[int, Field(strict=True)]


class ChildArtifact(Record):
    schema_version: VersionOne
    receipt: ArtifactReceipt
    shutdown: ArtifactShutdown | None


@dataclass(frozen=True, slots=True)
class ArtifactExpectation:
    state: DeploymentState
    topology: Topology
    now: datetime


def serialize_artifact(receipt: Receipt, shutdown: ShutdownEvidence | None) -> bytes:
    """Serialize typed local output; the parent must independently validate it."""
    artifact = ChildArtifact(schema_version=1,
                             receipt=ArtifactReceipt.model_validate(receipt.model_dump(), strict=True),
                             shutdown=None if shutdown is None else ArtifactShutdown.model_validate(
                                 shutdown.model_dump(), strict=True))
    return artifact.model_dump_json().encode()


def accept_artifact(payload: bytes, expected: ArtifactExpectation) -> Receipt:
    if len(payload) > MAX_ARTIFACT_BYTES:
        raise DeploymentFailure("child artifact exceeds its size limit")
    try:
        artifact = ChildArtifact.model_validate_json(payload, strict=True)
    except ValidationError as error:
        raise DeploymentFailure("child artifact failed schema validation") from error
    receipt = artifact.receipt
    if receipt.command.action in (Action.START_EC2, Action.STOP_EC2, Action.SWITCH):
        raise DeploymentFailure("application child cannot report a coordinator operation")
    authorize(receipt.command, expected.state, expected.now)
    validate_receipt(receipt, expected.state, expected.topology)
    if (expected.state.topology_digest != hashlib.sha256(expected.topology.model_dump_json().encode()).hexdigest()
            or receipt.command.parent_run_id != expected.state.parent_run_id
            or receipt.command.parent_attempt != expected.state.parent_attempt):
        raise DeploymentFailure("artifact parent execution does not match the journal")
    if receipt.command.action is Action.STOP_APP:
        proof = artifact.shutdown
        if (proof is None or proof.command_id != receipt.command.command_id
                or proof.boot_id != receipt.status.boot_id or proof.boot_id != receipt.command.boot_id
                or proof.exit_code not in (0, 143) or proof.finished_at <= proof.container.started_at
                or proof.finished_at > expected.now + timedelta(seconds=5)
                or receipt.status.authority.owner_host == receipt.status.host_id
                or not receipt.status.normal_exit or receipt.status.running or not receipt.status.requests_drained()):
            raise DeploymentFailure("child shutdown evidence does not prove this command completed")
    elif artifact.shutdown is not None or receipt.status.normal_exit:
        raise DeploymentFailure("shutdown evidence belongs only to STOP_APP")
    # Keep the journal's base record types stable across serialization and CAS comparisons.
    return Receipt.model_validate(receipt.model_dump(), strict=True)
