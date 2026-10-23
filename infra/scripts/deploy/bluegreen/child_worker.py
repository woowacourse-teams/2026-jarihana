from collections.abc import Callable

from .child_artifacts import serialize_artifact
from .child_execution import ChildContext, JournalReader
from .child_github import check_running, open_child
from .github_runs import GitHubRuns
from .models import AppStatus, Command, Receipt
from .ports import Clock, DeploymentFailure
from .spring_worker import SpringWorker
from .worker_command import payload


def worker_artifact(command: Command, context: ChildContext, runs: GitHubRuns,
                    journal: JournalReader, control: SpringWorker, clock: Clock,
                    *, verify_local: Callable[[], None] | None = None) -> bytes:
    _ = payload(command)
    if control.machine != context.machine:
        raise DeploymentFailure("worker transport is not on the approved machine")
    if verify_local is not None:
        verify_local()
    gate, workflow = open_child(command, context, runs, journal, clock)

    def before_write(actual: AppStatus) -> None:
        gate.check(command, actual)
        check_running(command, context, runs, workflow)
        if verify_local is not None:
            verify_local()
        gate.check(command, actual)

    result = control.execute(command, before_write)
    if verify_local is not None:
        verify_local()
    gate.check(command, result)
    check_running(command, context, runs, workflow)
    gate.check(command, result)
    return serialize_artifact(Receipt(schema_version=1, command=command, run=context.run,
                                     success=True, status=result), None)
