import json
import subprocess
import sys
from pathlib import Path
from typing import final

from bluegreen.github_models import Repository
from bluegreen.models import AppStatus, Authority, RunIdentity
from bluegreen.ports import DeploymentFailure
from bluegreen.worker_parent_settings import WorkerParentSettings, verify_worker_parent
from github_fixture import GitHubFixture
from github_server import Reply
from test_worker_settings import settings


def parent_settings() -> WorkerParentSettings:
    child = settings()
    before = AppStatus(environment=child.topology.environment, host_id=child.topology.b.host_id,
        instance_id=child.topology.b.instance_id, boot_id=child.expected_boot, image=child.expected_image,
        worker="PAUSED", in_flight=0, unresolved=0, healthy=True, running=True, http_in_flight=0,
        background_drained=True, authority=Authority())
    return WorkerParentSettings(repository=child.repository, topology=child.topology, before=before,
        state_directory="/var/lib/jarihana-deploy/worker-rehearsal", parent_ref="refs/heads/feat/blue-green-deployment")


@final
class WorkerParentSettingsTest(GitHubFixture):
    def test_running_parent_is_verified_against_actual_repository_metadata(self) -> None:
        value = parent_settings()
        parent = self.parent(value)
        self.routes(value, parent)

        verify_worker_parent(self.api, value, parent, self.command.deadline)

        self.assertEqual(2, len(self.server.requests))

    def test_rerun_wrong_workflow_and_wrong_ref_are_rejected_before_http(self) -> None:
        value = parent_settings()
        parent = self.parent(value)

        for changes in ({"attempt": 2}, {"workflow": "backend-bluegreen-status-coordinator.yml"},
                        {"ref": "refs/heads/main"}, {"event": "push"}):
            with self.subTest(changes=changes), self.assertRaises(DeploymentFailure):
                verify_worker_parent(self.api, value, parent.model_copy(update=changes), self.command.deadline)

        self.assertEqual([], self.server.requests)

    def test_completed_parent_cannot_issue_commands(self) -> None:
        value = parent_settings()
        parent = self.parent(value)
        self.routes(value, parent, completed=True)

        with self.assertRaises(DeploymentFailure):
            verify_worker_parent(self.api, value, parent, self.command.deadline)

    def test_active_owner_or_undrained_b_cannot_start_smoke(self) -> None:
        value = parent_settings()

        for changed in ({"worker": "ACTIVE"}, {"in_flight": 1}, {"healthy": False},
                        {"authority": value.before.authority.model_copy(update={"owner_host": value.before.host_id})}):
            with self.subTest(changed=changed), self.assertRaises(DeploymentFailure):
                _ = WorkerParentSettings.model_validate({**value.model_dump(),
                    "before": value.before.model_copy(update=changed)})

    def test_other_environment_and_status_child_are_rejected(self) -> None:
        value = parent_settings()
        for changed in ({"environment": "prod"}, {"control": value.topology.control.model_copy(update={
                "workflow": "backend-bluegreen-status-child.yml"})}):
            with self.subTest(changed=changed), self.assertRaises(DeploymentFailure):
                _ = WorkerParentSettings.model_validate({**value.model_dump(),
                    "topology": value.topology.model_copy(update=changed)})

    def test_cli_rejects_arguments_without_remote_access(self) -> None:
        script = Path(__file__).parents[2] / "scripts/deploy/worker-coordinator.py"

        result = subprocess.run((sys.executable, str(script), "unexpected"), capture_output=True, text=True, check=False)

        self.assertEqual(1, result.returncode)

    @staticmethod
    def parent(value: WorkerParentSettings) -> RunIdentity:
        return RunIdentity(run_id=100, attempt=1, workflow="backend-bluegreen-worker-coordinator.yml",
            ref=value.parent_ref, sha="c" * 40, event="workflow_dispatch")

    def routes(self, value: WorkerParentSettings, parent: RunIdentity, *, completed: bool = False) -> None:
        root = f"/repos/{value.repository.full_name}"
        path = f".github/workflows/{parent.workflow}"
        repository = Repository(id=value.repository.id, full_name=value.repository.full_name)
        actual = self.api_run.model_copy(update={"id": parent.run_id, "path": path,
            "head_branch": "feat/blue-green-deployment", "head_sha": parent.sha,
            "repository": repository, "head_repository": repository,
            "status": "completed" if completed else "in_progress", "conclusion": "success" if completed else None})
        self.server.route("GET", f"{root}/actions/workflows/{parent.workflow}", Reply(body=json.dumps({
            "id": actual.workflow_id, "path": path, "state": "active"}).encode()))
        self.server.route("GET", f"{root}/actions/runs/{parent.run_id}", Reply(body=actual.model_dump_json().encode()))
