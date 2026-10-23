# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
import tempfile
import unittest
from pathlib import Path
from typing import Literal, assert_never, override
from unittest.mock import patch

import cloud_worker_runtime as runtime
from bluegreen.ports import DeploymentFailure
from pydantic import TypeAdapter

type DockerOperation = Literal["inspect", "ps", "update", "rm", "kill", "create", "start"]
type DockerFormat = Literal["{{.HostConfig.RestartPolicy.Name}}", "{{.State.Running}}",
                            "{{.State.OOMKilled}}", "{{.State.ExitCode}}"]


def source() -> runtime.Inspect:
    return runtime.Inspect(Id="source", Image=runtime.IMAGE, Config=runtime.Config(Env=(
        f"DB_URL={runtime.DB_URL}", f"APP_VERSION={runtime.IMAGE}",
        "PUSH_ENABLED=false", "PUSH_WORKER_ENABLED=false",
        "PUSH_WORKER_CONTROL_ENABLED=true", "PUSH_WORKER_ENVIRONMENT=dev-rehearsal",
        "WORKER_CONTROL_TOKEN=fixture-machine-token-0123456789abcdef",
    )))


class TestCloudWorkerRuntime(unittest.TestCase):
    def test_wrong_container_image_is_rejected_before_dev_is_replaced(self) -> None:
        # Given
        unsafe = source().model_copy(update={"Image": "sha256:" + "a" * 64})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = runtime.control_token(unsafe)

    def test_reported_version_must_match_the_pinned_image(self) -> None:
        # Given
        value = source()
        unsafe = value.model_copy(update={"Config": runtime.Config(
            Env=tuple("APP_VERSION=older-image" if item.startswith("APP_VERSION=") else item
                      for item in value.Config.Env))})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = runtime.control_token(unsafe)

    def test_live_push_configuration_is_rejected(self) -> None:
        # Given
        value = source()
        unsafe = value.model_copy(update={"Config": runtime.Config(
            Env=tuple("PUSH_ENABLED=true" if item == "PUSH_ENABLED=false" else item
                      for item in value.Config.Env))})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = runtime.control_token(unsafe)

    def test_wrong_database_is_rejected(self) -> None:
        # Given
        value = source()
        unsafe = value.model_copy(update={"Config": runtime.Config(
            Env=tuple("DB_URL=jdbc:postgresql://wrong/jarihana_prod" if item.startswith("DB_URL=") else item
                      for item in value.Config.Env))})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = runtime.control_token(unsafe)

    def test_original_dev_is_restarted_even_when_candidate_exit_is_abnormal(self) -> None:
        # Given
        running = {"source": True, "candidate": False}
        calls: list[tuple[str, ...]] = []

        def docker(*command: str, payload: str | None = None) -> str:
            _ = payload
            operation = TypeAdapter(DockerOperation).validate_python(command[0])
            match operation:
                case "inspect":
                    inspection_format = TypeAdapter(DockerFormat).validate_python(command[2])
                    match inspection_format:
                        case "{{.HostConfig.RestartPolicy.Name}}":
                            return "unless-stopped"
                        case "{{.State.Running}}":
                            return str(running[command[3]]).lower()
                        case "{{.State.OOMKilled}}":
                            return "false"
                        case "{{.State.ExitCode}}":
                            return "1" if command[3] == "candidate" else "0"
                        case _:
                            assert_never(inspection_format)
                case "ps" | "update" | "rm":
                    return ""
                case "kill":
                    running[command[-1]] = False
                    return ""
                case "create":
                    return "candidate"
                case "start":
                    running[command[1]] = True
                    return ""
                case _:
                    assert_never(operation)

        class FakeRemote(runtime.Remote):
            @override
            def inspect(self, container: str) -> runtime.Inspect:
                return source().model_copy(update={"Id": "candidate" if container == "candidate" else "source"})

            @override
            def docker(self, *command: str, payload: str | None = None) -> str:
                calls.append(command)
                return docker(*command, payload=payload)

            @override
            def run(self, *command: str, payload: str | None = None) -> str:
                _ = command, payload
                return "ORIGINAL_DEV_RESTORED"

        with tempfile.TemporaryDirectory() as temporary, \
                patch.object(runtime, "A", FakeRemote("fixture", "i-aaaaaaaa")), \
                patch.object(runtime, "copy_image"):
            # When
            with self.assertRaises(DeploymentFailure), \
                    runtime.candidate_a(source(), Path(temporary) / "recovery.json"):
                pass
            # Then
            self.assertTrue(running["source"])
            self.assertIn(("update", "--restart=unless-stopped", "source"), calls)
            self.assertIn(("start", "source"), calls)
