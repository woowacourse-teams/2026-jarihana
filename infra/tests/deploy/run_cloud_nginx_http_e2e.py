#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# Run on the rehearsal Nginx EC2 as root with PYTHONPATH=infra/scripts/deploy.
# Creates a private test proxy; reads dev A/B APIs without changing apps or workers.
import os
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from http.client import HTTPResponse
from pathlib import Path
from threading import Event
from typing import Final, override

from bluegreen.models import ControlRelease, DrainTicket, Host, Record, Slot, Topology
from bluegreen.nginx_switch import (
    ApiProbe,
    NginxRuntime,
    NginxSettings,
    NginxSwitch,
    ProcessRunner,
    Runner,
)
from bluegreen.ports import DeploymentFailure, SystemClock

NGINX_INSTANCE: Final = "i-01449d708ceef309b"
DIRECTORY: Final = Path("/var/lib/jarihana-rehearsal/nginx")
IMAGE: Final = "nginx@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94"


@dataclass(frozen=True, slots=True)
class Sample:
    slot: Slot | None
    elapsed: float
    error: str = ""


class Report(Record):
    route_checks: int
    public_api_requests: int
    failures: int
    served_a: int
    served_b: int
    max_latency_seconds: float
    public_api_max_latency_seconds: float
    accepted_request_finished_on_a: bool
    old_worker_waited_for_request: bool
    old_worker_exited_after_request: bool
    invalid_config_preserved_a: bool
    final_slot: Slot


class BrokenCandidate(NginxSwitch):
    @override
    def _generation(self, host: Host) -> Path:
        relative = super()._generation(host)
        with (self.settings.directory / relative).open("a") as handle:
            _ = handle.write("\ninvalid_rehearsal_directive on;\n")
        return relative


def sample_requests(proxy: NginxSwitch, stop: Event) -> list[Sample]:
    samples: list[Sample] = []
    while not stop.is_set():
        started = time.monotonic()
        try:
            samples.append(Sample(proxy.active(), time.monotonic() - started))
        except DeploymentFailure as error:
            samples.append(Sample(None, time.monotonic() - started, str(error)))
        _ = stop.wait(0.05)
    return samples


def sample_public_api(runner: Runner, stop: Event) -> list[float]:
    latencies: list[float] = []
    while not stop.is_set():
        started = time.monotonic()
        _ = ApiProbe.model_validate_json(runner.run((
            "curl", "--fail", "--silent", "--max-time", "3",
            "http://10.0.3.51:18080/api/groups?size=1",
        )))
        latencies.append(time.monotonic() - started)
        _ = stop.wait(0.05)
    return latencies


def wait_drained(proxy: NginxSwitch, ticket: DrainTicket) -> None:
    deadline = time.monotonic() + 10
    while not proxy.drained(ticket):
        if time.monotonic() >= deadline:
            raise DeploymentFailure("old Nginx worker did not finish")
        time.sleep(0.1)


def prepare(runner: ProcessRunner) -> NginxSwitch:
    if os.geteuid() != 0:
        raise DeploymentFailure("run as root on the rehearsal Nginx EC2")
    token = runner.run(("curl", "--fail", "--silent", "--max-time", "3", "-X", "PUT",
                        "-H", "X-aws-ec2-metadata-token-ttl-seconds: 60",
                        "http://169.254.169.254/latest/api/token")).strip()
    instance = runner.run(("curl", "--fail", "--silent", "--max-time", "3",
                           "-H", f"X-aws-ec2-metadata-token: {token}",
                           "http://169.254.169.254/latest/meta-data/instance-id")).strip()
    if instance != NGINX_INSTANCE:
        raise DeploymentFailure("this test is restricted to the rehearsal Nginx EC2")
    topology = Topology(
        environment="dev-rehearsal", coordinator_instance_id=NGINX_INSTANCE,
        a=Host(slot=Slot.A, host_id="jarihana-dev", instance_id="i-0a43bb4e0154e0f1f",
               upstream="10.0.3.232:8080"),
        b=Host(slot=Slot.B, host_id="jarihana-rehearsal-b", instance_id="i-0430ff91d1af2fb37",
               upstream="10.0.3.184:18080"),
        control=ControlRelease(workflow="cloud-http-rehearsal", ref="refs/tags/http-rehearsal",
                               sha=runner.run(("git", "rev-parse", "HEAD")).strip()),
    )
    for host in (topology.a, topology.b):
        _ = ApiProbe.model_validate_json(runner.run((
            "curl", "--fail", "--silent", "--max-time", "5",
            f"http://{host.upstream}/api/groups?size=1",
        )))
    settings = NginxSettings(directory=DIRECTORY, container="jarihana-nginx-rehearsal-nginx-1",
                             probe_port=18082)
    proxy = NginxSwitch(settings, NginxRuntime(runner, SystemClock(), topology))
    if not proxy.current.exists():
        proxy.initialize(topology.a)
    os.environ.update({
        "NGINX_IMAGE": IMAGE, "NGINX_DEPLOY_DIRECTORY": str(DIRECTORY),
        "NGINX_LISTEN_ADDRESS": "10.0.3.51", "NGINX_HTTP_PORT": "18080", "NGINX_PROBE_PORT": "18082",
    })
    _ = runner.run(("docker", "compose", "--project-name", "jarihana-nginx-rehearsal",
                "-f", "infra/deploy/nginx/docker-compose.yml", "up", "-d", "nginx"))
    deadline = time.monotonic() + 10
    while True:
        try:
            active = proxy.active()
            break
        except DeploymentFailure:
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.2)
    if active is not Slot.A:
        wait_drained(proxy, proxy.switch(topology.a))
    return proxy


def switch_with_pending_body(proxy: NginxSwitch) -> None:
    # A 100 Continue proves Nginx accepted the request before reload. Spring sees it after body release.
    with socket.create_connection(("127.0.0.1", 18082), timeout=5) as connection:
        connection.sendall(
            b"GET /__deployment HTTP/1.1\r\nHost: rehearsal\r\nConnection: close\r\n"
            + b"Content-Length: 1\r\nContent-Type: application/octet-stream\r\nExpect: 100-continue\r\n\r\n"
        )
        interim = bytearray()
        while b"\r\n\r\n" not in interim:
            chunk = connection.recv(1024)
            if not chunk or len(interim) > 4096:
                raise DeploymentFailure("missing bounded 100 Continue response")
            interim.extend(chunk)
        if not interim.startswith(b"HTTP/1.1 100 Continue\r\n"):
            raise DeploymentFailure("Nginx did not accept the pending-body request")
        ticket = proxy.switch(proxy.runtime.topology.b)
        if proxy.drained(ticket):
            raise DeploymentFailure("reload incorrectly drained a pending request")
        connection.sendall(b"x")
        with HTTPResponse(connection) as response:
            response.begin()
            if (response.status != 200 or response.getheader("X-Jarihana-Slot") != "A"
                    or response.getheader("X-Jarihana-Upstream") != proxy.runtime.topology.a.upstream):
                raise DeploymentFailure("accepted request did not finish on the original A route")
            _ = ApiProbe.model_validate_json(response.read(1_048_576))
    wait_drained(proxy, ticket)


def main() -> None:
    proxy = prepare(ProcessRunner())
    stop = Event()
    print("A_READY", flush=True)
    with ThreadPoolExecutor(max_workers=2) as executor:
        sampler = executor.submit(sample_requests, proxy, stop)
        public_sampler = executor.submit(sample_public_api, proxy.runtime.runner, stop)
        try:
            time.sleep(2)
            switch_with_pending_body(proxy)
            print("B_READY_AND_ACCEPTED_A_REQUEST_COMPLETED", flush=True)
            time.sleep(3)
            wait_drained(proxy, proxy.switch(proxy.runtime.topology.a))
            before = proxy.current.read_bytes()
            invalid_rejected = False
            try:
                _ = BrokenCandidate(proxy.settings, proxy.runtime).switch(proxy.runtime.topology.b)
            except DeploymentFailure:
                invalid_rejected = True
            if not invalid_rejected or proxy.current.read_bytes() != before or proxy.active() is not Slot.A:
                raise DeploymentFailure("invalid config displaced A")
            time.sleep(2)
        finally:
            stop.set()
        samples = sampler.result(timeout=10)
        public_latencies = public_sampler.result(timeout=10)
    failures = [sample for sample in samples if sample.error]
    served_a = sum(sample.slot is Slot.A for sample in samples)
    served_b = sum(sample.slot is Slot.B for sample in samples)
    if failures or len(samples) < 50 or len(public_latencies) < 50 or served_a < 3 or served_b < 3:
        raise DeploymentFailure(f"continuous API check failed: requests={len(samples)}, errors={failures}")
    report = Report(route_checks=len(samples), public_api_requests=len(public_latencies),
                    failures=len(failures), served_a=served_a, served_b=served_b,
                    max_latency_seconds=max(sample.elapsed for sample in samples),
                    public_api_max_latency_seconds=max(public_latencies),
                    accepted_request_finished_on_a=True, old_worker_waited_for_request=True,
                    old_worker_exited_after_request=True, invalid_config_preserved_a=True,
                    final_slot=proxy.active())
    _ = (DIRECTORY / "http-rehearsal-result.json").write_text(report.model_dump_json(indent=2))
    print(report.model_dump_json(), flush=True)


if __name__ == "__main__":
    main()
