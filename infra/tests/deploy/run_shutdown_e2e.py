#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# ─── How to run ───
# uv run infra/tests/deploy/run_shutdown_e2e.py
# Requires a local nginx:1.30.5-alpine image; starts uniquely named shell fixtures only.
# ──────────────────
"""Real Docker stop classification; API/authority inputs remain local fixtures."""
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from uuid import uuid4
import json
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/deploy"))
from controller_fakes import NEW_IMAGE, fixture
from bluegreen.docker_runtime import DockerRuntime
from bluegreen.docker_shutdown import ContainerSnapshot, DockerStopper, ShutdownPolicy, StopCall, StopRuntime
from bluegreen.github_operations import authorize
from bluegreen.models import Action, AppStatus, Command, DeploymentState, Phase, Slot
from bluegreen.nginx_switch import ProcessRunner
from bluegreen.ports import DeploymentFailure, SystemClock


@dataclass(frozen=True, slots=True)
class FixtureGrant:
    state: DeploymentState
    clock: SystemClock

    def check(self, command: Command, actual: AppStatus) -> None:
        authorize(command, self.state, self.clock.now())


class ForcedExitDocker(DockerRuntime):
    """Inject SIGKILL only into this script's pinned disposable container."""
    @contextmanager
    def begin_stop(self, container: str) -> Iterator[StopCall]:
        with super().begin_stop(container) as call:
            self.runner.run(("docker", "kill", "--signal", "KILL", "--", container))
            yield call


@contextmanager
def container(script: str) -> Iterator[str]:
    runner = ProcessRunner()
    name = f"jarihana-stop-fixture-{uuid4().hex[:12]}"
    image = runner.run(("docker", "image", "inspect", "nginx:1.30.5-alpine", "--format", "{{.Id}}")).strip()
    identifier = runner.run(("docker", "run", "-d", "--name", name, "--network", "none",
                             "--entrypoint", "sh", image, "-c", script)).strip()
    try:
        # Wait for the shell trap to be installed before exercising the stop adapter.
        runner.run(("docker", "exec", identifier, "sh", "-c", "while [ ! -f /tmp/ready ]; do sleep 0.01; done"))
        yield identifier
    finally:
        # Force-removal is strictly fixture cleanup; the deployment adapter never does this.
        runner.run(("docker", "rm", "--force", identifier))


def run_case(directory: Path, script: str, force_sigkill: bool) -> bool:
    topology, _, adapters = fixture(directory)
    original = adapters.apps.nodes[Slot.A]
    actual = original.model_copy(update={"worker": "PAUSED", "authority": original.authority.model_copy(
        update={"owner_host": topology.b.host_id})})
    clock = SystemClock()
    command = Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=1, parent_attempt=1,
                      phase=Phase.SEALED, action=Action.STOP_APP, host=topology.a, boot_id=actual.boot_id,
                      image=NEW_IMAGE, deadline=clock.now() + timedelta(seconds=30), authority=actual.authority)
    state = DeploymentState(deployment_id=command.deployment_id, session_id=uuid4(), phase=Phase.SEALED,
                            rollback_sealed=True, old=Slot.A, target=Slot.B, old_app=actual, pending=command)
    docker = ForcedExitDocker(ProcessRunner()) if force_sigkill else DockerRuntime(ProcessRunner())
    with container(script) as identifier:
        pin = docker.inspect(identifier).pin()
        stopper = DockerStopper(StopRuntime(docker, clock, FixtureGrant(state, clock)),
                                ShutdownPolicy(wait_seconds=2, poll_seconds=0.05))
        try:
            result = stopper.stop(command, actual, pin)
        except DeploymentFailure:
            after = docker.inspect(identifier)
            if after.running:
                ProcessRunner().run(("docker", "exec", identifier, "test", "-f", "/tmp/term-received"))
            (directory / "rejected.json").write_text(after.model_dump_json(indent=2))
            return False
        (directory / "evidence.json").write_text(result.evidence.model_dump_json(indent=2))
        return result.status.normal_exit


def main() -> None:
    directory = Path(tempfile.mkdtemp(prefix="jarihana-shutdown-e2e-", dir="/private/tmp"))
    print(f"Docker shutdown fixture artifacts: {directory}", flush=True)
    cases = {
        "normal": ("trap 'exit 0' TERM; touch /tmp/ready; while :; do sleep 0.1; done", True, False),
        "sigkill": ("trap '' TERM; touch /tmp/ready; while :; do sleep 0.1; done", False, True),
        "timeout": ("trap 'touch /tmp/term-received' TERM; touch /tmp/ready; while :; do sleep 0.1; done", False, False),
    }
    for name, (script, expected, forced) in cases.items():
        case_directory = directory / name
        case_directory.mkdir()
        if run_case(case_directory, script, forced) != expected:
            raise DeploymentFailure(f"Docker shutdown scenario failed: {name}")
    forced = ContainerSnapshot.model_validate_json((directory / "sigkill/rejected.json").read_text())
    if forced.exit_code != 137 or forced.running:
        raise DeploymentFailure("SIGKILL fixture did not demonstrate forced exit")
    timed_out = ContainerSnapshot.model_validate_json((directory / "timeout/rejected.json").read_text())
    if not timed_out.running:
        raise DeploymentFailure("timed-out process was not preserved")
    report = {"normal_sigterm": True, "sigkill_rejected": True, "timeout_preserved_process": True,
              "real_docker": True, "app_authority": "fixture", "artifacts": str(directory)}
    (directory / "summary.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == "__main__":
    main()
