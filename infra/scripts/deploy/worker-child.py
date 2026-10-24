#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
import json
import os
import pwd
import sys
from pathlib import Path

from bluegreen.child_execution import ChildContext
from bluegreen.child_worker import worker_artifact
from bluegreen.ec2_identity import local_machine, metadata_client
from bluegreen.github_http import GitHubHttp, github_clients
from bluegreen.github_models import artifact_name
from bluegreen.github_runs import GitHubContext, GitHubRuns
from bluegreen.models import Command, RunIdentity
from bluegreen.nginx_switch import ProcessRunner
from bluegreen.ports import DeploymentFailure, SystemClock
from bluegreen.spring_worker import SpringWorker, worker_client
from bluegreen.ssh_journal import SshJournal
from bluegreen.status_settings import root_file, worker_token
from bluegreen.worker_profile import verify_profile
from bluegreen.worker_settings import (
    WorkerSettings,
    authorize_worker_machine,
    worker_route,
)
from pydantic import SecretStr, ValidationError


def main() -> int:
    try:
        if len(sys.argv) != 1 or pwd.getpwuid(os.geteuid()).pw_name != "jarihana-runner":
            raise DeploymentFailure("worker child requires its dedicated runner user and no arguments")
        settings = WorkerSettings.model_validate_json(root_file(Path("/etc/jarihana-deploy/worker-child.json"), 65536))
        command = Command.model_validate_json(os.environ["BG_COMMAND"])
        run = RunIdentity(run_id=int(os.environ["GITHUB_RUN_ID"]), attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
                          workflow="backend-bluegreen-worker-child.yml", ref=os.environ["GITHUB_REF"],
                          sha=os.environ["GITHUB_SHA"], event=os.environ["GITHUB_EVENT_NAME"])
        worker_route(settings, command, run, os.environ["GITHUB_REPOSITORY"], os.environ["BG_DEPLOYMENT_ID"],
                     os.environ["BG_COMMAND_ID"], os.environ["BG_SLOT"])
        token = worker_token(settings)
        clock = SystemClock()
        with metadata_client() as client:
            machine = local_machine(client, settings.topology.environment, settings.host.host_id)
        authorize_worker_machine(settings, machine)
        journal = SshJournal(settings.coordinator_address, settings.journal_key, settings.known_hosts,
                             account="jarihana-worker-grant")
        with github_clients() as clients, worker_client() as control_client:
            api = GitHubHttp(clients, SecretStr(os.environ["GH_TOKEN"]), clock)
            runs = GitHubRuns(api, GitHubContext(settings.repository, settings.topology))
            control = SpringWorker(control_client, settings.management_port, token, machine, clock)
            payload = worker_artifact(command, ChildContext(settings.topology, run, machine), runs, journal, control,
                                      clock, verify_local=lambda: verify_profile(settings, ProcessRunner()))
        directory = Path(os.environ["RUNNER_TEMP"]) / f"bg-worker-{run.run_id}-{run.attempt}"
        directory.mkdir(mode=0o700)
        _ = (directory / "child-result.json").write_bytes(payload)
        print(json.dumps({"worker_verified": True, "run_id": run.run_id,
                          "artifact": artifact_name(command, run.run_id)}))
    except (OSError, KeyError, ValueError, ValidationError, DeploymentFailure):
        print("worker child failed; inspect the persistent journal and application before another command", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
