from collections.abc import Callable
from uuid import uuid4

from bluegreen.child_artifacts import ChildArtifact
from bluegreen.child_execution import ChildContext, MachineIdentity
from bluegreen.child_status import status_artifact
from bluegreen.github_runs import GitHubRuns
from bluegreen.models import Action, AppStatus, Phase
from bluegreen.ports import DeploymentFailure
from github_fixture import GitHubFixture


class ChildStatusTest(GitHubFixture):
    def prepare_context(self) -> ChildContext:
        self.bind()
        self.set_run(self.api_run.model_copy(update={"status": "in_progress", "conclusion": None}))
        return ChildContext(self.topology, self.receipt.run, MachineIdentity(environment=self.topology.environment,
                             host_id=self.topology.a.host_id, instance_id=self.topology.a.instance_id))

    def execute(self, context: ChildContext, source: Callable[[], AppStatus]) -> bytes:
        return status_artifact(self.command, context, GitHubRuns(self.api, self.apps.context),
                               self.store, source, self.clock)

    def test_live_run_and_current_grant_produce_command_bound_status(self) -> None:
        # Given
        context = self.prepare_context()
        # When
        result = ChildArtifact.model_validate_json(self.execute(context, lambda: self.receipt.status))
        # Then
        self.assertEqual(context.run, result.receipt.run)
        self.assertEqual(self.command, result.receipt.command)
        self.assertEqual(self.receipt.status.model_dump(), result.receipt.status.model_dump())
        self.assertIsNone(result.shutdown)

    def test_mutation_is_rejected_before_any_status_request(self) -> None:
        # Given
        context = self.prepare_context()
        mutation = self.command.model_copy(update={"action": Action.ACTIVATE})
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = status_artifact(mutation, context, GitHubRuns(self.api, self.apps.context),
                                self.store, lambda: self.fail("status source must not run"), self.clock)

    def test_wrong_application_boot_cannot_produce_artifact(self) -> None:
        # Given
        context = self.prepare_context()
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = self.execute(context, lambda: self.receipt.status.model_copy(update={"boot_id": uuid4()}))

    def test_revocation_during_status_read_cannot_produce_artifact(self) -> None:
        # Given
        context = self.prepare_context()

        def source() -> AppStatus:
            _ = self.store.update(self.state, phase=Phase.ATTENTION)
            return self.receipt.status

        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = self.execute(context, source)

    def test_github_cancellation_during_status_read_cannot_produce_artifact(self) -> None:
        # Given
        context = self.prepare_context()

        def source() -> AppStatus:
            self.set_run(self.api_run.model_copy(update={"status": "completed", "conclusion": "cancelled"}))
            return self.receipt.status

        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = self.execute(context, source)

    def test_existing_completed_run_is_rejected_before_status_read(self) -> None:
        # Given
        context = self.prepare_context()
        self.set_run(self.api_run)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = self.execute(context, lambda: self.fail("status source must not run"))
