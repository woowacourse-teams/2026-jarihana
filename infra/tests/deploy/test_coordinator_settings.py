import json
from pathlib import Path
from typing import final

from bluegreen.coordinator_settings import CoordinatorSettings, verify_parent
from bluegreen.github_models import Repository
from bluegreen.models import RunIdentity
from bluegreen.ports import DeploymentFailure
from github_fixture import GitHubFixture
from github_server import Reply


@final
class CoordinatorSettingsTest(GitHubFixture):
    def settings(self) -> CoordinatorSettings:
        path = Path(__file__).parents[2] / "deploy/status-child/coordinator.example.json"
        return CoordinatorSettings.model_validate_json(path.read_bytes())

    def parent(self, settings: CoordinatorSettings) -> RunIdentity:
        return RunIdentity(run_id=100, attempt=1, workflow="backend-bluegreen-status-coordinator.yml",
                           ref=settings.parent_ref, sha="c" * 40, event="workflow_dispatch")

    def parent_routes(self, settings: CoordinatorSettings, parent: RunIdentity) -> None:
        root = f"/repos/{settings.repository.full_name}"
        path = f".github/workflows/{parent.workflow}"
        repository = Repository(id=settings.repository.id, full_name=settings.repository.full_name)
        actual = self.api_run.model_copy(update={
            "id": parent.run_id, "path": path, "head_branch": "feat/blue-green-deployment",
            "head_sha": parent.sha, "repository": repository, "head_repository": repository,
            "status": "in_progress", "conclusion": None})
        self.server.route("GET", f"{root}/actions/workflows/{parent.workflow}", Reply(body=json.dumps({
            "id": actual.workflow_id, "path": path, "state": "active"}).encode()))
        self.server.route("GET", f"{root}/actions/runs/{parent.run_id}", Reply(body=actual.model_dump_json().encode()))

    def test_running_parent_matches_github_metadata(self) -> None:
        settings = self.settings()
        parent = self.parent(settings)
        self.parent_routes(settings, parent)

        verify_parent(self.api, settings, parent, self.command.deadline)

        self.assertEqual(2, len(self.server.requests))
        self.assertFalse(any(request.method == "POST" for request in self.server.requests))

    def test_rerun_or_wrong_ref_is_rejected_before_api(self) -> None:
        settings = self.settings()
        parent = self.parent(settings)

        for changed in (parent.model_copy(update={"attempt": 2}), parent.model_copy(update={"ref": "refs/heads/main"})):
            with self.subTest(run=changed), self.assertRaises(DeploymentFailure):
                verify_parent(self.api, settings, changed, self.command.deadline)
        self.assertEqual([], self.server.requests)

    def test_run_metadata_cannot_impersonate_parent(self) -> None:
        settings = self.settings()
        parent = self.parent(settings)
        self.parent_routes(settings, parent)
        path = f"/repos/{settings.repository.full_name}/actions/runs/{parent.run_id}"
        wrong = self.api_run.model_copy(update={"id": parent.run_id, "head_sha": parent.sha})
        self.server.route("GET", path, Reply(body=wrong.model_dump_json().encode()))

        with self.assertRaises(DeploymentFailure):
            verify_parent(self.api, settings, parent, self.command.deadline)

    def test_production_topology_is_rejected(self) -> None:
        settings = self.settings()
        topology = settings.topology.model_copy(update={"environment": "prod"})
        with self.assertRaises(DeploymentFailure):
            _ = CoordinatorSettings.model_validate({**settings.model_dump(), "topology": topology})
