"""Bounded GitHub HTTP calls, with isolated unauthenticated artifact downloads."""
import socket
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Final
from urllib.parse import urlsplit

import httpx2
from pydantic import SecretStr

from .github_models import MAX_ZIP_BYTES, RepositoryPin
from .ports import Clock, DeploymentFailure, UnknownResult

MAX_API_BYTES: Final = 2097152


class GitHubError(DeploymentFailure):
    """Exception traceback fields must remain mutable for context managers."""
    def __init__(self, status: int) -> None:
        self.status: int = status
        super().__init__(f"GitHub API returned HTTP {status}")


@dataclass(frozen=True, slots=True)
class HttpReply:
    status: int
    payload: bytes
    location: str | None


@dataclass(frozen=True, slots=True)
class GitHubClients:
    reads: httpx2.Client
    writes: httpx2.Client
    downloads: httpx2.Client


@contextmanager
def github_clients() -> Generator[GitHubClients, None, None]:
    """POST retries and automatic redirects are disabled to preserve command identity."""
    limits = httpx2.Limits(max_connections=200, max_keepalive_connections=40, keepalive_expiry=30)
    timeout = httpx2.Timeout(connect=5, read=30, write=10, pool=10)
    safe = httpx2.HTTPTransport(http2=True, retries=3, limits=limits, trust_env=False,
                               socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)])
    once = httpx2.HTTPTransport(http2=True, retries=0, limits=limits, trust_env=False,
                               socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)])
    anonymous = httpx2.HTTPTransport(http2=True, retries=3, limits=limits, trust_env=False,
                                    socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)])
    with (httpx2.Client(base_url="https://api.github.com", transport=safe, timeout=timeout,
                       follow_redirects=False, trust_env=False) as reads,
          httpx2.Client(base_url="https://api.github.com", transport=once, timeout=timeout,
                        follow_redirects=False, trust_env=False) as writes,
          httpx2.Client(transport=anonymous, timeout=timeout, follow_redirects=False,
                        trust_env=False) as downloads):
        yield GitHubClients(reads, writes, downloads)


class GitHubHttp:
    def __init__(self, clients: GitHubClients, token: SecretStr, clock: Clock) -> None:
        self.clients: GitHubClients = clients
        self.token: SecretStr = token
        self.clock: Clock = clock

    def _timeout(self, deadline: datetime) -> httpx2.Timeout:
        left = (deadline - self.clock.now()).total_seconds()
        if left <= 0:
            raise DeploymentFailure("GitHub operation deadline exceeded")
        return httpx2.Timeout(connect=min(5, left), read=min(30, left), write=min(10, left), pool=min(10, left))

    def api(self, path: str, deadline: datetime, payload: bytes | None = None) -> HttpReply:
        """Use only internally constructed repository-relative API paths."""
        if not path.startswith("/repos/") or ".." in path or "://" in path:
            raise DeploymentFailure("invalid GitHub API path")
        headers = {"Authorization": f"Bearer {self.token.get_secret_value()}",
                   "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10",
                   "Content-Type": "application/json", "Accept-Encoding": "identity"}
        client = self.clients.reads if payload is None else self.clients.writes
        try:
            with client.stream("GET" if payload is None else "POST", path, headers=headers,
                               content=payload, timeout=self._timeout(deadline), follow_redirects=False) as response:
                body = self._body(response, deadline, MAX_API_BYTES)
                return HttpReply(response.status_code, body, response.headers.get("location"))
        except httpx2.HTTPError:
            if payload is not None:
                raise UnknownResult("GitHub POST outcome is unknown; do not resend") from None
            raise DeploymentFailure("GitHub read request failed") from None

    def get(self, path: str, deadline: datetime) -> bytes:
        result = self.api(path, deadline)
        if result.status != 200:
            raise GitHubError(result.status)
        return result.payload

    def download(self, url: str, deadline: datetime, repository: RepositoryPin) -> bytes:
        try:
            parsed = urlsplit(url)
        except ValueError:
            raise DeploymentFailure("artifact download location could not be parsed") from None
        if (parsed.scheme != "https" or parsed.hostname not in repository.download_hosts
                or parsed.username is not None or parsed.password is not None or parsed.fragment
                or parsed.netloc != parsed.hostname):
            raise DeploymentFailure("artifact download location is not allowlisted HTTPS")
        try:
            # Separate client: no GitHub token, API cookies, proxy environment or redirect following.
            with self.clients.downloads.stream("GET", url, headers={"Accept-Encoding": "identity"},
                                              timeout=self._timeout(deadline), follow_redirects=False) as response:
                if response.status_code != 200:
                    raise GitHubError(response.status_code)
                return self._body(response, deadline, MAX_ZIP_BYTES)
        except httpx2.HTTPError:
            raise DeploymentFailure("artifact download failed") from None

    def _body(self, response: httpx2.Response, deadline: datetime, limit: int) -> bytes:
        if response.headers.get("Content-Encoding", "identity").lower() != "identity":
            raise DeploymentFailure("encoded GitHub responses are not accepted")
        _ = self._timeout(deadline)
        result = bytearray()
        for chunk in response.iter_bytes(chunk_size=16384):
            if len(result) + len(chunk) > limit:
                raise DeploymentFailure("GitHub response exceeds its size limit")
            _ = self._timeout(deadline)
            result.extend(chunk)
        return bytes(result)
