#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0", "psycopg[binary]==3.3.6"]
# ///
# Run locally: PYTHONPATH=infra/scripts/deploy uv run infra/tests/deploy/run_cloud_worker_e2e.py
# Temporarily replaces dev A; restores its original container. Push and schedulers stay disabled.
import socket
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import httpx2
import psycopg
from bluegreen.models import Record
from bluegreen.ports import DeploymentFailure
from cloud_worker_runtime import (
    DB_HOST,
    IMAGE,
    A,
    B,
    candidate_a,
    control_token,
    tunnel,
)
from local_spring import EndpointStatus
from psycopg.rows import class_row
from pydantic import SecretStr, StrictBool


class Command(Record):
    deploymentId: UUID
    epoch: int
    commandId: UUID
    targetHostId: str
    targetBootId: UUID
    expectedPhase: str
    deadline: datetime
    expectedRevision: int
    nextPhase: str | None


@dataclass(frozen=True, slots=True)
class Node:
    port: int
    host_id: str
    token: SecretStr

    def status(self, client: httpx2.Client) -> EndpointStatus:
        response = client.get(f"http://127.0.0.1:{self.port}/actuator/workercontrol",
                              headers={"X-Jarihana-Worker-Control-Token": self.token.get_secret_value()})
        _ = response.raise_for_status()
        status = EndpointStatus.model_validate_json(response.content)
        if (status.environment != "dev-rehearsal" or status.identity.hostId != self.host_id
                or status.version != IMAGE):
            raise DeploymentFailure("worker identity, environment or image differs")
        return status


@dataclass(frozen=True, slots=True)
class AuthorityRow:
    environment: str
    deployment_id: UUID | None
    revision: int
    status: str
    owner_host: str | None


class MigrationCheck(Record):
    valid: StrictBool


class Report(Record):
    image: str = IMAGE
    migration_history_checked: bool = True
    initial_b_paused: bool = True
    a_and_b_observed_same_authority: bool = True
    premature_b_activation_rejected: bool = True
    paused_a_still_blocked_b_until_release: bool = True
    handoff_a_to_b: bool = True
    stale_boot_rejected: bool = True
    reverse_handoff_b_to_a: bool = True
    own_test_authority_removed: bool = True
    original_dev_restored: bool = True
    in_flight_delivery_tested: bool = False
    external_push_tested: bool = False


def command(client: httpx2.Client, node: Node, deployment: UUID,
            operation: Literal["begin", "phase", "activate", "pause", "release"],
            *, next_phase: str | None = None, expected_code: int = 200, wrong_boot: bool = False) -> None:
    status = node.status(client)
    authority = status.authority
    payload = Command(deploymentId=deployment, epoch=authority.epoch if authority else 0,
                      commandId=uuid4(), targetHostId=node.host_id,
                      targetBootId=uuid4() if wrong_boot else status.identity.bootId,
                      expectedPhase=authority.phase if authority else "IDLE",
                      deadline=datetime.now(ZoneInfo("Asia/Seoul")).replace(tzinfo=None) + timedelta(seconds=30),
                      expectedRevision=authority.revision if authority else 0, nextPhase=next_phase)
    response = client.post(f"http://127.0.0.1:{node.port}/actuator/workercontrol/{operation}",
                           headers={"Content-Type": "application/json",
                                    "X-Jarihana-Worker-Control-Token": node.token.get_secret_value()},
                           content=payload.model_dump_json())
    if response.status_code != expected_code:
        raise DeploymentFailure(f"{operation} on {node.host_id}: expected {expected_code}, got {response.status_code}")


def assert_owner(client: httpx2.Client, nodes: tuple[Node, Node], owner: Node) -> None:
    a, b = (node.status(client) for node in nodes)
    if (a.authority is None or b.authority != a.authority or a.authority.owner is None
            or a.authority.owner.hostId != owner.host_id or a.authority.status != "ACTIVE"):
        raise DeploymentFailure("both apps did not observe the same exclusive owner")


def wait_ready(client: httpx2.Client, node: Node) -> None:
    deadline = time.monotonic() + 100
    while True:
        try:
            status = node.status(client)
            response = client.get(f"http://127.0.0.1:{node.port}/actuator/health/database")
            _ = response.raise_for_status()
            if status.worker.state != "PAUSED" or status.worker.inFlight or status.worker.unresolved:
                raise DeploymentFailure("new worker did not start paused and empty")
            return
        except httpx2.HTTPError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)


def exercise(client: httpx2.Client, nodes: tuple[Node, Node], deployment: UUID) -> None:
    a, b = nodes
    command(client, a, deployment, "begin")
    command(client, a, deployment, "phase", next_phase="HANDOFF")
    command(client, a, deployment, "activate")
    assert_owner(client, nodes, a)
    command(client, b, deployment, "activate", expected_code=409)
    if b.status(client).worker.state != "PAUSED":
        raise DeploymentFailure("candidate activated while A was the owner")
    command(client, a, deployment, "pause")
    command(client, b, deployment, "activate", expected_code=409)
    command(client, a, deployment, "release")
    command(client, b, deployment, "activate")
    assert_owner(client, nodes, b)
    command(client, b, deployment, "pause", wrong_boot=True, expected_code=409)
    assert_owner(client, nodes, b)
    command(client, b, deployment, "pause")
    command(client, a, deployment, "activate", expected_code=409)
    command(client, b, deployment, "release")
    command(client, a, deployment, "activate")
    assert_owner(client, nodes, a)
    print("A_TO_B_AND_B_TO_A_AUTHORITY_HANDOFF_PASSED", flush=True)


def cleanup(client: httpx2.Client, nodes: tuple[Node, Node], deployment: UUID,
            database: psycopg.Connection[AuthorityRow]) -> None:
    authority = nodes[0].status(client).authority
    if authority is None:
        return
    if authority.deploymentId != deployment:
        raise DeploymentFailure("refusing to clean another deployment authority")
    if authority.owner is not None:
        owner = next(node for node in nodes if node.host_id == authority.owner.hostId)
        command(client, owner, deployment, "pause")
        state = owner.status(client)
        if (state.worker.state != "PAUSED" or state.worker.inFlight or state.worker.unresolved
                or not state.activity.backgroundDrained):
            raise DeploymentFailure("authority cleanup requires a drained owner")
        command(client, owner, deployment, "release")
    final = nodes[0].status(client).authority
    if final is None or final.owner is not None or final.status != "UNASSIGNED":
        raise DeploymentFailure("authority was not released")
    # Only remove this test's newly-created, released row; never notifications or migration history.
    cursor = database.execute(
        "DELETE FROM worker_authority WHERE environment = %s AND deployment_id = %s "
        + "AND revision = %s AND status = 'UNASSIGNED' AND owner_host IS NULL AND owner_boot_id IS NULL",
        ("dev-rehearsal", deployment, final.revision),
    )
    if cursor.rowcount != 1 or any(node.status(client).authority is not None for node in nodes):
        raise DeploymentFailure("guarded test authority cleanup was not confirmed")
    print("OWN_TEST_AUTHORITY_REMOVED", flush=True)


def main() -> None:
    A.identify()
    B.identify()
    source = B.inspect("jarihana-bluegreen-rehearsal-b-backend-1")
    token_b = control_token(source)
    environment = source.environment()
    deployment = uuid4()
    artifacts = Path("local-plans/blue-green-deployment/artifacts/cloud-worker-20261023") / f"v7-{deployment}"
    artifacts.mkdir(parents=True, exist_ok=False)
    limits = httpx2.Limits(max_connections=200, max_keepalive_connections=40, keepalive_expiry=30)
    transport = httpx2.HTTPTransport(http2=True, retries=0, limits=limits,
                                     socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)])
    with tempfile.TemporaryDirectory(prefix="jarihana-worker-") as temporary:
        directory = Path(temporary)
        with tunnel(B, ("127.0.0.1:18882:127.0.0.1:18081",
                        f"127.0.0.1:18883:{DB_HOST}:5432"), directory / "b"), \
                httpx2.Client(transport=transport, trust_env=False, follow_redirects=False,
                              timeout=httpx2.Timeout(connect=5, read=10, write=10, pool=10)) as client, \
                psycopg.Connection[AuthorityRow].connect(host="127.0.0.1", port=18883, dbname="jarihana_dev", sslmode="require",
                                user=environment["DB_USERNAME"], password=environment["DB_PASSWORD"],
                                connect_timeout=10, autocommit=True, row_factory=class_row(AuthorityRow)) as database:
            b = Node(18882, "jarihana-rehearsal-b", token_b)
            wait_ready(client, b)
            with database.transaction(), database.cursor(row_factory=class_row(MigrationCheck)) as cursor:
                _ = cursor.execute("SET TRANSACTION READ ONLY")
                _ = cursor.execute(
                    "SELECT count(*) = 3 AS valid FROM public.flyway_schema_history WHERE success AND type = 'SQL' AND ("
                    + "(version = '4' AND script = 'V4__image_lifecycle.sql' AND checksum = 645040793) OR "
                    + "(version = '6' AND script = 'V6__activity_post_interaction_notification.sql' AND checksum = -1361681489) OR "
                    + "(version = '7' AND script = 'V7__worker_authority.sql' AND checksum = 1532855250))"
                )
                migration = cursor.fetchone()
                if migration is None or not migration.valid:
                    raise DeploymentFailure("V4/V6/V7 migration history differs; dev will not be replaced")
            print("MIGRATION_HISTORY_CHECKED_BEFORE_DEV_CHANGES", flush=True)
            row = database.execute("SELECT environment, deployment_id, revision, status, owner_host "
                                   + "FROM worker_authority WHERE environment = %s", ("dev-rehearsal",)).fetchone()
            if row is not None or b.status(client).authority is not None:
                raise DeploymentFailure("previous authority exists; refusing a fresh destructive test")
            with candidate_a(source, artifacts / "recovery.json") as candidate, \
                    tunnel(A, ("127.0.0.1:18881:127.0.0.1:8081",), directory / "a"):
                a = Node(18881, "jarihana-rehearsal-a", control_token(candidate))
                wait_ready(client, a)
                print("BOTH_APPS_PAUSED_ON_THE_APPROVED_DEV_DB", flush=True)
                try:
                    exercise(client, (a, b), deployment)
                finally:
                    cleanup(client, (a, b), deployment, database)
    report = Report()
    _ = (artifacts / "result.json").write_text(report.model_dump_json(indent=2))
    print(report.model_dump_json(), flush=True)


if __name__ == "__main__":
    main()
