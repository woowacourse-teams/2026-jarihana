"""Disposable loopback GitHub API server; only signed downloads use wire-level fakes."""
import socket
from contextlib import AbstractContextManager
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import TracebackType


@dataclass(frozen=True, slots=True)
class Reply:
    status: int = 200
    body: bytes = b"{}"
    location: str | None = None
    disconnect: bool = False


@dataclass(frozen=True, slots=True)
class Request:
    method: str
    path: str
    authorization: str | None
    body: bytes


class ApiServer(AbstractContextManager["ApiServer"]):
    """Mutable route table and request log owned by a single test."""
    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], Reply] = {}
        self.requests: list[Request] = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                self.respond()

            def do_POST(self) -> None:
                self.respond()

            def respond(self) -> None:
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                owner.requests.append(Request(self.command, self.path, self.headers.get("Authorization"), body))
                reply = owner.routes.get((self.command, self.path), Reply(404))
                if reply.disconnect:
                    self.close_connection = True
                    self.connection.shutdown(socket.SHUT_RDWR)
                    return
                self.send_response(reply.status)
                self.send_header("Content-Length", str(len(reply.body)))
                if reply.location is not None:
                    self.send_header("Location", reply.location)
                self.end_headers()
                self.wfile.write(reply.body)

            def log_message(self, format: str, *args: str | int) -> None:
                """Suppress test-only HTTP access logs containing fixture data."""

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_port}"

    def __enter__(self) -> "ApiServer":
        self.thread.start()
        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc: BaseException | None,
                 traceback: TracebackType | None) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def route(self, method: str, path: str, reply: Reply) -> None:
        self.routes[(method, path)] = reply
