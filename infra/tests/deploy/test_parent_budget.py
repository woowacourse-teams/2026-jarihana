import unittest
from datetime import timedelta

from bluegreen.parent_applications import ParentBudget
from bluegreen.ports import DeploymentFailure
from controller_fakes import FakeClock


class ParentBudgetTest(unittest.TestCase):
    def test_command_deadline_must_fit_the_original_budget(self) -> None:
        # Given
        clock = FakeClock()
        end = clock.now() + timedelta(seconds=30)
        budget = ParentBudget(clock, end, 30)
        # When / Then
        budget.check(end)
        with self.assertRaises(DeploymentFailure):
            budget.check(end + timedelta(seconds=1))

    def test_wall_clock_rollback_cannot_extend_monotonic_budget(self) -> None:
        # Given
        clock = FakeClock()
        budget = ParentBudget(clock, clock.now() + timedelta(seconds=30), 30)
        clock.sleep(30)
        clock.wall_shift = -3600
        # When / Then
        with self.assertRaises(DeploymentFailure):
            budget.check(None)

    def test_wall_clock_expiry_also_stops_the_parent(self) -> None:
        # Given
        clock = FakeClock()
        budget = ParentBudget(clock, clock.now() + timedelta(seconds=30), 30)
        clock.wall_shift = 31
        # When / Then
        with self.assertRaises(DeploymentFailure):
            budget.check(None)
