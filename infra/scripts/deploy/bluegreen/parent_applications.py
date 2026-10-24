from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from .models import Command, Receipt, RunIdentity
from .ports import Applications, Clock, DeploymentFailure


@dataclass(frozen=True, slots=True)
class ParentBudget:
    clock: Clock
    deadline: datetime
    monotonic_deadline: float

    def check(self, command_deadline: datetime | None) -> None:
        if (self.clock.now() >= self.deadline or self.clock.monotonic() >= self.monotonic_deadline
                or (command_deadline is not None and command_deadline > self.deadline)):
            raise DeploymentFailure("round-trip budget cannot accommodate this command")


@dataclass(frozen=True, slots=True)
class ParentApplications:
    """Recheck the live parent and overall budget around every child exchange."""

    delegate: Applications
    verify: Callable[[datetime | None], None]

    def dispatch(self, command: Command) -> RunIdentity | None:
        self.verify(command.deadline)
        result = self.delegate.dispatch(command)
        self.verify(command.deadline)
        return result

    def find(self, command: Command) -> tuple[RunIdentity, ...]:
        self.verify(command.deadline)
        result = self.delegate.find(command)
        self.verify(command.deadline)
        return result

    def poll(self, run: RunIdentity) -> Receipt | None:
        self.verify(None)
        result = self.delegate.poll(run)
        self.verify(None)
        return result

    def cancel(self, run: RunIdentity) -> None:
        self.verify(None)
        self.delegate.cancel(run)
