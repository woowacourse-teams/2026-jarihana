"""Atomic, fsynced journal with independent controller and state-write locks."""
from contextlib import contextmanager
from collections.abc import Iterator
from pathlib import Path
import fcntl
import os
import tempfile

from .models import DeploymentState, Phase


class StateConflict(RuntimeError):
    """A deployment must be reconciled instead of overwriting its journal."""


class StateStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = directory / "state.json"

    @contextmanager
    def lock(self, name: str = "controller") -> Iterator[None]:
        with (self.directory / f"{name}.lock").open("a", encoding="utf-8") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise StateConflict("another controller or state writer holds the lock") from error
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def read(self) -> DeploymentState | None:
        try:
            raw = self.path.read_bytes()
        except FileNotFoundError:
            return None
        return DeploymentState.model_validate_json(raw)

    def create(self, state: DeploymentState) -> DeploymentState:
        with self.lock("state"):
            current = self.read()
            if current is not None and current.phase not in (Phase.COMPLETE, Phase.ROLLED_BACK):
                raise StateConflict("unfinished deployment requires reconciliation")
            if current is not None and current.pending is not None:
                raise StateConflict("outstanding command blocks a new deployment")
            self._write(state)
        return state

    def save(self, previous: DeploymentState, changed: DeploymentState) -> DeploymentState:
        with self.lock("state"):
            current = self.read()
            if current != previous:
                raise StateConflict("deployment revision changed")
            if changed.deployment_id != previous.deployment_id or changed.revision != previous.revision + 1:
                raise StateConflict("invalid deployment revision")
            self._write(changed)
        return changed

    def update(self, previous: DeploymentState, *, phase: Phase, reason: str = "") -> DeploymentState:
        return self.save(previous, previous.model_copy(update={
            "revision": previous.revision + 1, "phase": phase, "reason": reason,
        }))

    def _write(self, state: DeploymentState) -> None:
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.directory, delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(state.model_dump_json(indent=2))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
            descriptor = os.open(self.directory, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
