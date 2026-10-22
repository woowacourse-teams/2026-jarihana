#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
import hashlib
import json
import os
import pwd
import sys
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

from bluegreen.ec2_identity import local_machine, metadata_client
from bluegreen.github_applications import GitHubApplications
from bluegreen.github_http import GitHubHttp, github_clients
from bluegreen.github_runs import GitHubContext
from bluegreen.models import Action, Command, DeploymentState, Phase, RunIdentity
from bluegreen.parent_applications import ParentApplications, ParentBudget
from bluegreen.ports import DeploymentFailure, SystemClock
from bluegreen.state_store import StateConflict, StateStore
from bluegreen.status_settings import root_file
from bluegreen.worker_coordinator import WorkerCoordinator
from bluegreen.worker_parent_settings import (
    WorkerParentSettings,
    WorkerScenario,
    verify_worker_parent,
)
from bluegreen.worker_round_trip import RoundTripContext, WorkerRoundTrip
from pydantic import SecretStr, ValidationError


def main() -> int:
    try:
        if len(sys.argv) != 1 or pwd.getpwuid(os.geteuid()).pw_name != "jarihana-coordinator":
            raise DeploymentFailure("worker parent requires its dedicated user and no arguments")
        settings = WorkerParentSettings.model_validate_json(root_file(
            Path("/etc/jarihana-deploy/worker-coordinator.json"), 65536))
        scenario = WorkerScenario(os.environ["BG_SCENARIO"])
        settings.select(scenario)
        run = RunIdentity(run_id=int(os.environ["GITHUB_RUN_ID"]), attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
            workflow="backend-bluegreen-worker-coordinator.yml", ref=os.environ["GITHUB_REF"],
            sha=os.environ["GITHUB_SHA"], event=os.environ["GITHUB_EVENT_NAME"])
        if (os.environ["GITHUB_REPOSITORY"] != settings.repository.full_name
                or os.environ["GITHUB_WORKFLOW_REF"] != f"{settings.repository.full_name}/.github/workflows/{run.workflow}@{run.ref}"):
            raise DeploymentFailure("worker parent repository differs")
        with metadata_client() as client:
            machine = local_machine(client, settings.topology.environment, "jarihana-coordinator")
        if machine.instance_id != settings.topology.coordinator_instance_id:
            raise DeploymentFailure("worker parent is not on the Nginx coordinator")
        clock = SystemClock()
        store = StateStore(Path(settings.state_directory))
        output = Path(os.environ["RUNNER_TEMP"]) / f"bg-worker-coordinator-{run.run_id}-{run.attempt}"
        with github_clients() as clients:
            api = GitHubHttp(clients, SecretStr(os.environ["GH_TOKEN"]), clock)
            verify_worker_parent(api, settings, run, clock.now() + timedelta(seconds=30))
            apps = GitHubApplications(api, GitHubContext(settings.repository, settings.topology), store)
            plan = settings.round_trip
            if plan is not None:
                budget = ParentBudget(clock, clock.now() + timedelta(seconds=plan.total_seconds),
                    clock.monotonic() + plan.total_seconds)

                def check_parent(command_deadline: datetime | None = None) -> None:
                    budget.check(command_deadline)
                    verify_worker_parent(api, settings, run, min(budget.deadline, clock.now() + timedelta(seconds=30)))
                    budget.check(command_deadline)

                exchange = WorkerCoordinator(store, settings.topology, ParentApplications(apps, check_parent), clock)
                states = WorkerRoundTrip(exchange, RoundTripContext(run, plan, output, lambda: check_parent(None))).run()
                final = states[-1]
            else:
                with store.lock():
                    state = store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4(),
                        target=settings.target_slot, old=settings.target_slot.other(),
                        image=settings.before.image, parent_run_id=run.run_id, parent_attempt=run.attempt,
                        topology_digest=hashlib.sha256(settings.topology.model_dump_json().encode()).hexdigest(),
                        target_app=settings.before, authority=settings.before.authority, heartbeat=clock.now()))
                coordinator = WorkerCoordinator(store, settings.topology, apps, clock)
                for action in (Action.BEGIN, Action.COMPLETE):
                    verify_worker_parent(api, settings, run, clock.now() + timedelta(seconds=30))
                    with store.lock():
                        latest = store.read()
                        if latest is None or latest.deployment_id != state.deployment_id or latest.pending is not None:
                            raise StateConflict("worker smoke journal changed")
                        command = Command(command_id=uuid4(), deployment_id=latest.deployment_id,
                            parent_run_id=run.run_id, parent_attempt=run.attempt, phase=Phase.PREPARING, action=action,
                            host=settings.host, boot_id=settings.before.boot_id, image=settings.before.image,
                            deadline=clock.now() + timedelta(seconds=300), authority=latest.authority)
                        _ = store.save(latest, latest.model_copy(update={"revision": latest.revision + 1,
                            "pending": command, "heartbeat": clock.now()}))
                    _ = coordinator.execute(command)
                with store.lock():
                    final = store.read()
                    if (final is None or final.deployment_id != state.deployment_id or final.pending is not None
                            or final.target_app is None or not final.target_app.requests_drained()
                            or final.authority is None or final.authority.phase != "COMPLETE"
                            or final.authority.status != "UNASSIGNED" or final.authority.owner_host is not None):
                        raise StateConflict("worker smoke completion was not proved")
                    final = store.update(final, phase=Phase.COMPLETE)
                states = (final,)
                output.mkdir(mode=0o700)
        _ = (output / "state.json").write_text(final.model_dump_json(indent=2))
        print(json.dumps({"worker_scenario_verified": scenario.value, "parent_run": run.run_id,
                          "child_runs": [receipt.run.run_id for state in states for receipt in state.receipts]}))
    except (OSError, KeyError, ValueError, ValidationError, DeploymentFailure, StateConflict):
        print("worker parent failed; reconcile the journal and application without redispatch", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
