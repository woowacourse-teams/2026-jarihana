"""Safety checks for the recovery path; Docker and AWS are never contacted."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("dev-db-drill.sh")
CONTAINER_ID = "0123456789abcdef"


class DevDbDrillRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        binary = self.root / "bin"
        binary.mkdir()
        docker = binary / "docker"
        docker.write_text("""#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  inspect)
    case "$3" in
      *compose.project*) printf '%s\\n' "$FAKE_PROJECT" ;;
      *compose.service*) printf '%s\\n' "$FAKE_SERVICE" ;;
      *State.Status*) cat "$FAKE_STATUS_FILE" ;;
      *State.Health.Status*) echo healthy ;;
      *) exit 2 ;;
    esac ;;
  start)
    printf '%s\\n' "$2" >> "$FAKE_START_LOG"
    echo running > "$FAKE_STATUS_FILE" ;;
  *) exit 2 ;;
esac
""")
        docker.chmod(0o755)
        curl = binary / "curl"
        curl.write_text("#!/usr/bin/env bash\nprintf '200'\n")
        curl.chmod(0o755)
        self.status = self.root / "status"
        self.status.write_text("exited\n")
        self.start_log = self.root / "starts"
        (self.root / "jarihana-dev-db-drill-container-id").write_text(CONTAINER_ID)
        self.environment = os.environ.copy()
        self.environment.update({
            "PATH": f"{binary}:{os.environ['PATH']}",
            "RUNNER_TEMP": str(self.root),
            "FAKE_PROJECT": "jarihana-dev",
            "FAKE_SERVICE": "postgres",
            "FAKE_STATUS_FILE": str(self.status),
            "FAKE_START_LOG": str(self.start_log),
        })

    def run_restore(self):
        return subprocess.run(["bash", str(SCRIPT), "restore"], env=self.environment,
                              capture_output=True, text=True, timeout=10)

    def test_restore_starts_only_label_verified_dev_db(self):
        result = self.run_restore()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(CONTAINER_ID + "\n", self.start_log.read_text())
        self.assertIn("Dev DB healthy; GET /api/groups = 200", result.stdout)

    def test_restore_refuses_a_prod_project_container(self):
        self.environment["FAKE_PROJECT"] = "jarihana-prod"
        result = self.run_restore()
        self.assertNotEqual(0, result.returncode)
        self.assertFalse(self.start_log.exists())

    def test_restore_refuses_another_dev_service(self):
        self.environment["FAKE_SERVICE"] = "backend"
        result = self.run_restore()
        self.assertNotEqual(0, result.returncode)
        self.assertFalse(self.start_log.exists())


if __name__ == "__main__":
    unittest.main()
