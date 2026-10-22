from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import model_validator

from .github_http import GitHubHttp
from .github_models import RepositoryPin, Workflow, WorkflowRun, parse_response
from .models import Digest, Record, RunIdentity, Topology
from .ports import DeploymentFailure


class CoordinatorSettings(Record):
    repository: RepositoryPin
    topology: Topology
    expected_boot: UUID
    expected_image: Digest
    state_directory: Literal["/var/lib/jarihana-deploy/status-rehearsal"]
    parent_ref: Literal["refs/heads/feat/blue-green-deployment"]

    @model_validator(mode="after")
    def rehearsal_only(self) -> "CoordinatorSettings":
        if (self.repository.full_name != "woowacourse-teams/2026-jarihana" or self.repository.id != 1321030074
                or self.topology.environment != "dev-rehearsal"
                or self.topology.coordinator_instance_id != "i-01449d708ceef309b"
                or self.topology.a.instance_id != "i-0a43bb4e0154e0f1f"
                or self.topology.b.instance_id != "i-0430ff91d1af2fb37"
                or self.topology.control.workflow != "backend-bluegreen-status-child.yml"):
            raise DeploymentFailure("coordinator configuration is not the allowlisted STATUS rehearsal")
        return self


def verify_parent(api: GitHubHttp, settings: CoordinatorSettings, run: RunIdentity, deadline: datetime) -> None:
    if (run.workflow != "backend-bluegreen-status-coordinator.yml" or run.ref != settings.parent_ref
            or run.event != "workflow_dispatch" or run.attempt != 1):
        raise DeploymentFailure("STATUS parent workflow context does not match")
    root = f"/repos/{settings.repository.full_name}"
    workflow = parse_response(api.get(f"{root}/actions/workflows/{run.workflow}", deadline), Workflow)
    actual = parse_response(api.get(f"{root}/actions/runs/{run.run_id}", deadline), WorkflowRun)
    path = f".github/workflows/{run.workflow}"
    expected_path = (path, f"{path}@{run.ref}")
    if (workflow.path != path or actual.workflow_id != workflow.id or actual.path not in expected_path
            or actual.id != run.run_id or actual.run_attempt != run.attempt or actual.head_sha != run.sha
            or actual.head_branch != run.ref.removeprefix("refs/heads/") or actual.event != run.event
            or actual.repository.id != settings.repository.id or actual.head_repository.id != settings.repository.id
            or actual.repository.full_name != settings.repository.full_name
            or actual.head_repository.full_name != settings.repository.full_name
            or actual.status != "in_progress" or actual.conclusion is not None):
        raise DeploymentFailure("GitHub STATUS parent execution does not match")
