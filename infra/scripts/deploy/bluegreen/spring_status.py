"""Read-only Spring management snapshots; no control operations are exposed here."""
from typing import ClassVar, Literal
from uuid import UUID

import httpx2
from pydantic import ConfigDict, SecretStr, StrictBool, ValidationError

from .child_execution import MachineIdentity
from .models import AppStatus, Authority, Counter, Digest, Identifier, Record
from .ports import DeploymentFailure


class Identity(Record):
    hostId: Identifier
    bootId: UUID


class Worker(Record):
    state: Literal["ACTIVE", "DRAINING", "PAUSED", "BLOCKED"]
    inFlight: Counter
    unresolved: Counter


class WorkerAuthority(Record):
    environment: Identifier
    deploymentId: UUID
    epoch: Counter
    phase: str
    revision: Counter
    authorityRevision: Counter
    owner: Identity | None
    status: str


class Activity(Record):
    httpInFlight: Counter
    backgroundInFlight: Counter
    backgroundDrained: StrictBool


class SpringStatus(Record):
    version: Digest
    environment: Identifier
    identity: Identity
    worker: Worker
    authority: WorkerAuthority | None
    activity: Activity


class Readiness(Record):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")
    status: Literal["UP", "DOWN", "OUT_OF_SERVICE", "UNKNOWN"]


def snapshot(client: httpx2.Client, port: int, token: SecretStr, machine: MachineIdentity) -> AppStatus:
    if not 1 <= port <= 65535 or len(token.get_secret_value().encode()) < 32:
        raise DeploymentFailure("management settings are invalid")
    try:
        raw = SpringStatus.model_validate_json(_get(client, port, "/actuator/workercontrol",
                                                   {"X-Jarihana-Worker-Control-Token": token.get_secret_value()}))
        health = Readiness.model_validate_json(_get(client, port, "/actuator/health/readiness", {}, allow_unhealthy=True))
    except ValidationError:
        raise DeploymentFailure("management status failed schema validation") from None
    if raw.environment != machine.environment or raw.identity.hostId != machine.host_id:
        raise DeploymentFailure("management application identity does not match this machine")
    authority = Authority()
    if raw.authority is not None:
        value = raw.authority
        if value.environment != machine.environment:
            raise DeploymentFailure("worker authority environment does not match")
        authority = Authority(deployment_id=value.deploymentId, epoch=value.epoch, revision=value.revision,
                              phase=value.phase, owner_host=value.owner.hostId if value.owner else None,
                              owner_boot=value.owner.bootId if value.owner else None, status=value.status)
    return AppStatus(environment=raw.environment, host_id=raw.identity.hostId, instance_id=machine.instance_id,
                     boot_id=raw.identity.bootId, image=raw.version, worker=raw.worker.state,
                     in_flight=raw.worker.inFlight, unresolved=raw.worker.unresolved, authority=authority,
                     healthy=health.status == "UP", running=True, normal_exit=False,
                     http_in_flight=raw.activity.httpInFlight,
                     background_drained=raw.activity.backgroundDrained and raw.activity.backgroundInFlight == 0)


def _get(client: httpx2.Client, port: int, path: str, headers: dict[str, str], *, allow_unhealthy: bool = False) -> bytes:
    try:
        with client.stream("GET", f"http://127.0.0.1:{port}{path}", headers=headers,
                           follow_redirects=False, timeout=httpx2.Timeout(3)) as response:
            if (response.status_code not in ((200, 503) if allow_unhealthy else (200,))
                    or response.headers.get("Content-Encoding", "identity") != "identity"):
                raise DeploymentFailure("management status request was rejected")
            body = bytearray()
            for chunk in response.iter_bytes(chunk_size=16384):
                if len(body) + len(chunk) > 65536:
                    raise DeploymentFailure("management status exceeds its size limit")
                body.extend(chunk)
            return bytes(body)
    except httpx2.HTTPError:
        raise DeploymentFailure("management status request failed") from None
