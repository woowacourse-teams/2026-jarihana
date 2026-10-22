from bluegreen.ports import DeploymentFailure
from github_fixture import GitHubFixture
from github_server import Reply


class GitHubRunTransitionTest(GitHubFixture):
    def test_completion_between_reads_is_rechecked_without_dispatch(self) -> None:
        running = self.api_run.model_copy(update={"status": "in_progress", "conclusion": None})
        self.server.route("GET", f"{self.root}/actions/runs/11", Reply(
            body=running.model_dump_json().encode(), next_reply=Reply(body=self.api_run.model_dump_json().encode())))
        workflow = self.apps.runs.preflight(self.command)

        result = self.apps.runs.exact(self.receipt.run, self.command, workflow)

        self.assertEqual("completed", result.status)
        self.assertEqual("success", result.conclusion)
        self.assertFalse(any(request.method == "POST" for request in self.server.requests))

    def test_persistent_state_disagreement_stops_after_three_read_pairs(self) -> None:
        running = self.api_run.model_copy(update={"status": "in_progress", "conclusion": None})
        path = f"{self.root}/actions/runs/11"
        self.server.route("GET", path, Reply(body=running.model_dump_json().encode()))
        workflow = self.apps.runs.preflight(self.command)

        with self.assertRaisesRegex(DeploymentFailure, "state did not stabilize"):
            _ = self.apps.runs.exact(self.receipt.run, self.command, workflow)

        self.assertEqual(3, sum(request.path == path for request in self.server.requests))

    def test_attempt_identity_mismatch_is_rejected_without_state_retry(self) -> None:
        wrong = self.api_run.model_copy(update={"id": 12})
        path = f"{self.root}/actions/runs/11/attempts/1"
        self.server.route("GET", path, Reply(body=wrong.model_dump_json().encode()))
        workflow = self.apps.runs.preflight(self.command)

        with self.assertRaisesRegex(DeploymentFailure, "identity changed"):
            _ = self.apps.runs.exact(self.receipt.run, self.command, workflow)

        self.assertEqual(1, sum(request.path == path for request in self.server.requests))
