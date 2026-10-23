import hashlib
from typing import final

from bluegreen.child_artifacts import serialize_artifact
from bluegreen.github_models import Runs
from bluegreen.models import Action, Phase
from bluegreen.ports import DeploymentFailure
from bluegreen.state_store import StateConflict
from bluegreen.status_coordinator import StatusCoordinator
from github_fixture import GitHubFixture
from github_server import Reply


@final
class StatusCoordinatorTest(GitHubFixture):
    def ready(self) -> StatusCoordinator:
        self.receipt = self.receipt.model_copy(update={
            "status": self.receipt.status.model_copy(update={"image": self.command.image})})
        self.zip_payload = self.zip(serialize_artifact(self.receipt, None))
        self.artifact = self.artifact.model_copy(update={
            "size_in_bytes": len(self.zip_payload), "digest": f"sha256:{hashlib.sha256(self.zip_payload).hexdigest()}"})
        self.set_artifacts((self.artifact,))
        _ = self.store.save(self.state, self.state.model_copy(update={
            "revision": self.state.revision + 1, "phase": Phase.COMPLETE, "pending": None}))
        return StatusCoordinator(self.store, self.topology, self.apps, self.clock)

    def test_complete_dispatch_bind_collect_and_close_grant(self) -> None:
        coordinator = self.ready()

        receipt = coordinator.execute(self.command)

        final = self.store.read()
        self.assertIsNotNone(final)
        if final is None:
            self.fail("missing final journal")
        self.assertEqual(Phase.COMPLETE, final.phase)
        self.assertIsNone(final.pending)
        self.assertIsNone(final.pending_run)
        self.assertEqual((receipt,), final.receipts)
        self.assertEqual(self.receipt.run, receipt.run)
        self.assertEqual(1, sum(request.method == "POST" for request in self.server.requests))

    def test_lost_dispatch_reply_finds_exact_run_without_resending(self) -> None:
        coordinator = self.ready()
        self.server.route("POST", self.dispatch_path, Reply(disconnect=True))

        receipt = coordinator.execute(self.command)

        self.assertEqual(self.receipt.run, receipt.run)
        self.assertEqual(1, sum(request.method == "POST" for request in self.server.requests))

    def test_delayed_run_lookup_refreshes_journal_then_binds_same_command(self) -> None:
        coordinator = self.ready()
        self.server.route("POST", self.dispatch_path, Reply(204))
        self.server.route("GET", self.list_path, Reply(
            body=Runs(total_count=0, workflow_runs=()).model_dump_json().encode(),
            next_reply=Reply(body=Runs(total_count=1, workflow_runs=(self.api_run,)).model_dump_json().encode())))
        before = self.clock.monotonic()

        receipt = coordinator.execute(self.command)

        self.assertEqual(self.receipt.run, receipt.run)
        self.assertEqual(5, self.clock.monotonic() - before)
        self.assertEqual(1, sum(request.method == "POST" for request in self.server.requests))

    def test_unhealthy_status_does_not_close_grant_as_success(self) -> None:
        coordinator = self.ready()
        bad = self.receipt.model_copy(update={"status": self.receipt.status.model_copy(update={"healthy": False})})
        self.zip_payload = self.zip(serialize_artifact(bad, None))
        self.set_artifacts((self.artifact.model_copy(update={
            "size_in_bytes": len(self.zip_payload), "digest": f"sha256:{hashlib.sha256(self.zip_payload).hexdigest()}"}),))

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=True)

    def test_failed_child_preserves_command_and_binding_for_reconciliation(self) -> None:
        coordinator = self.ready()
        self.set_run(self.api_run.model_copy(update={"conclusion": "failure"}))

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=True)
        with self.assertRaises(StateConflict):
            _ = coordinator.execute(self.command)
        self.assertEqual(1, sum(request.method == "POST" for request in self.server.requests))

    def test_missing_dispatch_result_expires_without_second_post(self) -> None:
        coordinator = self.ready()
        self.server.route("POST", self.dispatch_path, Reply(204))
        self.set_matches(())

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=False)
        self.assertEqual(1, sum(request.method == "POST" for request in self.server.requests))

    def test_queued_child_expires_and_keeps_bound_run(self) -> None:
        coordinator = self.ready()
        self.set_run(self.api_run.model_copy(update={"status": "queued", "conclusion": None}))

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=True)
        self.assertEqual([], self.download_requests)

    def test_mutation_is_rejected_before_creating_grant(self) -> None:
        coordinator = self.ready()
        previous = self.store.read()

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command.model_copy(update={"action": Action.PAUSE}))

        self.assertEqual(previous, self.store.read())
        self.assertEqual([], self.server.requests)

    def test_concurrent_parent_cannot_dispatch(self) -> None:
        coordinator = self.ready()
        with self.store.lock(), self.assertRaises(StateConflict):
            _ = coordinator.execute(self.command)
        self.assertEqual([], self.server.requests)

    def test_revoked_grant_during_download_is_not_overwritten(self) -> None:
        coordinator = self.ready()

        def revoke() -> None:
            current = self.store.read()
            if current is None:
                self.fail("missing active journal")
            _ = self.store.update(current, phase=Phase.ATTENTION, reason="external revocation")

        self.download_hook = revoke
        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        final = self.store.read()
        self.assertIsNotNone(final)
        if final is None:
            self.fail("missing revoked journal")
        self.assertEqual("external revocation", final.reason)
        self.assertIsNotNone(final.pending)

    def assert_attention(self, *, bound: bool) -> None:
        final = self.store.read()
        self.assertIsNotNone(final)
        if final is None:
            self.fail("missing failed journal")
        self.assertEqual(Phase.ATTENTION, final.phase)
        self.assertEqual(self.command, final.pending)
        self.assertEqual(self.receipt.run if bound else None, final.pending_run)
