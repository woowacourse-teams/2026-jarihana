import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("deployment", Path(__file__).with_name("deploy-bluegreen.py"))
deployment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deployment)


class Fixture(deployment.Deployment):
    def __init__(self, directory, failure=None):
        super().__init__(directory, "new-tag", "/unused", drain=1, attempts=1)
        self.failure = failure
        self.operations = []
        self.switched = False
        self.failed = False

    def compose(self, *args):
        self.operations.append(args)
        if args[-1] == "reload":
            self.switched = self.config_file.read_text() == deployment.nginx_config("green")
        if self.failure == "reload" and self.switched and not self.failed:
            self.failed = True
            raise RuntimeError("injected reload failure")
        if self.failure == "stop" and args[0] == "stop":
            raise RuntimeError("injected stop failure")

    def health(self, color):
        self.operations.append(("health", color))
        if self.failure == "readiness" and color == "green":
            raise RuntimeError("injected listener not ready")
        if self.failure == "drain" and self.switched:
            raise RuntimeError("injected health failure during drain")

    def probe(self, color, port):
        self.operations.append(("probe", color, port))
        if self.failure == "smoke" and color == "green" and port == 8080:
            raise RuntimeError("injected routed smoke failure")


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name).resolve()
        (self.directory / "proxy").mkdir()
        (self.directory / "migration-approved").touch()
        self.initial = {"active": "blue", "tags": {"blue": "old-tag", "green": "older-tag"}}
        self.state = self.directory / "state.json"
        self.state.write_text(json.dumps(self.initial))
        (self.directory / "proxy/nginx.conf").write_text(deployment.nginx_config("blue"))
        sleeper = patch.object(deployment.time, "sleep")
        sleeper.start()
        self.addCleanup(sleeper.stop)

    def assert_preserved(self, fixture):
        self.assertEqual(json.loads(self.state.read_text()), self.initial)
        self.assertEqual(fixture.config_file.read_text(), deployment.nginx_config("blue"))
        self.assertFalse(any(op[0] == "stop" for op in fixture.operations))

    def test_success_commits_state_then_stops_only_old(self):
        fixture = Fixture(self.directory)
        fixture.deploy()
        self.assertEqual(json.loads(self.state.read_text()), {
            "active": "green", "tags": {"blue": "old-tag", "green": "new-tag"}})
        self.assertEqual(fixture.operations[-1], ("stop", "--timeout", "45", "backend-blue"))
        self.assertIn(("probe", "green", 28080), fixture.operations)
        self.assertEqual(fixture.env["BLUE_TAG"], "old-tag")
        self.assertEqual(fixture.env["GREEN_TAG"], "new-tag")

    def test_listener_not_ready_keeps_old_route_and_state(self):
        fixture = Fixture(self.directory, "readiness")
        with self.assertRaises(RuntimeError):
            fixture.deploy()
        self.assert_preserved(fixture)

    def test_reload_failure_restores_route_and_state(self):
        fixture = Fixture(self.directory, "reload")
        with self.assertRaises(RuntimeError):
            fixture.deploy()
        self.assert_preserved(fixture)
        self.assertEqual(fixture.operations[-1], ("probe", "blue", 8080))

    def test_smoke_failure_restores_route_and_state(self):
        fixture = Fixture(self.directory, "smoke")
        with self.assertRaises(RuntimeError):
            fixture.deploy()
        self.assert_preserved(fixture)

    def test_health_failure_during_overlap_restores_old(self):
        fixture = Fixture(self.directory, "drain")
        with self.assertRaises(RuntimeError):
            fixture.deploy()
        self.assert_preserved(fixture)

    def test_state_write_failure_restores_old(self):
        fixture = Fixture(self.directory)
        write = deployment.atomic_write
        def fail_state(path, value):
            if path == self.state:
                raise OSError("injected disk error")
            write(path, value)
        with patch.object(deployment, "atomic_write", side_effect=fail_state):
            with self.assertRaises(OSError):
                fixture.deploy()
        self.assert_preserved(fixture)

    def test_stop_failure_keeps_committed_new_route(self):
        fixture = Fixture(self.directory, "stop")
        with self.assertRaises(RuntimeError):
            fixture.deploy()
        self.assertEqual(json.loads(self.state.read_text())["active"], "green")
        self.assertEqual(fixture.config_file.read_text(), deployment.nginx_config("green"))

    def test_missing_migration_marker_makes_no_docker_calls(self):
        (self.directory / "migration-approved").unlink()
        fixture = Fixture(self.directory)
        with self.assertRaises(RuntimeError):
            fixture.deploy()
        self.assertEqual(fixture.operations, [])

    def test_crash_state_mismatch_fails_before_mutation(self):
        fixture = Fixture(self.directory)
        fixture.config_file.write_text(deployment.nginx_config("green"))
        with self.assertRaises(RuntimeError):
            fixture.deploy()
        self.assertEqual(fixture.operations, [])

    def test_atomic_write_failure_leaves_previous_file(self):
        with patch.object(deployment.os, "replace", side_effect=OSError("injected rename error")):
            with self.assertRaises(OSError):
                deployment.atomic_write(self.state, "invalid")
        self.assertEqual(json.loads(self.state.read_text()), self.initial)

    def test_proxy_config_preserves_upgrade_and_bounded_drain(self):
        config = deployment.nginx_config("green")
        for required in ("proxy_pass http://127.0.0.1:28080", "proxy_set_header Upgrade $http_upgrade",
                         "worker_shutdown_timeout 120s", "X-Jarihana-Color green"):
            self.assertIn(required, config)

    def test_initialize_creates_config_without_approving_migration(self):
        target = self.directory / "fresh"
        deployment.initialize(target, "blue", "old-tag")
        self.assertEqual(json.loads((target / "state.json").read_text())["active"], "blue")
        self.assertFalse((target / "migration-approved").exists())
        self.assertEqual((target / "proxy/nginx.conf").read_text(), deployment.nginx_config("blue"))
        with self.assertRaises(RuntimeError):
            deployment.initialize(target, "green", "new-tag")
        self.assertEqual(json.loads((target / "state.json").read_text())["active"], "blue")


if __name__ == "__main__":
    unittest.main(verbosity=2)
