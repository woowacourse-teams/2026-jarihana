import socket
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import dataclass

import httpx2
from pydantic import SecretStr, StrictBool, ValidationError

from .child_execution import MachineIdentity
from .github_operations import authorize_local_process
from .models import Action, AppStatus, Authority, Command, Record
from .ports import Clock, DeploymentFailure, UnknownResult
from .spring_status import WorkerAuthority, snapshot
from .worker_command import expected_authority, payload


class WorkerResponse(Record):
    success: StrictBool
    code: str | None
    message: str | None
    authority: WorkerAuthority | None


@contextmanager
def worker_client() -> Generator[httpx2.Client, None, None]:
    transport = httpx2.HTTPTransport(
        http2=True, retries=0, trust_env=False,
        limits=httpx2.Limits(max_connections=200, max_keepalive_connections=40, keepalive_expiry=30),
        socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)])
    with httpx2.Client(transport=transport, timeout=httpx2.Timeout(connect=3, read=3, write=3, pool=3),
                       trust_env=False, follow_redirects=False) as client:
        yield client


@dataclass(frozen=True, slots=True)
class SpringWorker:
    client: httpx2.Client
    port: int
    token: SecretStr
    machine: MachineIdentity
    clock: Clock

    def execute(self, command: Command, before_write: Callable[[AppStatus], None]) -> AppStatus:
        request = payload(command)
        before = snapshot(self.client, self.port, self.token, self.machine)
        authorize_local_process(command, before)
        expected = expected_authority(command, before)
        before_write(before)
        operation = "phase" if request.nextPhase is not None else command.action.value
        left = (command.deadline - self.clock.now()).total_seconds()
        if left <= 0:
            raise DeploymentFailure("worker command deadline expired before POST")
        body = self._post(operation, request.model_dump_json(exclude_none=True).encode(), min(3, left))
        try:
            response = WorkerResponse.model_validate_json(body)
        except ValidationError:
            raise UnknownResult("worker POST response is invalid; do not resend") from None
        authority = response.authority
        if not response.success or authority is None or authority.environment != self.machine.environment:
            raise UnknownResult("worker POST result cannot be confirmed; do not resend")
        observed = Authority(deployment_id=authority.deploymentId, epoch=authority.epoch, revision=authority.revision,
                             phase=authority.phase, owner_host=authority.owner.hostId if authority.owner else None,
                             owner_boot=authority.owner.bootId if authority.owner else None, status=authority.status)
        if observed != expected:
            raise UnknownResult("worker POST authority differs from the command result; do not resend")
        try:
            after = snapshot(self.client, self.port, self.token, self.machine)
        except DeploymentFailure:
            raise UnknownResult("worker POST may have applied; status read failed; do not resend") from None
        if after.authority != expected:
            raise UnknownResult("worker authority changed after POST; do not resend")
        if command.action is Action.ACTIVATE and after.worker != "ACTIVE":
            raise UnknownResult("activated worker is not active; inspect actual state")
        if command.action is Action.PAUSE and after.worker not in ("PAUSED", "DRAINING"):
            raise UnknownResult("paused worker is still accepting work; inspect actual state")
        if command.action is Action.RELEASE and not after.drained():
            raise UnknownResult("released worker is not drained; inspect actual state")
        return after

    def _post(self, operation: str, body: bytes, seconds: float) -> bytes:
        try:
            with self.client.stream("POST", f"http://127.0.0.1:{self.port}/actuator/workercontrol/{operation}",
                                    content=body, follow_redirects=False, timeout=httpx2.Timeout(seconds), headers={
                                        "Content-Type": "application/json", "Accept-Encoding": "identity",
                                        "X-Jarihana-Worker-Control-Token": self.token.get_secret_value()}) as response:
                if response.status_code in (400, 401, 403, 409):
                    raise DeploymentFailure(f"worker POST rejected with HTTP {response.status_code}")
                if response.status_code != 200 or response.headers.get("Content-Encoding", "identity") != "identity":
                    raise UnknownResult("worker POST response cannot be trusted; do not resend")
                result = bytearray()
                for chunk in response.iter_bytes(chunk_size=16384):
                    if len(result) + len(chunk) > 65536:
                        raise UnknownResult("worker POST response exceeds its limit; do not resend")
                    result.extend(chunk)
                return bytes(result)
        except httpx2.HTTPError:
            raise UnknownResult("worker POST outcome is unknown; do not resend") from None
