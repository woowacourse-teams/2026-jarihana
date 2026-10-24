#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
# Run with both infra/scripts/deploy and this directory in PYTHONPATH:
# JARIHANA_E2E_JAVA_IMAGE=<verified Java 21 digest> uv run --script this-file.py
# Uses the existing local bootJar and unique disposable Docker resources only.
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from typing import final, override
from uuid import uuid4

from bluegreen.models import Phase, RunIdentity, Slot
from bluegreen.nginx_switch import ApiProbe, ProcessRunner
from bluegreen.ports import DeploymentFailure
from bluegreen.worker_coordinator import WorkerCoordinator
from bluegreen.worker_parent_settings import WorkerRoundTripPlan
from bluegreen.worker_round_trip import RoundTripContext, WorkerRoundTrip
from controller_fakes import OLD_IMAGE
from local_runtime import LocalRuntime
from local_spring import SpringNode


@final
class UnassignedRuntime(LocalRuntime):
    @override
    def _bootstrap(self, node: SpringNode) -> None:
        """Leave the isolated DB unassigned so WorkerTrial must prepare its first owner."""


def main() -> None:
    directory = Path("local-plans/blue-green-deployment/artifacts/local-worker-handoff") / str(uuid4())
    directory.mkdir(parents=True)
    runtime = UnassignedRuntime(directory.resolve())
    finished = Event()
    samples: list[bool] = []
    try:
        topology, store, adapters, http_port = runtime.setup()
        runtime.nodes[Slot.B].start(OLD_IMAGE)

        def request_loop() -> None:
            runner = ProcessRunner()
            while not finished.is_set():
                try:
                    _ = ApiProbe.model_validate_json(runner.run(("curl", "-fsS", "--max-time", "3",
                        f"http://127.0.0.1:{http_port}/api/groups?size=1")))
                    samples.append(True)
                except DeploymentFailure:
                    samples.append(False)
                _ = finished.wait(0.05)

        counts: list[int] = []

        def verify_stage() -> None:
            current = store.read()
            if current is None or current.phase is not Phase.COMPLETE:
                return
            a, b = runtime.nodes[Slot.A].snapshot(), runtime.nodes[Slot.B].snapshot()
            if a.authority != b.authority or current.authority != a.authority or a.authority.phase != "COMPLETE":
                raise DeploymentFailure("real JVMs disagree about the completed authority")
            if a.authority.owner_host is None:
                if not a.drained() or not b.drained() or a.authority.owner_boot is not None:
                    raise DeploymentFailure("trial cleanup did not prove both workers paused and released")
            else:
                live = a if a.authority.owner_host == a.host_id else b
                previous = b if live is a else a
                if (live.worker != "ACTIVE" or not previous.drained() or live.authority.owner_host != live.host_id
                        or live.authority.owner_boot != live.boot_id):
                    raise DeploymentFailure("real JVMs disagree about the transferred exclusive owner")

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(request_loop)
            try:
                plan = WorkerRoundTripPlan(a=runtime.nodes[Slot.A].snapshot(), b=runtime.nodes[Slot.B].snapshot(),
                    completion_contract="released-handoff-v1")
                parent = RunIdentity(run_id=100, attempt=1, workflow="backend-bluegreen-worker-coordinator.yml",
                    ref="refs/heads/feat/blue-green-deployment", sha="b" * 40, event="workflow_dispatch")
                context = RoundTripContext(parent, plan, directory / "parent", verify_stage)
                states = WorkerRoundTrip(WorkerCoordinator(store, topology, adapters.apps, adapters.clock), context).run()
                counts = [len(state.receipts) for state in states]
            finally:
                finished.set()
            _ = future.result(timeout=10)
        if not samples or not all(samples):
            raise DeploymentFailure("HTTP failed during worker handoff")
        _ = (directory / "result.json").write_text(json.dumps({
            "real_spring_processes": 2, "real_postgres": True, "directions": ["A-to-B", "B-to-A"],
            "stages": ["bootstrap", "A-to-B", "B-to-A", "cleanup"],
            "commands_per_stage": counts, "http_samples": len(samples), "http_failures": samples.count(False),
            "final_workers_paused": True, "final_authority_unassigned": True,
            "round_trip_parent_driver_verified": True,
            "external_push_enabled": False, "github_execution_verified": False,
            "http_switch_tested": False, "observation_900_seconds_tested": False,
        }, indent=2))
        print(f"LOCAL_WORKER_HANDOFF_PASSED artifacts={directory}")
    finally:
        finished.set()
        runtime.close()


if __name__ == "__main__":
    main()
