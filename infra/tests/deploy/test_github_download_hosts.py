from typing import final

from bluegreen.github_applications import GitHubApplications
from bluegreen.github_runs import GitHubContext
from bluegreen.ports import DeploymentFailure
from github_fixture import GitHubFixture
from github_server import Reply


@final
class GitHubDownloadHostsTest(GitHubFixture):
    def allow_result_storage(self) -> None:
        pin = self.apps.context.repository.model_copy(update={"allow_github_result_storage": True})
        self.apps = GitHubApplications(self.api, GitHubContext(pin, self.topology), self.store)
        self.bind()

    def test_numbered_storage_host_changes_without_forwarding_api_credentials(self) -> None:
        self.allow_result_storage()
        for number in (2, 8, 42):
            with self.subTest(number=number):
                self.server.route("GET", self.download_path, Reply(
                    302, location=f"https://productionresultssa{number}.blob.core.windows.net/signed"))

                receipt = self.apps.poll(self.receipt.run)

                self.assertEqual(self.receipt, receipt)
                self.assertNotIn("authorization", self.download_requests[-1].headers)

    def test_numbered_storage_is_rejected_without_administrator_opt_in(self) -> None:
        self.bind()
        self.server.route("GET", self.download_path, Reply(
            302, location="https://productionresultssa8.blob.core.windows.net/signed"))

        with self.assertRaises(DeploymentFailure):
            _ = self.apps.poll(self.receipt.run)

        self.assertEqual([], self.download_requests)

    def test_enabled_storage_rejects_other_accounts_lookalikes_and_unsafe_urls(self) -> None:
        self.allow_result_storage()
        for url in (
            "https://arbitrary.blob.core.windows.net/signed",
            "https://productionresultssa8.blob.core.windows.net.evil.example/signed",
            "https://productionresultssa8.blob.core.windows.net./signed",
            "https://productionresultssaevil.blob.core.windows.net/signed",
            "https://productionresultssa8.blob.core.windows.net:443/signed",
            "https://user@productionresultssa8.blob.core.windows.net/signed",
            "http://productionresultssa8.blob.core.windows.net/signed",
            "https://productionresultssa8.blob.core.windows.net/signed#fragment",
        ):
            with self.subTest(url=url), self.assertRaises(DeploymentFailure):
                self.server.route("GET", self.download_path, Reply(302, location=url))
                _ = self.apps.poll(self.receipt.run)
        self.assertEqual([], self.download_requests)

    def test_enabled_storage_still_rejects_tampered_artifact(self) -> None:
        self.allow_result_storage()
        self.server.route("GET", self.download_path, Reply(
            302, location="https://productionresultssa8.blob.core.windows.net/signed"))
        self.zip_payload = b"tampered"

        with self.assertRaisesRegex(DeploymentFailure, "size or digest"):
            _ = self.apps.poll(self.receipt.run)

        self.assertEqual(1, len(self.download_requests))
