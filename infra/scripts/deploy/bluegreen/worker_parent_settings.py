from datetime import datetime
from typing import Literal

from pydantic import model_validator

from .github_http import GitHubHttp
from .github_models import RepositoryPin, Workflow, WorkflowRun, parse_response
from .models import AppStatus, Record, RunIdentity, Topology
from .ports import DeploymentFailure


class WorkerParentSettings(Record):
    repository: RepositoryPin
    topology: Topology
    before: AppStatus
    state_directory: Literal["/var/lib/jarihana-deploy/worker-rehearsal"]
    parent_ref: Literal["refs/heads/feat/blue-green-deployment"]

    @model_validator(mode="after")
    def isolated_b_smoke(self) -> "WorkerParentSettings":
        b = self.topology.b
        status = self.before
        if (self.repository.id != 1321030074 or self.repository.full_name != "woowacourse-teams/2026-jarihana"
                or self.topology.environment != "dev-rehearsal"
                or self.topology.coordinator_instance_id != "i-01449d708ceef309b"
                or self.topology.a.instance_id != "i-0a43bb4e0154e0f1f"
                or b.instance_id != "i-0430ff91d1af2fb37"
                or self.topology.control.workflow != "backend-bluegreen-worker-child.yml"
                or not self.topology.control.ref.startswith("refs/tags/bluegreen-worker-rehearsal-")
                or status.environment != self.topology.environment or status.host_id != b.host_id
                or status.instance_id != b.instance_id or not status.healthy or not status.running
                or not status.requests_drained() or status.authority.phase not in ("IDLE", "COMPLETE")
                or status.authority.status != "UNASSIGNED" or status.authority.owner_host is not None
                or status.authority.owner_boot is not None):
            raise DeploymentFailure("worker parent requires the isolated paused B smoke-test profile")
        return self


def verify_worker_parent(api: GitHubHttp, settings: WorkerParentSettings, run: RunIdentity, deadline: datetime) -> None:
    if (run.workflow != "backend-bluegreen-worker-coordinator.yml" or run.ref != settings.parent_ref
            or run.event != "workflow_dispatch" or run.attempt != 1):
        raise DeploymentFailure("worker parent execution context differs")
    root = f"/repos/{settings.repository.full_name}"
    workflow = parse_response(api.get(f"{root}/actions/workflows/{run.workflow}", deadline), Workflow)
    actual = parse_response(api.get(f"{root}/actions/runs/{run.run_id}", deadline), WorkflowRun)
    path = f".github/workflows/{run.workflow}"
    if (workflow.path != path or actual.workflow_id != workflow.id or actual.path not in (path, f"{path}@{run.ref}")
            or actual.id != run.run_id or actual.run_attempt != run.attempt or actual.head_sha != run.sha
            or actual.head_branch != run.ref.removeprefix("refs/heads/") or actual.event != run.event
            or actual.repository.id != settings.repository.id or actual.head_repository.id != settings.repository.id
            or actual.repository.full_name != settings.repository.full_name
            or actual.head_repository.full_name != settings.repository.full_name
            or actual.status != "in_progress" or actual.conclusion is not None):
        raise DeploymentFailure("GitHub worker parent execution differs")
