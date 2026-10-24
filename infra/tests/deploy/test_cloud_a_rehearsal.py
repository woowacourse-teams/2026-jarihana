import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bluegreen.models import Record
from run_cloud_prepare_a import create_candidate


class CapturedCreate(Record):
    value: str
    args: tuple[str, ...]


class CloudARehearsalTest(unittest.TestCase):
    def test_candidate_inherits_multiline_secret_without_command_line_value(self) -> None:
        # Given: a real executable at the Docker process boundary records dummy input.
        secret = "first line\nsecond line"
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "docker"
            _ = executable.write_text(f"#!{sys.executable}\nimport json, os, sys\n" +
                                      "print(json.dumps({'value': os.environ['TEST_SECRET'], 'args': sys.argv[1:]}))\n")
            executable.chmod(0o700)
            with patch.dict(os.environ, {"PATH": directory}):
                # When
                output = create_candidate({"TEST_SECRET": secret})
            # Then
            captured = CapturedCreate.model_validate_json(output)
            self.assertEqual(secret, captured.value)
            self.assertIn("TEST_SECRET", captured.args)
            self.assertNotIn(secret, captured.args)

    def test_prepare_rejects_arguments_before_accessing_docker(self) -> None:
        # Given
        script = Path(__file__).with_name("run_cloud_prepare_a.py")
        # When
        result = subprocess.run((sys.executable, str(script), "unexpected"),
                                capture_output=True, text=True, check=False, timeout=10)
        # Then
        self.assertNotEqual(0, result.returncode)
        self.assertIn("not the dev rehearsal A machine", result.stderr)
        self.assertNotIn("FileNotFoundError", result.stderr)

    def test_restore_rejects_arguments_before_reading_recovery_file(self) -> None:
        # Given
        script = Path(__file__).with_name("run_cloud_restore_a.py")
        # When
        result = subprocess.run((sys.executable, str(script), "unexpected"),
                                capture_output=True, text=True, check=False, timeout=10)
        # Then
        self.assertNotEqual(0, result.returncode)
        self.assertIn("not the A rehearsal machine", result.stderr)
        self.assertNotIn("FileNotFoundError", result.stderr)
