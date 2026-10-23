"""Failure boundaries for machine identity and uncached coordinator reads."""
import subprocess
import unittest
from ipaddress import IPv4Address
from pathlib import Path
from typing import BinaryIO
from unittest.mock import patch
from uuid import uuid4

import httpx2
from bluegreen.ec2_identity import local_machine
from bluegreen.models import DeploymentState, Phase
from bluegreen.ports import DeploymentFailure
from bluegreen.ssh_journal import SshJournal


class MetadataIdentityTest(unittest.TestCase):
    def test_token_is_used_only_for_the_local_instance_lookup(self) -> None:
        # Given
        requests: list[httpx2.Request] = []

        def respond(request: httpx2.Request) -> httpx2.Response:
            requests.append(request)
            return httpx2.Response(200, content=b"session-token" if request.method == "PUT"
                                   else b"i-0430ff91d1af2fb37")

        with httpx2.Client(transport=httpx2.MockTransport(respond), trust_env=False) as client:
            # When
            actual = local_machine(client, "dev-rehearsal", "app-b")
        # Then
        self.assertEqual("i-0430ff91d1af2fb37", actual.instance_id)
        self.assertEqual(["PUT", "GET"], [request.method for request in requests])
        self.assertEqual("session-token", requests[1].headers["X-aws-ec2-metadata-token"])
        self.assertTrue(all(request.url.host == "169.254.169.254" for request in requests))

    def test_token_failure_does_not_fall_back_to_unauthenticated_metadata(self) -> None:
        # Given
        requests: list[httpx2.Request] = []

        def reject(request: httpx2.Request) -> httpx2.Response:
            requests.append(request)
            return httpx2.Response(403)

        with httpx2.Client(transport=httpx2.MockTransport(reject), trust_env=False) as client:
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = local_machine(client, "dev-rehearsal", "app-b")
        self.assertEqual(1, len(requests))

    def test_redirect_is_not_followed_and_token_is_not_forwarded(self) -> None:
        # Given
        requests: list[httpx2.Request] = []

        def redirect(request: httpx2.Request) -> httpx2.Response:
            requests.append(request)
            return httpx2.Response(302, headers={"Location": "https://other.example"})

        with httpx2.Client(transport=httpx2.MockTransport(redirect), follow_redirects=True) as client:
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = local_machine(client, "dev-rehearsal", "app-b")
        self.assertEqual(1, len(requests))

    def test_invalid_or_oversized_metadata_is_rejected(self) -> None:
        # Given
        for body in (b"invalid", b"i-0430ff91d1af2fb37\n", b"x" * 1025):
            def respond(request: httpx2.Request, payload: bytes = body) -> httpx2.Response:
                return httpx2.Response(200, content=b"session-token" if request.method == "PUT" else payload)

            with self.subTest(body_size=len(body)), httpx2.Client(transport=httpx2.MockTransport(respond)) as client:
                # When / Then
                with self.assertRaises(DeploymentFailure):
                    _ = local_machine(client, "dev-rehearsal", "app-b")


class SshJournalFailureTest(unittest.TestCase):
    @property
    def reader(self) -> SshJournal:
        return SshJournal(IPv4Address("10.0.3.51"), Path("key"), Path("known_hosts"))

    def test_worker_grant_uses_its_separate_forced_command_account(self) -> None:
        initial = DeploymentState(deployment_id=uuid4(), session_id=uuid4())

        def respond(command: tuple[str, ...], *, stdout: BinaryIO,
                    **_options: int | bool) -> subprocess.CompletedProcess[bytes]:
            self.assertIn("jarihana-worker-grant@10.0.3.51", command)
            self.assertNotIn("jarihana-grant@10.0.3.51", command)
            _ = stdout.write(initial.model_dump_json().encode())
            return subprocess.CompletedProcess(command, 0)

        reader = SshJournal(IPv4Address("10.0.3.51"), Path("key"), Path("known_hosts"), account="jarihana-worker-grant")
        with patch("bluegreen.ssh_journal.subprocess.run", side_effect=respond):
            actual = reader.read()

        self.assertEqual(initial, actual)

    def test_authentication_host_key_or_transport_failure_cannot_authorize(self) -> None:
        # Given
        with patch("bluegreen.ssh_journal.subprocess.run", return_value=subprocess.CompletedProcess((), 255)):
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = self.reader.read()

    def test_timeout_cannot_authorize(self) -> None:
        # Given
        with patch("bluegreen.ssh_journal.subprocess.run", side_effect=subprocess.TimeoutExpired("ssh", 10)):
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = self.reader.read()

    def test_empty_successful_transport_is_not_a_grant(self) -> None:
        # Given
        with patch("bluegreen.ssh_journal.subprocess.run", return_value=subprocess.CompletedProcess((), 0)):
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = self.reader.read()

    def test_oversized_remote_output_is_rejected_before_parsing(self) -> None:
        # Given
        def respond(command: tuple[str, ...], *, stdout: BinaryIO,
                    **_options: int | bool) -> subprocess.CompletedProcess[bytes]:
            _ = stdout.write(b"x" * 65537)
            return subprocess.CompletedProcess(command, 0)

        with patch("bluegreen.ssh_journal.subprocess.run", side_effect=respond):
            # When / Then
            with self.assertRaises(DeploymentFailure):
                _ = self.reader.read()

    def test_same_reader_fetches_the_changed_remote_state(self) -> None:
        # Given
        initial = DeploymentState(deployment_id=uuid4(), session_id=uuid4())
        revoked = initial.model_copy(update={"phase": Phase.ATTENTION, "revision": 1})
        states = iter((initial, revoked))

        def respond(command: tuple[str, ...], *, stdout: BinaryIO,
                    **_options: int | bool) -> subprocess.CompletedProcess[bytes]:
            _ = stdout.write(next(states).model_dump_json().encode())
            return subprocess.CompletedProcess(command, 0)

        reader = self.reader
        with patch("bluegreen.ssh_journal.subprocess.run", side_effect=respond):
            _ = reader.read()
            # When
            actual = reader.read()
        # Then
        self.assertEqual(revoked, actual)
