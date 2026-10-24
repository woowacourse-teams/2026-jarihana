import subprocess
import sys
import unittest
from pathlib import Path


class CloudARehearsalTest(unittest.TestCase):
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
