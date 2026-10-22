"""Disposable Docker/JVM resources used only by the explicit local e2e command."""
from pathlib import Path
from ipaddress import ip_network
from typing import assert_never
from uuid import uuid4
import subprocess
import time

from controller_fakes import FakeApps, FakeCloud, FakeClock, FakeTelemetry, OLD_IMAGE
from local_spring import SpringNode
from bluegreen.models import (Action, Command, ControlRelease, Host, Phase, Slot, Topology)
from bluegreen.nginx_switch import NginxRuntime, NginxSettings, NginxSwitch, ProcessRunner
from bluegreen.ports import Adapters, DeploymentFailure, SystemClock
from bluegreen.state_store import StateStore
from bluegreen.github_operations import authorize_local_process


class FixtureRunner(ProcessRunner):
    def __init__(self, directory: Path):
        self.directory = directory

    def run(self, arguments: tuple[str, ...]) -> str:
        try:
            return super().run(arguments)
        except DeploymentFailure as error:
            cause = error.__cause__
            if arguments[0] == "docker" and isinstance(cause, subprocess.CalledProcessError):
                (self.directory / "docker-error.log").write_text(str(cause.stderr))
            raise


class LocalApps(FakeApps):
    def __init__(self, topology: Topology, store: StateStore, clock: FakeClock):
        super().__init__(topology, store, clock)
        self.processes: dict[Slot, SpringNode] = {}

    def _apply(self, command: Command):
        node = self.processes[command.host.slot]
        if command.action is not Action.PREPARE:
            authorize_local_process(command, node.snapshot())
        match command.action:
            case Action.STATUS:
                return node.snapshot()
            case Action.PREPARE:
                node.start(command.image)
                return node.snapshot()
            case Action.STOP_APP:
                return node.stop()
            case Action.BEGIN | Action.HANDOFF | Action.PAUSE | Action.RELEASE | Action.ACTIVATE | Action.OBSERVE | Action.COMPLETE:
                return node.control(command)
            case Action.START_EC2 | Action.STOP_EC2 | Action.SWITCH:
                raise DeploymentFailure("not a local application operation")
            case unreachable:
                assert_never(unreachable)


class LocalRuntime:
    def __init__(self, directory: Path):
        self.directory = directory
        self.runner = FixtureRunner(directory)
        self.prefix = f"jarihana-bg-{uuid4().hex[:10]}"
        self.containers: list[str] = []
        self.nodes: dict[Slot, SpringNode] = {}
        self.network = ""

    def docker(self, *arguments: str) -> str:
        return self.runner.run(("docker", *arguments)).strip()

    def setup(self):
        self.network = self.prefix + "-network"
        self.docker("network", "create", self.network)
        subnet = ip_network(self.docker("network", "inspect", "--format", "{{(index .IPAM.Config 0).Subnet}}", self.network))
        self.docker("network", "rm", self.network)
        self.docker("network", "create", "--subnet", str(subnet), self.network)
        database_name = self.prefix + "-postgres"
        self.docker("run", "-d", "--name", database_name, "--network", self.network, "-e", "POSTGRES_USER=fixture",
                    "-e", "POSTGRES_PASSWORD=fixture", "-e", "POSTGRES_DB=bluegreen_fixture",
                    "-p", "127.0.0.1::5432", "postgres:17")
        self.containers.append(database_name)
        deadline = time.monotonic() + 30
        while True:
            try:
                self.docker("exec", database_name, "pg_isready", "-U", "fixture")
                break
            except DeploymentFailure:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
        database = f"jdbc:postgresql://{database_name}:5432/bluegreen_fixture"
        topology = Topology(environment="local-e2e", coordinator_instance_id="i-00000000",
                            a=Host(slot=Slot.A, host_id="a", instance_id="i-aaaaaaaa",
                                   upstream=f"{subnet.network_address + 10}:8080"),
                            b=Host(slot=Slot.B, host_id="b", instance_id="i-bbbbbbbb",
                                   upstream=f"{subnet.network_address + 11}:8080"),
                            control=ControlRelease(workflow="local-fixture", ref="refs/tags/fixture", sha="a" * 40))
        self.nodes = {slot: SpringNode(topology.host(slot), database, self.directory) for slot in Slot}
        for slot, node in self.nodes.items():
            node.container = f"{self.prefix}-{slot.value.lower()}"
            node.network = self.network
        self.nodes[Slot.A].start(OLD_IMAGE)
        self._bootstrap(self.nodes[Slot.A])
        store = StateStore(self.directory / "state")
        clock = FakeClock()
        apps = LocalApps(topology, store, clock)
        apps.processes = self.nodes
        proxy, public_port = self.start_proxy(topology)
        return topology, store, Adapters(FakeCloud(clock), apps, proxy, FakeTelemetry(clock), clock), public_port

    def start_proxy(self, topology: Topology) -> tuple[NginxSwitch, int]:
        nginx_name = self.prefix + "-nginx"
        config_directory = self.directory / "nginx"
        initial = NginxSwitch(NginxSettings(directory=config_directory, container=nginx_name, probe_port=1),
                               NginxRuntime(self.runner, SystemClock(), topology))
        initial.initialize(topology.a)
        image = self.docker("image", "inspect", "--format", "{{.Id}}", "nginx:1.30.5-alpine")
        network_arguments = ("--network", self.network) if self.network else ()
        self.docker("run", "-d", "--name", nginx_name, *network_arguments, "-p", "127.0.0.1::8080", "-p", "127.0.0.1::8082",
                    "-v", f"{config_directory}:/etc/nginx/deploy:ro", image,
                    "nginx", "-c", "/etc/nginx/deploy/current.conf", "-g", "daemon off;")
        self.containers.append(nginx_name)
        probe_port = int(self.docker("port", nginx_name, "8082/tcp").rsplit(":", 1)[1])
        public_port = int(self.docker("port", nginx_name, "8080/tcp").rsplit(":", 1)[1])
        proxy = NginxSwitch(NginxSettings(directory=config_directory, container=nginx_name, probe_port=probe_port),
                             NginxRuntime(self.runner, SystemClock(), topology))
        deadline = time.monotonic() + 15
        while True:
            try:
                proxy.active()
                break
            except DeploymentFailure:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
        return proxy, public_port

    def _bootstrap(self, node: SpringNode) -> None:
        deployment_id = uuid4()
        for action in (Action.BEGIN, Action.HANDOFF, Action.ACTIVATE, Action.OBSERVE, Action.COMPLETE):
            status = node.snapshot()
            node.control(Command(command_id=uuid4(), deployment_id=deployment_id, parent_run_id=1, parent_attempt=1,
                                 phase=Phase.PREPARING, action=action, host=node.host, boot_id=status.boot_id,
                                 image=OLD_IMAGE, deadline=FakeClock().now(), authority=status.authority))

    def close(self) -> None:
        try:
            for node in self.nodes.values():
                node.close()
        finally:
            for name in reversed(self.containers):
                logs = subprocess.run(("docker", "logs", name), capture_output=True, text=True, timeout=10)
                (self.directory / f"{name}.log").write_text(logs.stdout + logs.stderr)
                subprocess.run(("docker", "rm", "--force", name), check=True, capture_output=True, timeout=30)
            if self.network:
                self.docker("network", "rm", self.network)
