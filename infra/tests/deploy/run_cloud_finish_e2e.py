#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0", "psycopg[binary]==3.3.6"]
# ///
# Run: PYTHONPATH=infra/scripts/deploy:infra/tests/deploy uv run infra/tests/deploy/run_cloud_finish_e2e.py
import hashlib
import json
import socket
import tempfile
import time
from pathlib import Path
from uuid import UUID, uuid4

import httpx2
import psycopg
from bluegreen.models import Record
from bluegreen.nginx_switch import ApiProbe
from bluegreen.ports import DeploymentFailure
from cloud_finish_data import LOCK_KEY, finish_is_waiting, hold_finish, seed
from cloud_finish_runtime import (
    HOST_A,
    HOST_B,
    JAR,
    MAILBOX,
    FixtureHost,
    FixtureRelease,
    replace,
    upload,
)
from cloud_worker_runtime import DB_HOST, B, control_token, tunnel
from psycopg import sql
from pydantic import SecretStr
from run_cloud_worker_e2e import Node, assert_owner, command, wait_ready


class RunResult(Record):
    processed: int
    received: int


class Received(Record):
    count: int
    delivery_id: int


def start(host: FixtureHost) -> None:
    _ = host.remote.docker("exec", host.candidate, "sh", "-c",
                           f"rm -f {MAILBOX}/result.json && touch {MAILBOX}/run")


def result(host: FixtureHost) -> RunResult:
    deadline = time.monotonic() + 30
    while host.remote.docker("exec", host.candidate, "sh", "-c",
                            f"if test -f {MAILBOX}/result.json; then echo ready; fi") != "ready":
        if time.monotonic() >= deadline:
            raise DeploymentFailure("fixture worker did not return before the deadline")
        time.sleep(0.1)
    return RunResult.model_validate_json(host.remote.docker("exec", host.candidate, "cat", f"{MAILBOX}/result.json"))


def exercise(client: httpx2.Client, nodes: tuple[Node, Node], database: psycopg.Connection[tuple[int, ...]]) -> None:
    a, b = nodes
    deployment: UUID = uuid4()
    command(client, a, deployment, "begin")
    command(client, a, deployment, "phase", next_phase="HANDOFF")
    command(client, a, deployment, "activate")
    row = database.execute("SELECT current_schema()::regnamespace::oid::int").fetchone()
    assert row is not None
    namespace = row[0]
    try:
        start(HOST_A)
        deadline = time.monotonic() + 30
        while not finish_is_waiting(database, namespace):
            if time.monotonic() >= deadline:
                raise DeploymentFailure("A did not reach the fixture DB finish gate")
            time.sleep(0.1)
        received = Received.model_validate_json(HOST_A.remote.docker(
            "exec", HOST_A.candidate, "cat", f"{MAILBOX}/received.json"))
        if received.count != 1 or received.delivery_id != 1:
            raise DeploymentFailure("the fixture receiver did not receive A exactly once")
        command(client, a, deployment, "pause")
        state = a.status(client)
        if state.worker.state != "DRAINING" or state.worker.inFlight != 1 or state.activity.backgroundDrained:
            raise DeploymentFailure("A did not retain its in-flight permit during the uncommitted finish")
        command(client, a, deployment, "release", expected_code=409)
        command(client, b, deployment, "activate", expected_code=409)
        start(HOST_B)
        if result(HOST_B) != RunResult(processed=0, received=0):
            raise DeploymentFailure("paused B processed a delivery before handoff")
        response = client.get("http://127.0.0.1:18953/api/groups?size=1")
        _ = response.raise_for_status()
        _ = ApiProbe.model_validate_json(response.content)
        print("A_FINISH_PENDING_B_BLOCKED_HTTP_OK", flush=True)
    finally:
        _ = database.execute("SELECT pg_advisory_unlock(%s, %s)", (LOCK_KEY, namespace))
    if result(HOST_A) != RunResult(processed=1, received=1):
        raise DeploymentFailure("A did not finish exactly one delivery")
    if database.execute("SELECT count(*)::int FROM notification_deliveries WHERE id=1 AND status='ACCEPTED'").fetchone() != (1,):
        raise DeploymentFailure("A finish was not committed")
    command(client, a, deployment, "release")
    command(client, b, deployment, "activate")
    assert_owner(client, nodes, b)
    start(HOST_B)
    if result(HOST_B) != RunResult(processed=1, received=1):
        raise DeploymentFailure("B did not process exactly the remaining delivery")
    if database.execute("SELECT count(*)::int FROM notification_deliveries WHERE status='ACCEPTED' AND attempt_count=1").fetchone() != (2,):
        raise DeploymentFailure("delivery completion or attempt counts differ")
    command(client, b, deployment, "pause")
    command(client, b, deployment, "release")
    print("FINISH_COMMITTED_THEN_B_PROCESSED_REMAINING_DELIVERY", flush=True)


def main() -> None:
    HOST_A.remote.identify()
    HOST_B.remote.identify()
    source = B.inspect(HOST_B.original)
    _ = control_token(source)
    environment = source.environment()
    release = FixtureRelease("bg_" + uuid4().hex, hashlib.sha256(JAR.read_bytes()).hexdigest())
    artifacts = Path("local-plans/blue-green-deployment/artifacts/cloud-finish") / release.schema
    artifacts.mkdir(parents=True, exist_ok=False)
    for host in (HOST_A, HOST_B):
        original = host.remote.inspect(host.original)
        policy = host.remote.docker("inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", original.Id)
        _ = (artifacts / f"{host.host_id}-original.json").write_text(
            json.dumps({"container": original.Id, "image": original.Image, "restart_policy": policy}))
        upload(host, release)
    limits = httpx2.Limits(max_connections=200, max_keepalive_connections=40, keepalive_expiry=30)
    transport = httpx2.HTTPTransport(http2=True, retries=0, limits=limits,
                                    socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)])
    with tempfile.TemporaryDirectory(prefix="jf-", dir="/private/tmp") as temporary:
        directory = Path(temporary)
        with tunnel(B, (f"127.0.0.1:18952:{DB_HOST}:5432",), directory / "db"), \
                psycopg.Connection[tuple[int, ...]].connect(
                    host="127.0.0.1", port=18952, dbname="jarihana_dev", sslmode="require",
                    user=environment["DB_USERNAME"], password=environment["DB_PASSWORD"],
                    connect_timeout=10, autocommit=True) as database:
            _ = database.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(release.schema)))
            _ = database.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(release.schema)))
            with replace(HOST_A, release, source) as token_a, replace(HOST_B, release, source) as token_b, \
                    tunnel(HOST_A.remote, ("127.0.0.1:18950:127.0.0.1:8081", "127.0.0.1:18953:127.0.0.1:8080"), directory / "a"), \
                    tunnel(HOST_B.remote, ("127.0.0.1:18951:127.0.0.1:18081",), directory / "b"), \
                    httpx2.Client(transport=transport, trust_env=False, follow_redirects=False,
                                  timeout=httpx2.Timeout(connect=5, read=10, write=10, pool=10)) as client:
                nodes = (Node(18950, HOST_A.host_id, SecretStr(token_a), release.version),
                         Node(18951, HOST_B.host_id, SecretStr(token_b), release.version))
                for node in nodes:
                    wait_ready(client, node)
                seed(database)
                _ = hold_finish(database, release.schema)
                exercise(client, nodes, database)
            _ = database.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(release.schema)))
    for host in (HOST_A, HOST_B):
        _ = host.remote.run("rm", release.remote_jar)
    _ = (artifacts / "result.json").write_text(
        '{"finish_wait_verified":true,"b_blocked_before_commit":true,"http_during_drain":true,'
        + '"deliveries_accepted":2,"external_push":false,"original_apps_restored":true,"own_schema_removed":true}')
    print("CLOUD_FINISH_HANDOFF_PASSED_AND_ORIGINAL_APPS_RESTORED", flush=True)


if __name__ == "__main__":
    main()
