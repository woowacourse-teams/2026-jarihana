"""A successful run still requires exact, intact and current result evidence."""
import hashlib
from io import BytesIO
from zipfile import ZipFile, ZipInfo

from bluegreen.child_artifacts import serialize_artifact
from bluegreen.github_models import MAX_ZIP_BYTES
from bluegreen.models import Phase
from bluegreen.ports import DeploymentFailure
from github_fixture import GitHubFixture
from github_server import Reply


class GitHubArtifactsTest(GitHubFixture):
    def setUp(self) -> None:
        super().setUp()
        self.bind()

    def test_exact_result_is_accepted_without_forwarding_github_token(self) -> None:
        # Given / When
        result = self.apps.poll(self.run)
        # Then
        self.assertEqual(self.receipt, result)
        self.assertEqual(1, len(self.download_requests))
        self.assertNotIn("authorization", self.download_requests[0].headers)
        self.assertTrue(all(r.authorization == "Bearer fixture-token" for r in self.server.requests))

    def test_missing_result_stays_pending(self) -> None:
        # Given
        self.set_artifacts(())
        # When / Then
        self.assertIsNone(self.apps.poll(self.run))

    def test_duplicate_or_wrong_origin_artifact_is_rejected(self) -> None:
        # Given / When / Then
        for artifacts in ((self.artifact, self.artifact.model_copy(update={"id": 10})),
                          (self.artifact.model_copy(update={"expired": True}),),
                          (self.artifact.model_copy(update={"workflow_run": self.artifact.workflow_run.model_copy(
                              update={"repository_id": 8})}),)):
            with self.subTest(artifacts=artifacts), self.assertRaises(DeploymentFailure):
                self.set_artifacts(artifacts)
                self.apps.poll(self.run)

    def test_unapproved_download_location_is_rejected_before_request(self) -> None:
        # Given / When / Then
        for url in ("http://results.example/file", "https://evil.example/file", "https://results.example.evil/file",
                    "https://user:password@results.example/file", "https://results.example:444/file"):
            with self.subTest(url=url), self.assertRaises(DeploymentFailure):
                self.server.route("GET", self.download_path, Reply(302, location=url))
                self.apps.poll(self.run)
        self.assertEqual([], self.download_requests)

    def test_download_redirect_is_not_followed(self) -> None:
        # Given
        self.download_status = 302
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)
        self.assertEqual(1, len(self.download_requests))

    def test_tampered_archive_digest_is_rejected(self) -> None:
        # Given
        with ZipFile(BytesIO(self.zip_payload)) as original:
            payload = original.read("child-result.json")
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr(ZipInfo("child-result.json", date_time=(2001, 1, 1, 0, 0, 0)), payload)
        self.zip_payload = buffer.getvalue()  # Valid ZIP, unchanged JSON and size; only digest differs.
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)

    def test_oversized_download_is_rejected(self) -> None:
        # Given
        self.zip_payload = b"x" * (MAX_ZIP_BYTES + 1)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)

    def test_archive_path_traversal_and_oversized_result_are_rejected(self) -> None:
        # Given / When / Then
        for archive in (self.zip(b"{}", "../child-result.json"), self.zip(b"x" * 65537), b"not-a-zip"):
            with self.subTest(size=len(archive)), self.assertRaises(DeploymentFailure):
                self.zip_payload = archive
                self.set_artifacts((self.artifact.model_copy(update={"size_in_bytes": len(archive),
                    "digest": f"sha256:{hashlib.sha256(archive).hexdigest()}"}),))
                self.apps.poll(self.run)

    def test_wrong_result_command_is_rejected_even_with_valid_archive_digest(self) -> None:
        # Given
        wrong = self.receipt.model_copy(update={"command": self.command.model_copy(update={"parent_run_id": 101})})
        self.zip_payload = self.zip(serialize_artifact(wrong, None))
        self.set_artifacts((self.artifact.model_copy(update={"size_in_bytes": len(self.zip_payload),
            "digest": f"sha256:{hashlib.sha256(self.zip_payload).hexdigest()}"}),))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)

    def test_archive_with_multiple_files_is_rejected(self) -> None:
        # Given
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("child-result.json", b"{}")
            archive.writestr("other.json", b"{}")
        self.zip_payload = buffer.getvalue()
        self.set_artifacts((self.artifact.model_copy(update={"size_in_bytes": len(self.zip_payload),
            "digest": f"sha256:{hashlib.sha256(self.zip_payload).hexdigest()}"}),))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)

    def test_expired_artifact_download_does_not_succeed(self) -> None:
        # Given
        self.server.route("GET", self.download_path, Reply(410))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)
        self.assertEqual([], self.download_requests)

    def test_watchdog_revocation_during_download_rejects_result(self) -> None:
        # Given
        def revoke() -> None:
            self.store.update(self.state, phase=Phase.ATTENTION)
        self.download_hook = revoke
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)

    def test_manual_rerun_during_download_rejects_result(self) -> None:
        # Given
        def rerun() -> None:
            self.set_run(self.api_run.model_copy(update={"run_attempt": 2}))
        self.download_hook = rerun
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)
