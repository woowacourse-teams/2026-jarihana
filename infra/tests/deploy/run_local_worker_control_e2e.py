#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from bluegreen.child_artifacts import (
    ArtifactExpectation,
    accept_artifact,
    serialize_artifact,
)
from bluegreen.child_execution import ChildContext, ChildGate, MachineIdentity
from bluegreen.models import (
    Action,
    AppStatus,
    Command,
    DeploymentState,
    Phase,
    Receipt,
    RunIdentity,
    Slot,
    Topology,
)
from bluegreen.nginx_switch import ApiProbe
from bluegreen.ports import DeploymentFailure, SystemClock
from bluegreen.spring_status import snapshot
from bluegreen.spring_worker import SpringWorker, worker_client
from bluegreen.state_store import StateStore
from controller_fakes import OLD_IMAGE
from local_runtime import LocalRuntime
from local_spring import TOKEN
from pydantic import SecretStr


@dataclass(frozen=True, slots=True)
class LiveWorkerControl:
    topology: Topology
    store: StateStore
    workers: Mapping[Slot, SpringWorker]
    clock: SystemClock
    directory: Path
    http_port: int

    def step(self, action: Action, slot: Slot) -> Command:
        previous = self.store.read()
        if previous is None or previous.pending is not None:
            raise DeploymentFailure("local fixture journal is not ready")
        control = self.workers[slot]
        before = snapshot(control.client, control.port, control.token, control.machine)
        phase = Phase.PREPARING if action is Action.BEGIN else Phase.HANDOFF
        command = Command(command_id=uuid4(), deployment_id=previous.deployment_id, parent_run_id=100,
                          parent_attempt=1, phase=phase, action=action, host=self.topology.host(slot),
                          boot_id=before.boot_id, image=before.image, deadline=self.clock.now() + timedelta(seconds=30),
                          authority=before.authority)
        run = RunIdentity(run_id=1000 + previous.revision, attempt=1, workflow=self.topology.control.workflow,
                          ref=self.topology.control.ref, sha=self.topology.control.sha, event="workflow_dispatch")
        pending = self.store.save(previous, previous.model_copy(update={
            "revision": previous.revision + 1, "phase": phase, "pending": command, "pending_run": run}))
        gate = ChildGate(ChildContext(self.topology, run, control.machine), self.store, self.clock)
        after = control.execute(command, lambda status: gate.check(command, status))
        gate.check(command, after)
        artifact = serialize_artifact(Receipt(schema_version=1, command=command, run=run, success=True, status=after), None)
        receipt = accept_artifact(artifact, ArtifactExpectation(pending, self.topology, self.clock.now()))
        _ = (self.directory / f"{command.command_id}.json").write_bytes(artifact)
        _ = self.store.save(pending, pending.model_copy(update={
            "revision": pending.revision + 1, "pending": None, "pending_run": None,
            "receipts": pending.receipts + (receipt,), "authority": after.authority}))
        response = control.client.get(f"http://127.0.0.1:{self.http_port}/api/groups?size=1",
                                      timeout=3, follow_redirects=False)
        if response.status_code != 200 or not ApiProbe.model_validate_json(response.content).success:
            raise DeploymentFailure("HTTP API stopped while worker authority changed")
        return command

    def owner(self, expected: Slot) -> AppStatus:
        states = tuple(snapshot(control.client, control.port, control.token, control.machine) for control in self.workers.values())
        actual = next(status for status in states if status.host_id == self.topology.host(expected).host_id)
        if (any(status.authority != actual.authority for status in states) or actual.worker != "ACTIVE"
                or actual.authority.owner_host != actual.host_id or actual.authority.owner_boot != actual.boot_id):
            raise DeploymentFailure("two JVMs disagree about the exclusive worker owner")
        return actual


def main() -> None:
    directory = Path("local-plans/blue-green-deployment/artifacts/local-worker-control") / str(uuid4())
    directory.mkdir(parents=True)
    runtime = LocalRuntime(directory.resolve())
    clock = SystemClock()
    try:
        topology, store, _, public_port = runtime.setup()
        runtime.nodes[Slot.B].start(OLD_IMAGE)
        with worker_client() as client:
            workers = {slot: SpringWorker(client, node.management_port, SecretStr(TOKEN), MachineIdentity(
                environment=topology.environment, host_id=node.host.host_id, instance_id=node.host.instance_id), clock)
                for slot, node in runtime.nodes.items()}
            live = LiveWorkerControl(topology, store, workers, clock, directory, public_port)
            for old in (Slot.A, Slot.B):
                target = old.other()
                _ = store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4(), old=old, target=target,
                    parent_run_id=100, parent_attempt=1,
                    topology_digest=hashlib.sha256(topology.model_dump_json().encode()).hexdigest(), heartbeat=clock.now()))
                _ = live.step(Action.BEGIN, old)
                _ = live.step(Action.HANDOFF, old)
                pause = live.step(Action.PAUSE, old)
                _ = live.step(Action.RELEASE, old)
                _ = live.step(Action.ACTIVATE, target)
                _ = live.step(Action.OBSERVE, target)
                _ = live.step(Action.COMPLETE, target)
                expected = live.owner(target)
                rejected = False
                try:
                    _ = workers[old].execute(pause, lambda _: None)
                except DeploymentFailure:
                    rejected = True
                if not rejected or live.owner(target).authority != expected.authority:
                    raise DeploymentFailure("stale command changed worker ownership")
                final = store.read()
                if final is None:
                    raise DeploymentFailure("fixture journal disappeared")
                _ = store.update(final, phase=Phase.COMPLETE)
                _ = (directory / f"{old.value}-to-{target.value}.json").write_text(final.model_dump_json(indent=2))
        _ = (directory / "result.json").write_text(json.dumps({
            "real_spring_processes": 2, "real_postgres": True, "worker_commands": 14, "http_checks": 14,
            "handoff_directions": ["A-to-B", "B-to-A"], "stale_replay_rejected": True,
            "external_push_enabled": False, "github_execution_verified": False,
        }, indent=2))
        print(f"LOCAL_WORKER_CONTROL_PASSED commands=14 http_checks=14 stale_rejected=true artifacts={directory}")
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
