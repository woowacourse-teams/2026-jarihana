"""Bind a read-only snapshot to a live GitHub execution and fresh child grants."""
from collections.abc import Callable

from .child_artifacts import serialize_artifact
from .child_execution import ChildContext, JournalReader
from .child_github import check_running, open_child
from .github_runs import GitHubRuns
from .models import Action, AppStatus, Command, Receipt
from .ports import Clock, DeploymentFailure


def status_artifact(command: Command, context: ChildContext, runs: GitHubRuns,
                    journal: JournalReader, source: Callable[[], AppStatus], clock: Clock) -> bytes:
    if command.action is not Action.STATUS or command.boot_id is None:
        raise DeploymentFailure("status child requires a STATUS command and exact application boot")
    gate, workflow = open_child(command, context, runs, journal, clock)
    actual = source()
    gate.check(command, actual)
    check_running(command, context, runs, workflow)
    gate.check(command, actual)
    receipt = Receipt(schema_version=1, command=command, run=context.run, success=True, status=actual)
    return serialize_artifact(receipt, None)
