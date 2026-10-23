# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
import unittest
from unittest.mock import patch

from bluegreen.ports import DeploymentFailure
from cloud_finish_runtime import HOST_B, FixtureRelease, replace
from cloud_worker_runtime import Config, Remote
from test_cloud_worker_runtime import source


class CloudFinishRuntimeTest(unittest.TestCase):
    def test_shared_schema_is_rejected(self) -> None:
        # Given / When / Then
        with self.assertRaises(DeploymentFailure):
            _ = FixtureRelease("public", "d" * 64)

    def test_non_uuid_schema_is_rejected(self) -> None:
        # Given / When / Then
        with self.assertRaises(DeploymentFailure):
            _ = FixtureRelease("bg_existing", "d" * 64)

    def test_invalid_jar_identity_is_rejected(self) -> None:
        # Given / When / Then
        with self.assertRaises(DeploymentFailure):
            _ = FixtureRelease("bg_" + "a" * 32, "not-a-hash")

    def test_live_push_source_is_rejected_before_any_remote_change(self) -> None:
        # Given
        value = source()
        unsafe = value.model_copy(update={"Config": Config(
            Env=tuple("PUSH_ENABLED=true" if item == "PUSH_ENABLED=false" else item for item in value.Config.Env))})
        # When / Then
        with patch.object(Remote, "inspect", side_effect=AssertionError("remote must remain untouched")), \
                self.assertRaises(DeploymentFailure), \
                replace(HOST_B, FixtureRelease("bg_" + "a" * 32, "d" * 64), unsafe):
            pass
