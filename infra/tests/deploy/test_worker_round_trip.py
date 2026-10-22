import unittest
from collections.abc import Callable
from typing import final, override

from bluegreen.models import Action, DeploymentState, Phase, Receipt, RunIdentity
from bluegreen.ports import UnknownResult
from bluegreen.state_store import StateConflict
from bluegreen.worker_coordinator import WorkerCoordinator
from bluegreen.worker_parent_settings import WorkerRoundTripPlan
from bluegreen.worker_round_trip import RoundTripContext, WorkerRoundTrip
from controller_fakes import FakeApps
from test_worker_trial import TrialFixture, runtime


def coordinator(live: TrialFixture, verify: Callable[[], None] | None = None) -> WorkerRoundTrip:
    parent = RunIdentity(run_id=100, attempt=1, workflow="backend-bluegreen-worker-coordinator.yml",
        ref="refs/heads/feat/blue-green-deployment", sha="b" * 40, event="workflow_dispatch")
    plan = WorkerRoundTripPlan(a=live.apps.nodes[live.topology.a.slot], b=live.apps.nodes[live.topology.b.slot],
        completion_contract="released-handoff-v1")
    context = RoundTripContext(parent, plan, live.store.directory / "proof", verify if verify is not None else lambda: None)
    return WorkerRoundTrip(WorkerCoordinator(live.store, live.topology, live.apps, live.clock), context)


@final
class LostSecondActivationApps(FakeApps):
    @override
    def poll(self, run: RunIdentity) -> Receipt | None:
        receipt = super().poll(run)
        command = self.runs[run.run_id][1]
        if command.action is Action.ACTIVATE and sum(c.action is Action.ACTIVATE for c in self.commands) == 2:
            raise UnknownResult("handoff activation applied but response lost")
        return receipt


class WorkerRoundTripTest(unittest.TestCase):
    def test_revocation_at_final_cleanup_cannot_report_success(self) -> None:
        # Given
        with runtime() as live:
            def verify() -> None:
                current = live.store.read()
                if current is not None and current.phase is Phase.COMPLETE and len(live.apps.commands) == 41:
                    _ = live.store.update(current, phase=Phase.ATTENTION, reason="operator revoked final cleanup")

            parent = coordinator(live, verify)
            # When / Then
            with self.assertRaises(StateConflict):
                _ = parent.run()
            final = live.store.read()
            assert final is not None
            self.assertEqual("operator revoked final cleanup", final.reason)
            self.assertFalse((parent.context.directory / "cleanup.json").exists())

    def test_all_four_stages_preserve_exact_archives_and_end_unassigned(self) -> None:
        # Given
        with runtime() as live:
            parent = coordinator(live)
            # When
            states = parent.run()
            # Then
            self.assertEqual([8, 12, 12, 9], [len(state.receipts) for state in states])
            self.assertEqual(4, len({state.deployment_id for state in states}))
            self.assertEqual(states[-1], live.store.read())
            self.assertTrue(all(state.phase is Phase.COMPLETE for state in states))
            assert states[-1].authority is not None
            self.assertIsNone(states[-1].authority.owner_host)
            for name, state in zip(("bootstrap", "A-to-B", "B-to-A", "cleanup"), states, strict=True):
                archived = DeploymentState.model_validate_json((parent.context.directory / f"{name}.json").read_bytes())
                self.assertEqual(state, archived)
            self.assertEqual(41, len(live.apps.commands))

    def test_unknown_handoff_result_does_not_start_return_or_cleanup(self) -> None:
        # Given
        with runtime(LostSecondActivationApps) as live:
            parent = coordinator(live)
            # When / Then
            with self.assertRaises(UnknownResult):
                _ = parent.run()
            final = live.store.read()
            assert final is not None and final.pending is not None
            self.assertEqual(Phase.ATTENTION, final.phase)
            self.assertEqual(Action.ACTIVATE, final.pending.action)
            self.assertIsNotNone(final.pending_run)
            self.assertTrue((parent.context.directory / "bootstrap.json").exists())
            self.assertTrue((parent.context.directory / "interrupted.json").exists())
            self.assertFalse((parent.context.directory / "B-to-A.json").exists())
            self.assertFalse((parent.context.directory / "cleanup.json").exists())

    def test_same_parent_cannot_start_a_second_round_trip_even_with_new_output_directory(self) -> None:
        # Given
        with runtime() as live:
            parent = coordinator(live)
            final = parent.run()[-1]
            issued = len(live.apps.commands)
            context = RoundTripContext(parent.context.parent, parent.context.plan,
                live.store.directory / "second-proof", lambda: None)
            # When / Then
            with self.assertRaises(StateConflict):
                _ = WorkerRoundTrip(parent.exchange, context).run()
            self.assertEqual(final, live.store.read())
            self.assertEqual(issued, len(live.apps.commands))

    def test_unfinished_journal_is_never_replaced_by_a_new_trial(self) -> None:
        # Given
        with runtime() as live:
            _ = live.trial()
            original = live.store.read()
            parent = coordinator(live)
            # When / Then
            with self.assertRaises(StateConflict):
                _ = parent.run()
            self.assertEqual(original, live.store.read())
            self.assertEqual([], live.apps.commands)

    def test_completed_stage_changed_by_operator_is_not_overwritten(self) -> None:
        # Given
        with runtime() as live:
            def verify() -> None:
                current = live.store.read()
                if current is not None and current.phase is Phase.COMPLETE:
                    _ = live.store.update(current, phase=Phase.ATTENTION, reason="operator revoked between stages")

            parent = coordinator(live, verify)
            # When / Then
            with self.assertRaises(StateConflict):
                _ = parent.run()
            final = live.store.read()
            assert final is not None
            self.assertEqual("operator revoked between stages", final.reason)
            self.assertEqual(8, len(live.apps.commands))
            self.assertFalse((parent.context.directory / "cleanup.json").exists())
