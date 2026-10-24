#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
# Run with both infra/scripts/deploy and this directory in PYTHONPATH:
# JARIHANA_E2E_JAVA_IMAGE=<verified Java 21 digest> uv run --script this-file.py
# Uses the existing local bootJar and unique disposable Docker resources only.
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from typing import final, override
from uuid import uuid4

from bluegreen.models import DeploymentState, Phase, Slot
from bluegreen.nginx_switch import ApiProbe, ProcessRunner
from bluegreen.ports import DeploymentFailure
from bluegreen.worker_coordinator import WorkerCoordinator
from bluegreen.worker_handoff import WorkerHandoff
from bluegreen.worker_trial import TrialOperation, WorkerTrial
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
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(request_loop)
            try:
                stages: tuple[tuple[str, Slot, TrialOperation | None, Slot | None], ...] = (
                    ("bootstrap", Slot.A, TrialOperation.BOOTSTRAP, Slot.A),
                    ("A-to-B", Slot.A, None, Slot.B),
                    ("B-to-A", Slot.B, None, Slot.A),
                    ("cleanup", Slot.A, TrialOperation.CLEANUP, None),
                )
                for name, old, operation, expected_owner in stages:
                    target = old.other()
                    before = runtime.nodes[old].snapshot()
                    standby = runtime.nodes[target].snapshot()
                    _ = store.create(DeploymentState(deployment_id=uuid4(), session_id=uuid4(), old=old, target=target,
                        parent_run_id=100, parent_attempt=1, old_app=before, target_app=standby,
                        authority=before.authority, heartbeat=adapters.clock.now(),
                        topology_digest=hashlib.sha256(topology.model_dump_json().encode()).hexdigest()))
                    handoff = WorkerHandoff(WorkerCoordinator(store, topology, adapters.apps, adapters.clock))
                    final = handoff.run() if operation is None else WorkerTrial(handoff).run(operation)
                    a, b = runtime.nodes[Slot.A].snapshot(), runtime.nodes[Slot.B].snapshot()
                    if final.phase is not Phase.COMPLETE or a.authority != b.authority or a.authority.phase != "COMPLETE":
                        raise DeploymentFailure("real JVMs disagree about the completed authority")
                    if expected_owner is None:
                        if not a.drained() or not b.drained() or a.authority.owner_host is not None or a.authority.owner_boot is not None:
                            raise DeploymentFailure("trial cleanup did not prove both workers paused and released")
                    else:
                        live = a if expected_owner is Slot.A else b
                        previous = b if expected_owner is Slot.A else a
                        if (live.worker != "ACTIVE" or not previous.drained() or live.authority.owner_host != live.host_id
                                or live.authority.owner_boot != live.boot_id):
                            raise DeploymentFailure("real JVMs disagree about the transferred exclusive owner")
                    counts.append(len(final.receipts))
                    _ = (directory / f"{name}.json").write_text(final.model_dump_json(indent=2))
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
            "external_push_enabled": False, "github_execution_verified": False,
            "http_switch_tested": False, "observation_900_seconds_tested": False,
        }, indent=2))
        print(f"LOCAL_WORKER_HANDOFF_PASSED artifacts={directory}")
    finally:
        finished.set()
        runtime.close()


if __name__ == "__main__":
    main()
