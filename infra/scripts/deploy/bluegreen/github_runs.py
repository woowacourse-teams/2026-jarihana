"""Resolve the approved control tag and bind GitHub executions to one command."""
import re
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import quote

from .github_http import GitHubHttp
from .github_models import (
    GitRef,
    Repository,
    RepositoryPin,
    Runs,
    Tag,
    Workflow,
    WorkflowRun,
    command_name,
    parse_response,
)
from .models import Command, RunIdentity, Topology
from .ports import DeploymentFailure


@dataclass(frozen=True, slots=True)
class GitHubContext:
    repository: RepositoryPin
    topology: Topology

    @property
    def root(self) -> str:
        return f"/repos/{self.repository.full_name}"

    @property
    def workflow_file(self) -> str:
        filename = self.topology.control.workflow.removeprefix(".github/workflows/")
        if re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9_.-]*\.ya?ml", filename) is None:
            raise DeploymentFailure("control workflow must be an allowlisted workflow file")
        return filename

    @property
    def workflow_path(self) -> str:
        return f".github/workflows/{self.workflow_file}"


class GitHubRuns:
    def __init__(self, api: GitHubHttp, context: GitHubContext) -> None:
        self.api: GitHubHttp = api
        self.context: GitHubContext = context

    def preflight(self, command: Command) -> Workflow:
        """Fail before dispatch if a repository, workflow or release tag changed."""
        root, deadline = self.context.root, command.deadline
        repository = parse_response(self.api.get(root, deadline), Repository)
        self._repository(repository)
        release = self.context.topology.control
        ref = parse_response(self.api.get(f"{root}/git/ref/{quote(release.ref.removeprefix('refs/'), safe='/')}",
                                         deadline), GitRef)
        if ref.ref != release.ref:
            raise DeploymentFailure("control tag reference does not match")
        target = ref.object
        for _ in range(5):
            if target.type == "commit":
                break
            target = parse_response(self.api.get(f"{root}/git/tags/{target.sha}", deadline), Tag).object
        if target.type != "commit" or target.sha != release.sha:
            raise DeploymentFailure("control tag no longer resolves to the approved commit")
        workflow = parse_response(self.api.get(f"{root}/actions/workflows/{self.context.workflow_file}", deadline), Workflow)
        if workflow.path != self.context.workflow_path:
            raise DeploymentFailure("control workflow path does not match")
        return workflow

    def exact(self, run: RunIdentity, command: Command, workflow: Workflow) -> WorkflowRun:
        root = self.context.root
        current = parse_response(self.api.get(f"{root}/actions/runs/{run.run_id}", command.deadline), WorkflowRun)
        self.validate(current, command, workflow)
        attempt = parse_response(self.api.get(f"{root}/actions/runs/{run.run_id}/attempts/{run.attempt}",
                                             command.deadline), WorkflowRun)
        self.validate(attempt, command, workflow)
        if (current.id != run.run_id or attempt.id != run.run_id or self.identity(current) != run
                or current.status != attempt.status or current.conclusion != attempt.conclusion):
            raise DeploymentFailure("GitHub execution identity changed")
        return attempt

    def find(self, command: Command, workflow: Workflow) -> tuple[RunIdentity, ...]:
        """Search all bounded pages; never select the newest or an ambiguous result."""
        matches: list[RunIdentity] = []
        seen: set[int] = set()
        expected_total: int | None = None
        for page in range(1, 11):
            path = (f"{self.context.root}/actions/workflows/{workflow.id}/runs"
                    f"?event=workflow_dispatch&head_sha={self.context.topology.control.sha}&per_page=100&page={page}")
            result = parse_response(self.api.get(path, command.deadline), Runs)
            if expected_total is None:
                expected_total = result.total_count
            if result.total_count != expected_total or expected_total > 1000:
                raise DeploymentFailure("GitHub run search is unstable or exceeds its limit")
            for run in result.workflow_runs:
                if run.id in seen:
                    raise DeploymentFailure("GitHub run search repeats an execution")
                seen.add(run.id)
                if run.display_title == command_name(command):
                    self.validate(run, command, workflow)
                    matches.append(self.identity(run))
            if len(seen) == expected_total:
                return tuple(matches)
            if not result.workflow_runs or len(seen) > expected_total:
                break
        raise DeploymentFailure("GitHub run search is incomplete")

    def validate(self, run: WorkflowRun, command: Command, workflow: Workflow) -> None:
        release = self.context.topology.control
        self._repository(run.repository)
        self._repository(run.head_repository)
        allowed_paths = (self.context.workflow_path, f"{self.context.workflow_path}@{release.ref}",
                         f"{self.context.workflow_path}@{release.ref.removeprefix('refs/tags/')}")
        if (run.workflow_id != workflow.id or run.path not in allowed_paths
                or run.head_branch != release.ref.removeprefix("refs/tags/")
                or run.head_sha != release.sha or run.event != "workflow_dispatch" or run.run_attempt != 1
                or run.display_title != command_name(command)
                or run.created_at > command.deadline + timedelta(seconds=5)):
            raise DeploymentFailure("GitHub run does not belong to this approved command")

    def identity(self, run: WorkflowRun) -> RunIdentity:
        release = self.context.topology.control
        return RunIdentity(run_id=run.id, attempt=run.run_attempt, workflow=release.workflow,
                           ref=release.ref, sha=run.head_sha, event=run.event)

    def _repository(self, actual: Repository) -> None:
        expected = self.context.repository
        if actual.id != expected.id or actual.full_name.lower() != expected.full_name.lower():
            raise DeploymentFailure("GitHub repository identity does not match")
