from .child_execution import ChildContext, ChildGate, JournalReader
from .github_models import Workflow
from .github_operations import authorize
from .github_runs import GitHubRuns
from .models import Command
from .ports import Clock, DeploymentFailure


def check_running(command: Command, context: ChildContext, runs: GitHubRuns, workflow: Workflow) -> None:
    execution = runs.exact(context.run, command, workflow)
    if execution.status != "in_progress" or execution.conclusion is not None:
        raise DeploymentFailure("child GitHub execution is not running")


def open_child(command: Command, context: ChildContext, runs: GitHubRuns,
               journal: JournalReader, clock: Clock) -> tuple[ChildGate, Workflow]:
    if runs.context.topology != context.topology:
        raise DeploymentFailure("GitHub and child topology differ")
    workflow = runs.preflight(command)
    check_running(command, context, runs, workflow)
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
    return gate, workflow
