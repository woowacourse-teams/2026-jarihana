#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
# Run only from backend-bluegreen-status-child.yml with administrator-owned /etc/jarihana-deploy/status-child.json.
import json
import os
import sys
from pathlib import Path

from bluegreen.child_execution import ChildContext
from bluegreen.child_status import status_artifact
from bluegreen.ec2_identity import local_machine, metadata_client
from bluegreen.github_http import GitHubHttp, github_clients
from bluegreen.github_models import artifact_name
from bluegreen.github_runs import GitHubContext, GitHubRuns
from bluegreen.models import Command, RunIdentity
from bluegreen.ports import DeploymentFailure, SystemClock
from bluegreen.spring_status import snapshot
from bluegreen.ssh_journal import SshJournal
from bluegreen.status_settings import StatusSettings, root_file, worker_token
from pydantic import SecretStr, ValidationError


def main() -> int:
    try:
        if len(sys.argv) != 1:
            raise DeploymentFailure("STATUS child does not accept arguments")
        settings = StatusSettings.model_validate_json(root_file(Path("/etc/jarihana-deploy/status-child.json"), 65536))
        command = Command.model_validate_json(os.environ["BG_COMMAND"])
        run = RunIdentity(run_id=int(os.environ["GITHUB_RUN_ID"]), attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
                          workflow="backend-bluegreen-status-child.yml", ref=os.environ["GITHUB_REF"],
                          sha=os.environ["GITHUB_SHA"], event=os.environ["GITHUB_EVENT_NAME"])
        if (os.environ["GITHUB_REPOSITORY"] != settings.repository.full_name or os.environ["BG_SLOT"] != "B"
                or os.environ["BG_DEPLOYMENT_ID"] != str(command.deployment_id)
                or os.environ["BG_COMMAND_ID"] != str(command.command_id)
                or command.host != settings.topology.b):
            raise DeploymentFailure("STATUS routing inputs do not match the command")
        token = worker_token(settings)
        clock = SystemClock()
        with metadata_client() as client:
            machine = local_machine(client, settings.topology.environment, settings.topology.b.host_id)
        context = ChildContext(settings.topology, run, machine)
        journal = SshJournal(settings.coordinator_address, settings.journal_key, settings.known_hosts)
        with github_clients() as clients:
            api = GitHubHttp(clients, SecretStr(os.environ["GH_TOKEN"]), clock)
            runs = GitHubRuns(api, GitHubContext(settings.repository, settings.topology))
            payload = status_artifact(command, context, runs, journal,
                                      lambda: snapshot(clients.downloads, settings.management_port, token, machine), clock)
        directory = Path(os.environ["RUNNER_TEMP"]) / f"bg-status-{run.run_id}-{run.attempt}"
        directory.mkdir(mode=0o700)
        _ = (directory / "child-result.json").write_bytes(payload)
        print(json.dumps({"status_verified": True, "run_id": run.run_id,
                          "artifact": artifact_name(command, run.run_id)}))
    except (OSError, KeyError, ValueError, ValidationError, DeploymentFailure):
        print("STATUS child validation failed; no deployment operation was executed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
