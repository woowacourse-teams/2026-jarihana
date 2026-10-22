"""Validated configuration generations, real route checks and old-worker drain proof."""
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol
from uuid import uuid4
import os
import subprocess
import tempfile

from pydantic import Field, ValidationError

from .models import DrainTicket, Host, Record, Slot, Topology
from .ports import Clock, DeploymentFailure

# Fixed command only: kernel start ticks avoid PID reuse and wall-clock/NTP changes.
WORKER_SNAPSHOT = r'''
for entry in /proc/[0-9]*; do
    command=$(tr '\000' ' ' < "$entry/cmdline" 2>/dev/null) || continue
    case "$command" in
        "nginx: worker process"*)
            awk '{print $1 ":" $22}' "$entry/stat" 2>/dev/null ;;
    esac
done
'''


class Runner(Protocol):
    def run(self, arguments: tuple[str, ...]) -> str: ...


class ProcessRunner:
    def run(self, arguments: tuple[str, ...]) -> str:
        try:
            return subprocess.run(arguments, check=True, capture_output=True, text=True, timeout=10).stdout
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            raise DeploymentFailure(f"fixed process operation failed: {arguments[0]}") from error


class ApiProbe(Record):
    model_config = {"frozen": True, "extra": "ignore"}
    success: Literal[True]


class NginxSettings(Record):
    directory: Path
    container: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
    probe_port: int = Field(ge=1, le=65535)


@dataclass(frozen=True, slots=True)
class NginxRuntime:
    runner: Runner
    clock: Clock
    topology: Topology


class NginxSwitch:
    def __init__(self, settings: NginxSettings, runtime: NginxRuntime):
        self.settings, self.runtime = settings, runtime
        self.current = settings.directory / "current.conf"
        (settings.directory / "generations").mkdir(parents=True, exist_ok=True)

    def initialize(self, host: Host) -> None:
        if self.current.exists() or self.current.is_symlink():
            raise DeploymentFailure("initial configuration already exists")
        self._publish((self.settings.directory / self._generation(host)).read_text())

    def active(self) -> Slot:
        response = self.runtime.runner.run((
            "curl", "--fail", "--silent", "--show-error", "--include", "--max-time", "2",
            "--header", "Connection: close", "--header", "Cache-Control: no-cache",
            f"http://127.0.0.1:{self.settings.probe_port}/__deployment",
        ))
        try:
            headers, body = response.split("\n\n", 1)
            values = {name.lower(): value.strip() for line in headers.splitlines()[1:]
                      for name, _, value in [line.partition(":")]}
            slot = Slot(values["x-jarihana-slot"])
            expected = self.runtime.topology.host(slot).upstream
            if values["x-jarihana-target"] != expected or not values["x-jarihana-upstream"]:
                raise DeploymentFailure("route marker and configured upstream disagree")
            if expected.split(":")[0].replace(".", "").isdigit() and values["x-jarihana-upstream"] != expected:
                raise DeploymentFailure("actual upstream address differs from the pinned IP")
            ApiProbe.model_validate_json(body)
            return slot
        except (KeyError, ValueError, ValidationError) as error:
            raise DeploymentFailure("fresh upstream API probe did not prove a valid route") from error

    def switch(self, host: Host) -> DrainTicket:
        if host != self.runtime.topology.host(host.slot):
            raise DeploymentFailure("upstream is outside the fixed A/B allowlist")
        previous = self.current.read_text()
        previous_slot = self.active()
        generation = self._generation(host)
        self._nginx("-t", "-c", f"/etc/nginx/deploy/{generation}")
        ticket = DrainTicket(container_id=self._container_id(), workers=self._workers())
        if not ticket.workers:
            raise DeploymentFailure("cannot capture the existing nginx worker generation")
        try:
            self._publish((self.settings.directory / generation).read_text())
            self._reload()
            self._await_slot(host.slot)
        except DeploymentFailure:
            self._publish(previous)
            self._reload()
            self._await_slot(previous_slot)
            raise
        return ticket

    def drained(self, ticket: DrainTicket) -> bool:
        if self._container_id() != ticket.container_id:
            raise DeploymentFailure("nginx restarted; old connection generation is unknown")
        return set(ticket.workers).isdisjoint(self._workers())

    def _generation(self, host: Host) -> Path:
        template = Path(__file__).parents[3] / "deploy/nginx/nginx.conf.template"
        content = template.read_text().replace("@UPSTREAM@", host.upstream).replace("@SLOT@", host.slot.value)
        relative = Path("generations") / f"{uuid4()}.conf"
        with (self.settings.directory / relative).open("x", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        return relative

    def _publish(self, content: str) -> None:
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.settings.directory, delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.current)
            descriptor = os.open(self.settings.directory, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def _nginx(self, *arguments: str) -> None:
        self.runtime.runner.run(("docker", "exec", self.settings.container, "nginx", *arguments))

    def _reload(self) -> None:
        self._nginx("-s", "reload", "-c", "/etc/nginx/deploy/current.conf")

    def _await_slot(self, slot: Slot) -> None:
        deadline = self.runtime.clock.monotonic() + 10
        consecutive = 0
        while self.runtime.clock.monotonic() < deadline:
            try:
                consecutive = consecutive + 1 if self.active() is slot else 0
            except DeploymentFailure:
                consecutive = 0
            if consecutive >= 3:
                return
            self.runtime.clock.sleep(0.1)
        raise DeploymentFailure("nginx reload did not apply the requested route")

    def _container_id(self) -> str:
        return self.runtime.runner.run(("docker", "inspect", "--format", "{{.Id}}", self.settings.container)).strip()

    def _workers(self) -> tuple[str, ...]:
        output = self.runtime.runner.run(("docker", "exec", self.settings.container, "sh", "-c", WORKER_SNAPSHOT))
        workers = tuple(output.splitlines())
        if any(len(parts := item.split(":")) != 2 or not all(part.isdigit() for part in parts) for item in workers):
            raise DeploymentFailure("could not parse the nginx worker process snapshot")
        return workers
