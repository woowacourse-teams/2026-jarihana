"""Dispatch exactly once and collect only the journal-bound GitHub execution."""
import json

from bluegreen.github_models import Runs
from bluegreen.models import Phase
from bluegreen.ports import DeploymentFailure
from github_fixture import GitHubFixture
from github_server import Reply


class GitHubApplicationsTest(GitHubFixture):
    def test_initial_run_metadata_delay_is_rechecked_without_second_dispatch(self) -> None:
        # Given
        incomplete = self.api_run.model_copy(update={"display_title": "initializing"})
        self.server.route("GET", f"{self.root}/actions/runs/11", Reply(
            body=incomplete.model_dump_json().encode(), next_reply=Reply(body=self.api_run.model_dump_json().encode())))
        # When
        actual = self.apps.dispatch(self.command)
        # Then
        self.assertEqual(self.run, actual)
        self.assertEqual(1, sum(request.method == "POST" for request in self.server.requests))

    def test_dispatch_returns_exact_identity_and_sends_bound_command(self) -> None:
        # Given / When
        result = self.apps.dispatch(self.command)
        # Then
        self.assertEqual(self.run, result)
        posts = [r for r in self.server.requests if r.method == "POST"]
        self.assertEqual(1, len(posts))
        body = json.loads(posts[0].body)
        self.assertEqual(self.command.model_dump_json(), body["inputs"]["command"])
        self.assertEqual("control-v1", body["ref"])

    def test_accepted_request_with_lost_response_is_found_without_second_post(self) -> None:
        # Given
        self.server.route("POST", self.dispatch_path, Reply(disconnect=True))
        # When
        response = self.apps.dispatch(self.command)
        recovered = self.apps.find(self.command)
        # Then
        self.assertIsNone(response)
        self.assertEqual((self.run,), recovered)
        self.assertEqual(1, sum(r.method == "POST" for r in self.server.requests))

    def test_legacy_or_malformed_dispatch_response_requires_lookup(self) -> None:
        # Given / When / Then
        for reply in (Reply(204, b""), Reply(200, b"{}"), Reply(503)):
            with self.subTest(reply=reply):
                self.server.route("POST", self.dispatch_path, reply)
                self.assertIsNone(self.apps.dispatch(self.command))

    def test_dispatch_permission_failure_is_not_reported_as_success(self) -> None:
        # Given
        self.server.route("POST", self.dispatch_path, Reply(403, b'{"secret":"sensitive"}'))
        # When / Then
        with self.assertRaises(DeploymentFailure) as error:
            self.apps.dispatch(self.command)
        self.assertNotIn("sensitive", str(error.exception))

    def test_changed_control_tag_blocks_dispatch(self) -> None:
        # Given
        self.server.route("GET", f"{self.root}/git/ref/tags/control-v1", Reply(body=json.dumps({
            "ref": self.run.ref, "object": {"type": "commit", "sha": "b" * 40}}).encode()))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.dispatch(self.command)
        self.assertFalse(any(r.method == "POST" for r in self.server.requests))

    def test_annotated_control_tag_resolves_to_approved_commit(self) -> None:
        # Given
        self.server.route("GET", f"{self.root}/git/ref/tags/control-v1", Reply(body=json.dumps({
            "ref": self.run.ref, "object": {"type": "tag", "sha": "b" * 40}}).encode()))
        self.server.route("GET", f"{self.root}/git/tags/{'b' * 40}", Reply(body=json.dumps({
            "object": {"type": "commit", "sha": self.run.sha}}).encode()))
        # When / Then
        self.assertEqual(self.run, self.apps.dispatch(self.command))

    def test_find_ignores_newer_unrelated_run_and_preserves_ambiguity(self) -> None:
        # Given
        unrelated = self.api_run.model_copy(update={"id": 12, "display_title": "another-command"})
        duplicate = self.api_run.model_copy(update={"id": 13})
        self.server.route("GET", f"{self.root}/actions/runs/13", Reply(body=duplicate.model_dump_json().encode()))
        self.server.route("GET", f"{self.root}/actions/runs/13/attempts/1", Reply(body=duplicate.model_dump_json().encode()))
        self.set_matches((unrelated, self.api_run, duplicate))
        # When
        result = self.apps.find(self.command)
        # Then: the Session will hold because more than one exact run was found.
        self.assertEqual((11, 13), tuple(run.run_id for run in result))

    def test_incomplete_run_search_is_rejected(self) -> None:
        # Given
        self.server.route("GET", self.list_path, Reply(body=Runs(total_count=1001, workflow_runs=(self.api_run,)).model_dump_json().encode()))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.find(self.command)

    def test_find_collects_remaining_pages_before_selecting_a_run(self) -> None:
        # Given
        unrelated = self.api_run.model_copy(update={"id": 12, "display_title": "another-command"})
        self.server.route("GET", self.list_path, Reply(body=Runs(total_count=2, workflow_runs=(unrelated,)).model_dump_json().encode()))
        self.server.route("GET", self.list_path.removesuffix("page=1") + "page=2",
                          Reply(body=Runs(total_count=2, workflow_runs=(self.api_run,)).model_dump_json().encode()))
        # When / Then
        self.assertEqual((self.run,), self.apps.find(self.command))

    def test_api_redirect_is_not_followed_with_authorization(self) -> None:
        # Given
        self.server.route("GET", self.root, Reply(302, location="https://evil.example/private"))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.dispatch(self.command)
        self.assertEqual(1, len(self.server.requests))

    def test_deadline_blocks_dispatch_before_any_network_request(self) -> None:
        # Given
        self.clock.sleep(61)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.dispatch(self.command)
        self.assertEqual([], self.server.requests)

    def test_different_repository_rerun_sha_or_command_name_is_rejected(self) -> None:
        # Given / When / Then
        changes = ({"run_attempt": 2}, {"head_sha": "b" * 40}, {"display_title": "another-command"},
                   {"repository": self.api_run.repository.model_copy(update={"id": 8})},
                   {"event": "push"}, {"head_branch": "main"}, {"workflow_id": 6})
        for change in changes:
            with self.subTest(change=change), self.assertRaises(DeploymentFailure):
                self.set_run(self.api_run.model_copy(update=change))
                self.apps.dispatch(self.command)

    def test_queued_run_returns_pending_without_downloading_artifacts(self) -> None:
        # Given
        self.bind()
        self.set_run(self.api_run.model_copy(update={"status": "queued", "conclusion": None}))
        # When / Then
        self.assertIsNone(self.apps.poll(self.run))
        self.assertEqual([], self.download_requests)

    def test_failed_execution_cannot_become_success_from_artifact(self) -> None:
        # Given
        self.bind()
        self.set_run(self.api_run.model_copy(update={"conclusion": "failure"}))
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.poll(self.run)
        self.assertEqual([], self.download_requests)

    def test_revoked_command_blocks_dispatch_before_network_request(self) -> None:
        # Given
        self.store.update(self.state, phase=Phase.ATTENTION)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.dispatch(self.command)
        self.assertEqual([], self.server.requests)

    def test_cancel_uses_only_current_run_even_after_command_deadline(self) -> None:
        # Given
        self.bind()
        self.clock.sleep(61)
        self.set_run(self.api_run.model_copy(update={"status": "in_progress", "conclusion": None}))
        self.server.route("POST", f"{self.root}/actions/runs/11/cancel", Reply(202))
        # When
        self.apps.cancel(self.run)
        # Then
        self.assertEqual([f"{self.root}/actions/runs/11/cancel"],
                         [r.path for r in self.server.requests if r.method == "POST"])

    def test_cancel_does_not_touch_another_or_rerun_execution(self) -> None:
        # Given
        self.bind()
        # When / Then
        with self.assertRaises(DeploymentFailure):
            self.apps.cancel(self.run.model_copy(update={"run_id": 12}))
        self.assertFalse(any(r.method == "POST" for r in self.server.requests))
