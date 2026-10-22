#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
# Run with PYTHONPATH=infra/scripts/deploy:infra/tests/deploy; reads the existing B app without restarting it.
import json
import secrets
import socket
import tempfile
from pathlib import Path
from uuid import uuid4

from bluegreen.child_execution import MachineIdentity
from bluegreen.github_http import github_clients
from bluegreen.ports import DeploymentFailure
from bluegreen.spring_status import snapshot
from cloud_worker_runtime import B, control_token, tunnel


def main() -> None:
    B.identify()
    original = B.inspect("jarihana-bluegreen-rehearsal-b-backend-1")
    token = control_token(original)
    port = 49152 + secrets.randbelow(16384)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", port))
    with tempfile.TemporaryDirectory(prefix="bg-status-", dir="/private/tmp") as directory:
        with tunnel(B, (f"127.0.0.1:{port}:127.0.0.1:18081",), Path(directory) / "s"):
            with github_clients() as clients:
                actual = snapshot(clients.downloads, port, token, MachineIdentity(
                    environment="dev-rehearsal", host_id="jarihana-rehearsal-b", instance_id=B.instance_id))
    if not actual.healthy or actual.worker != "PAUSED" or actual.in_flight != 0:
        raise DeploymentFailure("existing B is not healthy and paused")
    if B.inspect("jarihana-bluegreen-rehearsal-b-backend-1").Id != original.Id:
        raise DeploymentFailure("B container changed during status probe")
    artifacts = Path("local-plans/blue-green-deployment/artifacts/cloud-status") / str(uuid4())
    artifacts.mkdir(parents=True)
    _ = (artifacts / "status.json").write_text(actual.model_dump_json(indent=2))
    _ = (artifacts / "result.json").write_text(json.dumps({
        "live_management_get_verified": True, "container_unchanged": True, "github_run_verified": False,
        "artifact": str(artifacts / "status.json")}, indent=2))
    print(f"LIVE_B_STATUS_PASSED boot={actual.boot_id} worker={actual.worker} http_in_flight={actual.http_in_flight}")


if __name__ == "__main__":
    main()
