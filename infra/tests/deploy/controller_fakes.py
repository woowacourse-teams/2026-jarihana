"""A stateful local authority and exact-run queue, rather than canned service mocks."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from typing import assert_never
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parents[2] / "scripts" / "deploy"))
from bluegreen.github_operations import authorize, authorize_local_process
from bluegreen.models import (Action, AppStatus, Authority, Command, ControlRelease, DrainTicket,
                             Host, Receipt, RunIdentity, Slot, Topology)
from bluegreen.ports import Adapters, DeploymentFailure, Health
from bluegreen.state_store import StateStore

OLD_IMAGE = "sha256:" + "1" * 64
NEW_IMAGE = "sha256:" + "2" * 64


class FakeClock:
    def __init__(self):
        self.elapsed = 0.0
        self.wall_shift = 0.0

    def now(self) -> datetime:
        return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=self.elapsed + self.wall_shift)

    def monotonic(self) -> float:
        return self.elapsed

    def sleep(self, seconds: float) -> None:
        self.elapsed += seconds


class FakeCloud:
    def __init__(self, clock: FakeClock):
        self.clock = clock
        self.instances = {Slot.A: True, Slot.B: False}
        self.stops: list[tuple[Slot, float]] = []

    def start(self, host: Host) -> None:
        self.instances[host.slot] = True

    def running(self, host: Host) -> bool:
        return self.instances[host.slot]

    def stop(self, host: Host) -> None:
        self.stops.append((host.slot, self.clock.elapsed))
        self.instances[host.slot] = False

    def stopped(self, host: Host) -> bool:
        return not self.instances[host.slot]


class FakeProxy:
    def __init__(self):
        self.slot = Slot.A
        self.switches: list[Slot] = []
        self.drain_ok = True
        self.apply_switch = True

    def active(self) -> Slot:
        return self.slot

    def switch(self, host: Host) -> DrainTicket:
        self.switches.append(host.slot)
        if self.apply_switch:
            self.slot = host.slot
        return DrainTicket(container_id="nginx-test", workers=(str(len(self.switches)),))

    def drained(self, ticket: DrainTicket) -> bool:
        return self.drain_ok


class FakeTelemetry:
    def __init__(self, clock: FakeClock):
        self.clock = clock
        self.failure_at = float("inf")
        self.health_after_failure = Health.UNHEALTHY

    def health(self, host: Host) -> Health:
        return self.health_after_failure if self.clock.elapsed >= self.failure_at else Health.HEALTHY


class FakeApps:
    def __init__(self, topology: Topology, store: StateStore, clock: FakeClock):
        self.topology, self.store, self.clock = topology, store, clock
        boot = uuid4()
        self.authority = Authority(deployment_id=uuid4(), epoch=1, revision=1, phase="COMPLETE",
                                   owner_host=topology.a.host_id, owner_boot=boot, status="ACTIVE")
        self.nodes = {
            slot: AppStatus(environment=topology.environment, host_id=topology.host(slot).host_id, instance_id=topology.host(slot).instance_id,
                            boot_id=boot if slot is Slot.A else uuid4(), image=OLD_IMAGE,
                            worker="ACTIVE" if slot is Slot.A else "PAUSED", authority=self.authority,
                            healthy=True, running=slot is Slot.A, in_flight=0, unresolved=0,
                            http_in_flight=0, background_drained=True)
            for slot in Slot
        }
        self.commands: list[Command] = []
        self.runs: dict[int, tuple[RunIdentity, Command]] = {}
        self.results: dict[int, Receipt] = {}
        self.lost_dispatch = False
        self.match_count = 1
        self.queue_forever = False
        self.forced_exit = False
        self.candidate_active = False
        self.bad_digest = False
        self.candidate_healthy = True
        self.old_healthy = True
        self.worker_busy = False
        self.unreachable_after_rollback = False

    def dispatch(self, command: Command) -> RunIdentity | None:
        self.commands.append(command)
        release = self.topology.control
        run = RunIdentity(run_id=len(self.commands), attempt=1, event="workflow_dispatch",
                          workflow=release.workflow, ref=release.ref, sha=release.sha)
        self.runs[run.run_id] = (run, command)
        return None if self.lost_dispatch else run

    def find(self, command: Command) -> tuple[RunIdentity, ...]:
        matches = tuple(run for run, queued in self.runs.values() if queued == command)
        return matches * self.match_count

    def poll(self, run: RunIdentity) -> Receipt | None:
        if self.queue_forever:
            return None
        if run.run_id in self.results:
            return self.results[run.run_id]
        _, command = self.runs[run.run_id]
        state = self.store.read()
        assert state is not None
        authorize(command, state, self.clock.now())
        if self.unreachable_after_rollback and state.http_recovered and command.host.slot is Slot.B:
            raise DeploymentFailure("candidate worker is unreachable")
        status = self._apply(command)
        receipt = Receipt(schema_version=1, command=command, run=run, success=True, status=status)
        self.results[run.run_id] = receipt
        return receipt

    def cancel(self, run: RunIdentity) -> None:
        return None

    def _apply(self, command: Command) -> AppStatus:
        slot = command.host.slot
        node = self.nodes[slot]
        authorize_local_process(command, node)
        if command.action not in (Action.STATUS, Action.PREPARE) and command.authority != self.authority:
            raise DeploymentFailure("stale authority revision")
        if command.action in (Action.PAUSE, Action.RELEASE, Action.ACTIVATE) and self.authority.phase != "HANDOFF":
            raise DeploymentFailure("worker operation requires HANDOFF phase")
        if command.action in (Action.PAUSE, Action.RELEASE) and (
                self.authority.owner_host != node.host_id or self.authority.owner_boot != node.boot_id):
            raise DeploymentFailure("worker operation requires matching owner")
        if command.action is Action.COMPLETE and self.authority.phase not in ("OBSERVE", "PREPARE"):
            raise DeploymentFailure("COMPLETE cannot skip the observation phase")
        changes = {}
        match command.action:
            case Action.STATUS:
                pass
            case Action.PREPARE:
                node = node.model_copy(update={"boot_id": uuid4(), "image": OLD_IMAGE if self.bad_digest else command.image,
                                               "worker": "ACTIVE" if self.candidate_active else "PAUSED", "running": True})
            case Action.BEGIN:
                changes = {"deployment_id": command.deployment_id, "epoch": self.authority.epoch + 1, "phase": "PREPARE"}
            case Action.HANDOFF:
                changes = {"phase": "HANDOFF"}
            case Action.PAUSE:
                node = node.model_copy(update={"worker": "DRAINING" if self.worker_busy else "PAUSED",
                                               "in_flight": 1 if self.worker_busy else 0})
                changes = {"status": "DRAINING"}
            case Action.RELEASE:
                if not node.drained():
                    raise DeploymentFailure("worker is not drained")
                changes = {"owner_host": None, "owner_boot": None, "status": "UNASSIGNED"}
            case Action.ACTIVATE:
                if self.authority.owner_host is not None or not node.drained():
                    raise DeploymentFailure("previous owner has not released")
                node = node.model_copy(update={"worker": "ACTIVE"})
                changes = {"owner_host": node.host_id, "owner_boot": node.boot_id, "status": "ACTIVE"}
            case Action.OBSERVE:
                changes = {"phase": "OBSERVE"}
            case Action.COMPLETE:
                changes = {"phase": "COMPLETE"}
            case Action.STOP_APP:
                if not node.requests_drained():
                    raise DeploymentFailure("requests are still running")
                node = node.model_copy(update={"running": False, "normal_exit": not self.forced_exit})
            case Action.START_EC2 | Action.STOP_EC2 | Action.SWITCH:
                raise DeploymentFailure("not an application operation")
            case unreachable:
                assert_never(unreachable)
        if changes:
            self.authority = self.authority.model_copy(update={**changes, "revision": self.authority.revision + 1})
        healthy = self.old_healthy if slot is Slot.A else self.candidate_healthy
        node = node.model_copy(update={"authority": self.authority, "healthy": healthy})
        self.nodes[slot] = node
        return node


def fixture(directory: Path) -> tuple[Topology, StateStore, Adapters]:
    topology = Topology(environment="test", coordinator_instance_id="i-00000000",
                        a=Host(slot=Slot.A, host_id="a", instance_id="i-aaaaaaaa", upstream="127.0.0.1:18080"),
                        b=Host(slot=Slot.B, host_id="b", instance_id="i-bbbbbbbb", upstream="127.0.0.1:18081"),
                        control=ControlRelease(workflow="backend-app-operation.yml", ref="refs/tags/control-v1", sha="a" * 40))
    store = StateStore(directory)
    clock = FakeClock()
    return topology, store, Adapters(FakeCloud(clock), FakeApps(topology, store, clock), FakeProxy(),
                                     FakeTelemetry(clock), clock)
