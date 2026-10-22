#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# ─── How to run ───
# Build backend/ with ./gradlew bootJar; Docker needs postgres:17 and nginx:1.30.5-alpine.
# Run: uv run infra/tests/deploy/run_local_e2e.py
# Uses local-only fixture credentials and unique disposable Docker resource names.
# ──────────────────
"""Two real Spring Boot JVMs + PostgreSQL + Nginx; virtual 900-second observation."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
import json
import tempfile
import time

from controller_fakes import NEW_IMAGE
from local_runtime import LocalRuntime
from bluegreen.controller import DeploymentController
from bluegreen.models import DeploymentRequest, Phase, Slot
from bluegreen.nginx_switch import ApiProbe, ProcessRunner
from bluegreen.ports import DeploymentFailure


def main() -> None:
    directory = Path(tempfile.mkdtemp(prefix="jarihana-bluegreen-e2e-", dir="/private/tmp")).resolve()
    print(f"Local fixture artifacts: {directory}", flush=True)
    runtime = LocalRuntime(directory)
    finished = Event()
    samples: list[bool] = []
    errors: list[str] = []
    try:
        topology, store, adapters, public_port = runtime.setup()
        runner = ProcessRunner()
        controller = DeploymentController(store, adapters, topology)

        def request_loop() -> None:
            while not finished.is_set():
                try:
                    ApiProbe.model_validate_json(runner.run(("curl", "--fail", "--silent", "--max-time", "3",
                                                             f"http://127.0.0.1:{public_port}/api/groups?size=1")))
                    samples.append(True)
                except DeploymentFailure as error:
                    samples.append(False)
                    errors.append(str(error))
                finished.wait(0.02)

        with ThreadPoolExecutor(max_workers=1) as executor:
            running = executor.submit(request_loop)
            try:
                first = controller.run(DeploymentRequest(image=NEW_IMAGE, parent_run_id=100, rollback_compatible=True))
                (directory / "first.json").write_text(first.model_dump_json(indent=2))
                if first.phase is not Phase.COMPLETE:
                    raise DeploymentFailure(f"first deployment failed: {first.reason}")
                second = controller.run(DeploymentRequest(image=NEW_IMAGE, parent_run_id=101, rollback_compatible=True))
                (directory / "second.json").write_text(second.model_dump_json(indent=2))
                if second.phase is not Phase.COMPLETE or adapters.proxy.active() is not Slot.A:
                    raise DeploymentFailure(f"reverse deployment failed: {second.reason}")
                adapters.telemetry.failure_at = adapters.clock.monotonic() + 20
                third = controller.run(DeploymentRequest(image=NEW_IMAGE, parent_run_id=102, rollback_compatible=True))
                (directory / "rollback.json").write_text(third.model_dump_json(indent=2))
                if third.phase is not Phase.ROLLED_BACK or not third.http_recovered or not third.worker_recovered:
                    raise DeploymentFailure(f"automatic rollback failed: {third.reason}")
            finally:
                finished.set()
            running.result(timeout=10)
        report = {"requests": len(samples), "failures": samples.count(False),
                  "real_spring_processes": 2, "observation_clock": "virtual (900s per deployment)",
                  "scenarios": ["A-to-B", "B-to-A", "automatic HTTP and worker rollback"],
                  "aws_and_github": "fake adapters", "artifacts": str(directory)}
        (directory / "summary.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report))
        if not samples or errors:
            raise DeploymentFailure("continuous request failures occurred")
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
