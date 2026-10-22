"""Fixed Docker commands; never print container environment or escalate to SIGKILL."""
from collections.abc import Iterator
from contextlib import contextmanager
import subprocess
from typing import Final

from pydantic import ValidationError

from .docker_shutdown import ContainerSnapshot, StopCall
from .nginx_switch import Runner
from .ports import DeploymentFailure

INSPECT_FORMAT: Final = '''{
"container_id":{{json .Id}},"image_id":{{json .Image}},
"started_at":{{json .State.StartedAt}},"restart_count":{{json .RestartCount}},
"running":{{json .State.Running}},"paused":{{json .State.Paused}},
"restarting":{{json .State.Restarting}},"dead":{{json .State.Dead}},
"oom_killed":{{json .State.OOMKilled}},"exit_code":{{json .State.ExitCode}},
"finished_at":{{json .State.FinishedAt}},"auto_remove":{{json .HostConfig.AutoRemove}}
}'''


class DockerRuntime:
    def __init__(self, runner: Runner):
        self.runner = runner

    def inspect(self, container: str) -> ContainerSnapshot:
        # Internal callers supply only a pinned full ID or the local fixture's configured name.
        raw = self.runner.run(("docker", "inspect", "--format", INSPECT_FORMAT, "--", container))
        try:
            return ContainerSnapshot.model_validate_json(raw)
        except ValidationError as error:
            raise DeploymentFailure("Docker process snapshot failed schema validation") from error

    @contextmanager
    def begin_stop(self, container: str) -> Iterator[StopCall]:
        # Only a full ID can reach the mutation, never a re-used container name.
        if len(container) != 64 or any(character not in "0123456789abcdef" for character in container):
            raise DeploymentFailure("Docker shutdown requires a pinned full container ID")
        with subprocess.Popen(("docker", "stop", "--signal", "SIGTERM", "--timeout", "-1", "--", container),
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as process:
            try:
                yield process
            finally:
                if process.poll() is None:
                    # Stop the local waiting CLI only; this does not signal the app container.
                    process.terminate()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=2)
