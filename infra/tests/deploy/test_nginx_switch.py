from pathlib import Path
import tempfile
import unittest

from controller_fakes import FakeClock, fixture
from bluegreen.models import Slot
from bluegreen.nginx_switch import NginxRuntime, NginxSettings, NginxSwitch
from bluegreen.ports import DeploymentFailure


class ProcessFixture:
    def __init__(self, directory: Path, topology):
        self.directory, self.topology = directory, topology
        self.loaded = Slot.A
        self.container_id = "container-1"
        self.worker = "100"
        self.reject_candidate = False
        self.ignore_candidate_reload = False
        self.reloads = 0

    def run(self, arguments: tuple[str, ...]) -> str:
        match arguments:  # noqa: MATCH_OK — argv is an open tuple; the final case rejects all unknown commands.
            case ("curl", *_):
                host = self.topology.host(self.loaded)
                return (f"HTTP/1.1 200 OK\nX-Jarihana-Slot: {host.slot.value}\n"
                        f"X-Jarihana-Target: {host.upstream}\nX-Jarihana-Upstream: {host.upstream}\n\n"
                        '{"success":true,"data":{}}')
            case ("docker", "inspect", *_):
                return self.container_id
            case ("docker", "exec", _, "sh", "-c", _):
                return f"{self.worker}:12345\n"
            case ("docker", "exec", _, "nginx", "-t", *_):
                if self.reject_candidate:
                    raise DeploymentFailure("nginx configuration rejected")
                return ""
            case ("docker", "exec", _, "nginx", "-s", "reload", *_):
                self.reloads += 1
                config = (self.directory / "current.conf").read_text()
                if "X-Jarihana-Slot B" in config and not self.ignore_candidate_reload:
                    self.loaded = Slot.B
                if "X-Jarihana-Slot A" in config:
                    self.loaded = Slot.A
                self.worker = str(int(self.worker) + 1)
                return ""
            case _:  # Fixed argv allowlist; arbitrary tuples are rejected at this test boundary.
                raise AssertionError(arguments)


class NginxSwitchTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.topology, _, _ = fixture(root / "state")
        self.runner = ProcessFixture(root, self.topology)
        self.proxy = NginxSwitch(NginxSettings(directory=root, container="test-nginx", probe_port=8082),
                                 NginxRuntime(self.runner, FakeClock(), self.topology))
        self.proxy.initialize(self.topology.a)

    def test_invalid_candidate_does_not_publish_or_reload(self):
        # Given
        previous = self.proxy.current.read_text()
        self.runner.reject_candidate = True
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.proxy.switch(self.topology.b)
        self.assertEqual(previous, self.proxy.current.read_text())
        self.assertEqual(0, self.runner.reloads)
        self.assertEqual(Slot.A, self.proxy.active())

    def test_reload_without_candidate_route_restores_previous_configuration(self):
        # Given
        previous = self.proxy.current.read_text()
        self.runner.ignore_candidate_reload = True
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.proxy.switch(self.topology.b)
        self.assertEqual(previous, self.proxy.current.read_text())
        self.assertEqual(Slot.A, self.proxy.active())

    def test_switch_captures_worker_generation_and_container_restart_is_not_a_drain_proof(self):
        # Given / When
        ticket = self.proxy.switch(self.topology.b)
        # Then
        self.assertEqual(Slot.B, self.proxy.active())
        self.assertTrue(self.proxy.drained(ticket))
        self.runner.container_id = "restarted-container"
        with self.assertRaises(DeploymentFailure):
            self.proxy.drained(ticket)
