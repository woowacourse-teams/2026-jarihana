#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
import json
import os
import pwd
import sys
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from bluegreen.coordinator_settings import CoordinatorSettings, verify_parent
from bluegreen.ec2_identity import local_machine, metadata_client
from bluegreen.github_applications import GitHubApplications
from bluegreen.github_http import GitHubHttp, github_clients
from bluegreen.github_runs import GitHubContext
from bluegreen.models import Action, Command, Phase, RunIdentity
from bluegreen.ports import DeploymentFailure, SystemClock
from bluegreen.state_store import StateConflict, StateStore
from bluegreen.status_coordinator import StatusCoordinator
from bluegreen.status_settings import root_file
from pydantic import SecretStr, ValidationError


def main() -> int:
    try:
        if len(sys.argv) != 1 or pwd.getpwuid(os.geteuid()).pw_name != "jarihana-coordinator":
            raise DeploymentFailure("STATUS coordinator requires its dedicated runner user and no arguments")
        settings = CoordinatorSettings.model_validate_json(root_file(
            Path("/etc/jarihana-deploy/status-coordinator.json"), 65536))
        run = RunIdentity(run_id=int(os.environ["GITHUB_RUN_ID"]), attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
                          workflow="backend-bluegreen-status-coordinator.yml", ref=os.environ["GITHUB_REF"],
                          sha=os.environ["GITHUB_SHA"], event=os.environ["GITHUB_EVENT_NAME"])
        if (os.environ["GITHUB_REPOSITORY"] != settings.repository.full_name
                or os.environ["GITHUB_WORKFLOW_REF"] != f"{settings.repository.full_name}/.github/workflows/{run.workflow}@{run.ref}"):
            raise DeploymentFailure("STATUS parent repository or workflow reference does not match")
        clock = SystemClock()
        with metadata_client() as client:
            machine = local_machine(client, settings.topology.environment, "jarihana-coordinator")
        if machine.instance_id != settings.topology.coordinator_instance_id:
            raise DeploymentFailure("STATUS parent is not on the coordinator EC2")
        command = Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=run.run_id,
                          parent_attempt=run.attempt, phase=Phase.PREPARING, action=Action.STATUS,
                          host=settings.topology.b, boot_id=settings.expected_boot, image=settings.expected_image,
                          deadline=clock.now() + timedelta(seconds=300), authority=None)
        with github_clients() as clients:
            api = GitHubHttp(clients, SecretStr(os.environ["GH_TOKEN"]), clock)
            verify_parent(api, settings, run, command.deadline)
            store = StateStore(Path(settings.state_directory))
            apps = GitHubApplications(api, GitHubContext(settings.repository, settings.topology), store)
            receipt = StatusCoordinator(store, settings.topology, apps, clock).execute(command)
        output = Path(os.environ["RUNNER_TEMP"]) / f"bg-coordinator-{run.run_id}-{run.attempt}"
        output.mkdir(mode=0o700)
        final = store.read()
        if final is None or final.phase is not Phase.COMPLETE:
            raise StateConflict("completed STATUS journal disappeared")
        _ = (output / "state.json").write_text(final.model_dump_json(indent=2))
        _ = (output / "receipt.json").write_text(receipt.model_dump_json(indent=2))
        print(json.dumps({"status_verified": True, "parent_run": run.run_id, "child_run": receipt.run.run_id}))
    except (OSError, KeyError, ValueError, ValidationError, DeploymentFailure, StateConflict):
        print("STATUS coordinator failed; inspect the persistent journal before another run", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
