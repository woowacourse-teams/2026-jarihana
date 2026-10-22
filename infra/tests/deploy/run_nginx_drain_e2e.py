#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# ─── How to run ───
# Run: uv run infra/tests/deploy/run_nginx_drain_e2e.py
# Requires local Docker with nginx:1.30.5-alpine. No AWS, Spring or operating DB access.
# ──────────────────
"""Real nginx preserves a held old connection and rejects an invalid candidate."""
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread
from unittest.mock import patch
import json
import tempfile
import time

from controller_fakes import fixture
from local_runtime import LocalRuntime
from bluegreen.models import Slot
from bluegreen.nginx_switch import ProcessRunner
from bluegreen.ports import DeploymentFailure


def fixture_server(slot: Slot, started: Event, release: Event) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.headers.get("X-Test-Hold") == "yes":
                started.set()
                if not release.wait(15):
                    raise TimeoutError("fixture was not released")
            body = json.dumps({"success": True, "fixture_slot": slot.value}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: str) -> None:
            return None

    server = ThreadingHTTPServer(("0.0.0.0", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> None:
    directory = Path(tempfile.mkdtemp(prefix="jarihana-nginx-drain-", dir="/private/tmp"))
    started, release = Event(), Event()
    a, b = fixture_server(Slot.A, started, release), fixture_server(Slot.B, Event(), Event())
    runtime = LocalRuntime(directory)
    try:
        topology, _, _ = fixture(directory / "state")
        topology = topology.model_copy(update={
            "a": topology.a.model_copy(update={"upstream": f"host.docker.internal:{a.server_port}"}),
            "b": topology.b.model_copy(update={"upstream": f"host.docker.internal:{b.server_port}"}),
        })
        proxy, port = runtime.start_proxy(topology)
        runner = ProcessRunner()
        url = f"http://127.0.0.1:{port}/api/groups?size=1"
        with ThreadPoolExecutor(max_workers=1) as executor:
            held = executor.submit(runner.run, ("curl", "--fail", "--silent", "--max-time", "10",
                                                "--header", "X-Test-Hold: yes", url))
            try:
                if not started.wait(5):
                    raise DeploymentFailure("held request did not reach A")
                ticket = proxy.switch(topology.b)
                if proxy.drained(ticket):
                    raise DeploymentFailure("reload was incorrectly treated as old connection drain")
                fresh = json.loads(runner.run(("curl", "--fail", "--silent", url)))
                if fresh["fixture_slot"] != "B":
                    raise DeploymentFailure("fresh request did not reach B")
            finally:
                release.set()
            old = json.loads(held.result(timeout=5))
            if old["fixture_slot"] != "A":
                raise DeploymentFailure("existing request did not finish on A")
        deadline = time.monotonic() + 5
        while not proxy.drained(ticket):
            if time.monotonic() >= deadline:
                raise DeploymentFailure("old worker did not exit after the old response finished")
            time.sleep(0.05)
        original = proxy._generation
        def invalid_generation(host):
            relative = original(host)
            with (proxy.settings.directory / relative).open("a") as handle:
                handle.write("\ninvalid_fixture_directive on;\n")
            return relative
        rejected = False
        with patch.object(proxy, "_generation", side_effect=invalid_generation):
            try:
                proxy.switch(topology.a)
            except DeploymentFailure:
                rejected = True
        if not rejected or proxy.active() is not Slot.B:
            raise DeploymentFailure("invalid candidate displaced the valid B route")
        report = {"held_old_request_completed": True, "fresh_request_on_B": True,
                  "reload_alone_was_not_drained": True, "invalid_nginx_config_preserved_B": True,
                  "artifacts": str(directory)}
        (directory / "summary.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report))
    finally:
        release.set()
        runtime.close()
        for server in (a, b):
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
