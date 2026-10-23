import json
import unittest
from uuid import uuid4

import httpx2
from bluegreen.child_execution import MachineIdentity
from bluegreen.ports import DeploymentFailure
from bluegreen.spring_status import snapshot
from pydantic import SecretStr


class SpringStatusTest(unittest.TestCase):
    def test_actual_counters_are_preserved_and_only_loopback_gets_are_sent(self) -> None:
        # Given
        boot = uuid4()
        requests: list[httpx2.Request] = []

        def respond(request: httpx2.Request) -> httpx2.Response:
            requests.append(request)
            if request.url.path.endswith("readiness"):
                return httpx2.Response(200, content=b'{"status":"UP"}')
            return httpx2.Response(200, content=json.dumps({
                "version": "sha256:" + "1" * 64, "environment": "dev-rehearsal",
                "identity": {"hostId": "app-b", "bootId": str(boot)},
                "worker": {"state": "DRAINING", "inFlight": 2, "unresolved": 1}, "authority": None,
                "activity": {"httpInFlight": 3, "backgroundInFlight": 1, "backgroundDrained": False}}).encode())

        machine = MachineIdentity(environment="dev-rehearsal", host_id="app-b", instance_id="i-0430ff91d1af2fb37")
        with httpx2.Client(transport=httpx2.MockTransport(respond), trust_env=False) as client:
            # When
            actual = snapshot(client, 18081, SecretStr("x" * 32), machine)
        # Then
        self.assertEqual((2, 1, 3, False), (actual.in_flight, actual.unresolved, actual.http_in_flight, actual.background_drained))
        self.assertEqual(boot, actual.boot_id)
        self.assertTrue(actual.healthy)
        self.assertTrue(all(request.method == "GET" and request.url.host == "127.0.0.1" for request in requests))
        self.assertNotIn("X-Jarihana-Worker-Control-Token", requests[1].headers)

    def test_authentication_failure_is_not_a_successful_status(self) -> None:
        # Given
        machine = MachineIdentity(environment="dev-rehearsal", host_id="app-b", instance_id="i-0430ff91d1af2fb37")
        with httpx2.Client(transport=httpx2.MockTransport(lambda _: httpx2.Response(401))) as client:
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = snapshot(client, 18081, SecretStr("x" * 32), machine)

    def test_missing_activity_measurement_is_not_assumed_drained(self) -> None:
        # Given
        machine = MachineIdentity(environment="dev-rehearsal", host_id="app-b", instance_id="i-0430ff91d1af2fb37")
        payload = json.dumps({"version": "sha256:" + "1" * 64, "environment": "dev-rehearsal",
                              "identity": {"hostId": "app-b", "bootId": str(uuid4())},
                              "worker": {"state": "PAUSED", "inFlight": 0, "unresolved": 0}, "authority": None}).encode()
        with httpx2.Client(transport=httpx2.MockTransport(lambda _: httpx2.Response(200, content=payload))) as client:
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = snapshot(client, 18081, SecretStr("x" * 32), machine)
