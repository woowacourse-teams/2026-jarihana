"""GitHub Actions implementation of the controller's application command port."""
import hashlib
import json
from datetime import timedelta

from .child_artifacts import ArtifactExpectation, accept_artifact
from .child_execution import JournalReader
from .github_artifacts import ArtifactRequest, GitHubArtifacts
from .github_http import GitHubError, GitHubHttp
from .github_models import DispatchResult, parse_response
from .github_operations import authorize, validate_run
from .github_runs import GitHubContext, GitHubRuns
from .models import Action, Command, DeploymentState, Receipt, RunIdentity
from .ports import DeploymentFailure, UnknownResult


class GitHubApplications:
    """Execute application commands through the pinned repository's child workflow."""
    def __init__(self, api: GitHubHttp, context: GitHubContext, journal: JournalReader) -> None:
        self.api: GitHubHttp = api
        self.context: GitHubContext = context
        self.journal: JournalReader = journal
        self.runs: GitHubRuns = GitHubRuns(api, context)
        self.artifacts: GitHubArtifacts = GitHubArtifacts(api, context)

    def dispatch(self, command: Command) -> RunIdentity | None:
        """One POST only; ambiguous responses are recovered by exact-name lookup."""
        _ = self._grant(command)
        workflow = self.runs.preflight(command)
        _ = self._grant(command)
        payload = json.dumps({"ref": self.context.topology.control.ref.removeprefix("refs/tags/"),
                              "inputs": {"command": command.model_dump_json(),
                                         "deployment_id": str(command.deployment_id),
                                         "command_id": str(command.command_id), "slot": command.host.slot.value}}).encode()
        try:
            reply = self.api.api(f"{self.context.root}/actions/workflows/{workflow.id}/dispatches",
                                 command.deadline, payload)
        except UnknownResult:
            return None
        if reply.status == 204 or reply.status >= 500:
            return None
        if reply.status != 200:
            raise GitHubError(reply.status)
        try:
            result = parse_response(reply.payload, DispatchResult)
        except DeploymentFailure:
            return None
        release = self.context.topology.control
        run = RunIdentity(run_id=result.workflow_run_id, attempt=1, workflow=release.workflow,
                          ref=release.ref, sha=release.sha, event="workflow_dispatch")
        try:
            _ = self.runs.exact(run, command, workflow)
        except GitHubError as error:
            if error.status == 404:
                return None
            raise
        return run

    def find(self, command: Command) -> tuple[RunIdentity, ...]:
        _ = self._grant(command)
        workflow = self.runs.preflight(command)
        matches = self.runs.find(command, workflow)
        for run in matches:
            _ = self.runs.exact(run, command, workflow)
        _ = self._grant(command)
        return matches

    def poll(self, run: RunIdentity) -> Receipt | None:
        state = self._binding(run)
        command = state.pending
        if command is None:
            raise DeploymentFailure("child command is missing")
        _ = self._grant(command, run)
        workflow = self.runs.preflight(command)
        actual = self.runs.exact(run, command, workflow)
        if actual.status != "completed":
            return None
        if actual.conclusion != "success":
            raise DeploymentFailure("GitHub child execution did not succeed")
        payload = self.artifacts.fetch(ArtifactRequest(command, run))
        if payload is None:
            return None
        # A manual rerun or watchdog revocation during download invalidates the result.
        latest_run = self.runs.exact(run, command, workflow)
        if latest_run.status != "completed" or latest_run.conclusion != "success":
            raise DeploymentFailure("GitHub child execution changed during result collection")
        latest = self._grant(command, run)
        return accept_artifact(payload, ArtifactExpectation(latest, self.context.topology, self.api.clock.now()))

    def cancel(self, run: RunIdentity) -> None:
        """Cancel only the bound run, including after its original deadline expired."""
        state = self._binding(run)
        if state.pending is None:
            raise DeploymentFailure("child command is missing")
        command = state.pending.model_copy(update={"deadline": self.api.clock.now() + timedelta(seconds=15)})
        workflow = self.runs.preflight(command)
        actual = self.runs.exact(run, command, workflow)
        if actual.status == "completed":
            return
        _ = self._binding(run)
        reply = self.api.api(f"{self.context.root}/actions/runs/{run.run_id}/cancel", command.deadline, b"{}")
        if reply.status != 202:
            raise GitHubError(reply.status)

    def _binding(self, run: RunIdentity) -> DeploymentState:
        validate_run(run, self.context.topology)
        state = self.journal.read()
        if state is None or state.pending_run != run:
            raise DeploymentFailure("GitHub run is not the journal's current execution")
        return state

    def _grant(self, command: Command, run: RunIdentity | None = None) -> DeploymentState:
        state = self.journal.read()
        topology = self.context.topology
        if (state is None or state.pending_run != run or state.old is state.target
                or state.topology_digest != hashlib.sha256(topology.model_dump_json().encode()).hexdigest()
                or command.parent_run_id != state.parent_run_id or command.parent_attempt != state.parent_attempt
                or command.host != topology.host(command.host.slot)
                or command.action in (Action.START_EC2, Action.STOP_EC2, Action.SWITCH)):
            raise DeploymentFailure("GitHub command grant does not match the current journal")
        authorize(command, state, self.api.clock.now())
        return state
