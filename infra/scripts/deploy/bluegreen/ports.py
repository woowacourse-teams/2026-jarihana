"""Narrow capabilities; AWS/GitHub transport integration belongs to the next step."""
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Protocol
import time
import math

from .models import Command, DrainTicket, Host, Receipt, RunIdentity, Slot


class DeploymentFailure(RuntimeError):
    """A check failed; destructive cleanup is forbidden."""


class UnknownResult(DeploymentFailure):
    """A command may have executed; it must not be blindly dispatched again."""


class Health(StrEnum):
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class Clock(Protocol):
    def now(self) -> datetime: ...
    def monotonic(self) -> float: ...
    def sleep(self, seconds: float) -> None: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)

    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


class Cloud(Protocol):
    def start(self, host: Host) -> None: ...
    def running(self, host: Host) -> bool: ...
    def stop(self, host: Host) -> None: ...
    def stopped(self, host: Host) -> bool: ...


class Applications(Protocol):
    def dispatch(self, command: Command) -> RunIdentity | None: ...
    def find(self, command: Command) -> tuple[RunIdentity, ...]: ...
    def poll(self, run: RunIdentity) -> Receipt | None: ...
    def cancel(self, run: RunIdentity) -> None: ...


class Proxy(Protocol):
    def active(self) -> Slot: ...
    def switch(self, host: Host) -> DrainTicket: ...
    def drained(self, ticket: DrainTicket) -> bool: ...


class Telemetry(Protocol):
    def health(self, host: Host) -> Health: ...


@dataclass(frozen=True, slots=True)
class Adapters:
    cloud: Cloud
    apps: Applications
    proxy: Proxy
    telemetry: Telemetry
    clock: Clock


@dataclass(frozen=True, slots=True)
class Policy:
    """Draft waits; 900-second observation is the agreed minimum."""
    poll_seconds: float = 5
    command_seconds: float = 300
    startup_seconds: float = 600
    worker_drain_seconds: float = 120
    http_drain_seconds: float = 300
    observation_seconds: float = 900
    consecutive_failures: int = 3
    clock_skew_seconds: float = 5
    total_seconds: float = 3600
    recovery_reserve_seconds: float = 600

    def __post_init__(self) -> None:
        waits = (self.poll_seconds, self.command_seconds, self.startup_seconds, self.worker_drain_seconds,
                 self.http_drain_seconds, self.observation_seconds, self.total_seconds,
                 self.recovery_reserve_seconds, self.clock_skew_seconds)
        if not all(math.isfinite(value) and value > 0 for value in waits):
            raise DeploymentFailure("wait limits must be positive")
        if self.observation_seconds < 900 or self.consecutive_failures < 1:
            raise DeploymentFailure("observation requires at least 900 seconds and a failure threshold")
