import hashlib
from typing import final
from uuid import uuid4

from bluegreen.child_artifacts import serialize_artifact
from bluegreen.github_models import Runs, command_name
from bluegreen.models import Action, Authority, Phase
from bluegreen.ports import DeploymentFailure
from bluegreen.state_store import StateConflict
from bluegreen.worker_command import expected_authority
from bluegreen.worker_coordinator import WorkerCoordinator
from github_fixture import GitHubFixture
from github_server import Reply


@final
class WorkerCoordinatorTest(GitHubFixture):
    def ready_status(self) -> WorkerCoordinator:
        coordinator = self.ready()
        authority = self.command.authority
        assert authority is not None
        authority = authority.model_copy(update={"revision": authority.revision + 3, "epoch": 1,
            "deployment_id": self.command.deployment_id, "phase": "HANDOFF"})
        self.command = self.command.model_copy(update={"action": Action.STATUS, "authority": authority})
        self.receipt = self.receipt.model_copy(update={"command": self.command,
            "status": self.receipt.status.model_copy(update={"authority": authority, "in_flight": 2})})
        self.api_run = self.api_run.model_copy(update={"display_title": command_name(self.command)})
        self.set_run(self.api_run)
        self.publish()
        current = self.store.read()
        assert current is not None
        self.state = self.store.save(current, current.model_copy(update={"revision": current.revision + 1,
            "pending": self.command, "authority": authority}))
        return coordinator

    def test_status_refreshes_stale_host_snapshot_without_changing_shared_authority(self) -> None:
        # Given
        coordinator = self.ready_status()
        authority = self.state.authority
        # When
        receipt = coordinator.execute(self.command)
        # Then
        state = self.store.read()
        assert state is not None and state.old_app is not None
        self.assertEqual(authority, state.authority)
        self.assertEqual(receipt.status, state.old_app)
        self.assertEqual(2, state.old_app.in_flight)
        self.assertIsNone(state.pending)

    def test_status_cannot_replace_shared_authority_with_unexpected_database_revision(self) -> None:
        # Given
        coordinator = self.ready_status()
        self.receipt = self.receipt.model_copy(update={"status": self.receipt.status.model_copy(update={
            "authority": self.receipt.status.authority.model_copy(update={"revision": 99})})})
        self.publish()
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)
        self.assert_attention(bound=True)
        assert self.store.read() is not None
        self.assertEqual(self.state.authority, coordinator.current.authority)

    def test_refreshed_work_count_blocks_activation_before_dispatch(self) -> None:
        # Given
        coordinator = self.ready_status()
        _ = coordinator.execute(self.command)
        current = self.store.read()
        assert current is not None
        command = self.command.model_copy(update={"command_id": uuid4(), "action": Action.ACTIVATE})
        _ = self.store.save(current, current.model_copy(update={"revision": current.revision + 1, "pending": command}))
        dispatched = sum(request.method == "POST" for request in self.server.requests)
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(command)
        self.assertEqual(dispatched, sum(request.method == "POST" for request in self.server.requests))

    def test_status_from_restarted_process_cannot_refresh_host_snapshot(self) -> None:
        # Given
        coordinator = self.ready_status()
        self.receipt = self.receipt.model_copy(update={"status": self.receipt.status.model_copy(update={"boot_id": uuid4()})})
        self.publish()
        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)
        self.assert_attention(bound=True)

    def ready(self) -> WorkerCoordinator:
        before = self.receipt.status.model_copy(update={"authority": Authority(), "worker": "PAUSED"})
        self.command = self.command.model_copy(update={"action": Action.BEGIN, "authority": before.authority})
        self.api_run = self.api_run.model_copy(update={"display_title": command_name(self.command)})
        self.set_run(self.api_run)
        self.set_matches((self.api_run,))
        self.receipt = self.receipt.model_copy(update={"command": self.command,
            "status": before.model_copy(update={"authority": expected_authority(self.command, before)})})
        self.publish()
        self.state = self.store.save(self.state, self.state.model_copy(update={"revision": self.state.revision + 1,
            "old_app": before, "authority": before.authority, "pending": self.command}))
        return WorkerCoordinator(self.store, self.topology, self.apps, self.clock)

    def publish(self) -> None:
        self.zip_payload = self.zip(serialize_artifact(self.receipt, None))
        self.artifact = self.artifact.model_copy(update={"size_in_bytes": len(self.zip_payload),
            "digest": f"sha256:{hashlib.sha256(self.zip_payload).hexdigest()}"})
        self.set_artifacts((self.artifact,))

    def test_success_records_authority_and_closes_only_the_command(self) -> None:
        coordinator = self.ready()

        receipt = coordinator.execute(self.command)

        state = self.store.read()
        assert state is not None
        self.assertEqual(receipt.status.authority, state.authority)
        self.assertEqual((receipt,), state.receipts)
        self.assertIsNone(state.pending)
        self.assertIsNone(state.pending_run)
        self.assertEqual(Phase.PREPARING, state.phase)

    def test_lost_dispatch_reply_is_resolved_without_second_post(self) -> None:
        coordinator = self.ready()
        self.server.route("POST", self.dispatch_path, Reply(disconnect=True))

        receipt = coordinator.execute(self.command)

        self.assertEqual(self.run, receipt.run)
        self.assertEqual(1, sum(r.method == "POST" for r in self.server.requests))

    def test_delayed_lookup_keeps_original_command_and_deadline(self) -> None:
        coordinator = self.ready()
        self.server.route("POST", self.dispatch_path, Reply(204))
        self.server.route("GET", self.list_path, Reply(body=Runs(total_count=0, workflow_runs=()).model_dump_json().encode(),
            next_reply=Reply(body=Runs(total_count=1, workflow_runs=(self.api_run,)).model_dump_json().encode())))

        receipt = coordinator.execute(self.command)

        self.assertEqual(self.command, receipt.command)
        self.assertEqual(1, sum(r.method == "POST" for r in self.server.requests))

    def test_failed_child_preserves_intent_and_blocks_redispatch(self) -> None:
        coordinator = self.ready()
        self.set_run(self.api_run.model_copy(update={"conclusion": "failure"}))

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=True)
        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)
        self.assertEqual(1, sum(r.method == "POST" for r in self.server.requests))

    def test_missing_run_keeps_unbound_intent_after_deadline(self) -> None:
        coordinator = self.ready()
        self.server.route("POST", self.dispatch_path, Reply(204))
        self.set_matches(())

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=False)
        self.assertEqual(1, sum(r.method == "POST" for r in self.server.requests))

    def test_incorrect_authority_receipt_is_not_accepted(self) -> None:
        coordinator = self.ready()
        self.receipt = self.receipt.model_copy(update={"status": self.receipt.status.model_copy(update={"authority": Authority()})})
        self.publish()

        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=True)

    def test_revocation_during_download_is_not_overwritten(self) -> None:
        coordinator = self.ready()

        def revoke() -> None:
            current = self.store.read()
            assert current is not None
            _ = self.store.update(current, phase=Phase.ATTENTION, reason="operator revoked")

        self.download_hook = revoke
        with self.assertRaises(DeploymentFailure):
            _ = coordinator.execute(self.command)

        state = self.store.read()
        assert state is not None
        self.assertEqual("operator revoked", state.reason)
        self.assertIsNotNone(state.pending)

    def test_bound_execution_cannot_be_dispatched_again(self) -> None:
        coordinator = self.ready()
        self.bind()

        with self.assertRaises(StateConflict):
            _ = coordinator.execute(self.command)

        self.assertEqual([], self.server.requests)

    def test_restart_after_dispatch_marker_only_finds_original_run(self) -> None:
        coordinator = self.ready()
        _ = (self.store.directory / f"dispatch-{self.command.command_id}.json").write_text(self.command.model_dump_json())

        receipt = coordinator.execute(self.command)

        self.assertEqual(self.run, receipt.run)
        self.assertFalse(any(r.method == "POST" for r in self.server.requests))

    def test_restart_with_incomplete_marker_never_posts(self) -> None:
        coordinator = self.ready()
        _ = (self.store.directory / f"dispatch-{self.command.command_id}.json").write_text("{")

        with self.assertRaises(StateConflict):
            _ = coordinator.execute(self.command)

        self.assert_attention(bound=False)
        self.assertFalse(any(r.method == "POST" for r in self.server.requests))

    def test_concurrent_parent_cannot_dispatch(self) -> None:
        coordinator = self.ready()

        with self.store.lock(), self.assertRaises(StateConflict):
            _ = coordinator.execute(self.command)

        self.assertEqual([], self.server.requests)

    def assert_attention(self, *, bound: bool) -> None:
        state = self.store.read()
        assert state is not None
        self.assertEqual(Phase.ATTENTION, state.phase)
        self.assertEqual(self.command, state.pending)
        self.assertEqual(self.run if bound else None, state.pending_run)
        self.assertEqual((), state.receipts)
