"""Bind a read-only snapshot to a live GitHub execution and fresh child grants."""
from collections.abc import Callable

from .child_artifacts import serialize_artifact
from .child_execution import ChildContext, ChildGate, JournalReader
from .github_operations import authorize
from .github_runs import GitHubRuns
from .models import Action, AppStatus, Command, Receipt
from .ports import Clock, DeploymentFailure


def status_artifact(command: Command, context: ChildContext, runs: GitHubRuns,
                    journal: JournalReader, source: Callable[[], AppStatus], clock: Clock) -> bytes:
    if command.action is not Action.STATUS or command.boot_id is None:
        raise DeploymentFailure("status child requires a STATUS command and exact application boot")
    if runs.context.topology != context.topology:
        raise DeploymentFailure("GitHub and child topology differ")
    workflow = runs.preflight(command)
    execution = runs.exact(context.run, command, workflow)
    if execution.status != "in_progress" or execution.conclusion is not None:
        raise DeploymentFailure("child GitHub execution is not running")
    gate = ChildGate(context, journal, clock)
    binding_deadline = clock.monotonic() + 30
    while True:
        state = journal.read()
        if state is None:
            raise DeploymentFailure("child grant journal is missing")
        authorize(command, state, clock.now())
        if state.pending_run is not None:
            break
        if clock.monotonic() >= binding_deadline:
            raise DeploymentFailure("parent did not bind this child execution")
        clock.sleep(1)
    _ = gate.state(command)
    actual = source()
    gate.check(command, actual)
    execution = runs.exact(context.run, command, workflow)
    if execution.status != "in_progress" or execution.conclusion is not None:
        raise DeploymentFailure("child GitHub execution ended during status lookup")
    gate.check(command, actual)
    receipt = Receipt(schema_version=1, command=command, run=context.run, success=True, status=actual)
    return serialize_artifact(receipt, None)
