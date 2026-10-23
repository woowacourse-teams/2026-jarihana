"""Read the local instance identity through IMDSv2 without environment proxies."""
import re
import socket
from collections.abc import Generator
from contextlib import contextmanager

import httpx2

from .child_execution import MachineIdentity
from .ports import DeploymentFailure


@contextmanager
def metadata_client() -> Generator[httpx2.Client, None, None]:
    """Token creation is bounded, never redirected, retried or sent through a proxy."""
    transport = httpx2.HTTPTransport(
        http2=True, retries=0, trust_env=False,
        limits=httpx2.Limits(max_connections=200, max_keepalive_connections=40, keepalive_expiry=30),
        socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)],
    )
    with httpx2.Client(transport=transport, timeout=httpx2.Timeout(3),
                       follow_redirects=False, trust_env=False) as client:
        yield client


def local_machine(client: httpx2.Client, environment: str, host_id: str) -> MachineIdentity:
    """Only the instance ID comes from metadata; the gate checks the configured host mapping."""
    try:
        token = _text(client, "PUT", "/latest/api/token", {"X-aws-ec2-metadata-token-ttl-seconds": "60"})
        if not token or not token.isascii() or any(character.isspace() for character in token):
            raise DeploymentFailure("invalid metadata session token")
        instance = _text(client, "GET", "/latest/meta-data/instance-id", {"X-aws-ec2-metadata-token": token})
    except httpx2.HTTPError:
        raise DeploymentFailure("local EC2 identity could not be read") from None
    if re.fullmatch(r"i-(?:[a-f0-9]{8}|[a-f0-9]{17})", instance) is None:
        raise DeploymentFailure("metadata instance ID is invalid")
    return MachineIdentity(environment=environment, host_id=host_id, instance_id=instance)


def _text(client: httpx2.Client, method: str, path: str, headers: dict[str, str]) -> str:
    with client.stream(method, f"http://169.254.169.254{path}", headers=headers,
                       timeout=httpx2.Timeout(3), follow_redirects=False) as response:
        if response.status_code != 200 or response.headers.get("content-encoding", "identity") != "identity":
            raise DeploymentFailure("metadata request was rejected")
        body = bytearray()
        for chunk in response.iter_bytes(chunk_size=1024):
            if len(body) + len(chunk) > 1024:
                raise DeploymentFailure("metadata response exceeds its size limit")
            body.extend(chunk)
        try:
            return body.decode("ascii")
        except UnicodeDecodeError:
            raise DeploymentFailure("metadata response is not ASCII") from None
