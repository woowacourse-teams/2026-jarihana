#!/usr/bin/env python3
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error


PORTS = {"blue": (18080, 18081), "green": (28080, 28081)}


def atomic_write(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w") as output:
        output.write(value)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def nginx_config(color):
    return """worker_processes auto;
pid /var/run/nginx.pid;
error_log /dev/stderr warn;
worker_shutdown_timeout 120s;
events { worker_connections 4096; }
http {
  access_log off;
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  server {
    listen 8080;
    location / {
      proxy_pass http://127.0.0.1:PORT;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
      proxy_read_timeout 90s;
      proxy_send_timeout 30s;
      add_header X-Jarihana-Color COLOR always;
    }
  }
}
""".replace("PORT", str(PORTS[color][0])).replace("COLOR", color)


def initialize(directory, color, tag):
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (directory / "state.json").exists() or (directory / "proxy").exists():
            raise RuntimeError("initialization refuses existing state or proxy configuration")
        (directory / "proxy").mkdir()
        atomic_write(directory / "proxy/nginx.conf", nginx_config(color))
        atomic_write(directory / "state.json", json.dumps({
            "active": color, "tags": {"blue": tag, "green": tag}}) + "\n")
    print("Local configuration initialized; no container started, no migration marker created")


class Deployment:
    def __init__(self, directory, tag, smoke, drain=30, attempts=40, interval=3):
        self.directory = Path(directory).resolve()
        self.state_file = self.directory / "state.json"
        self.config_file = self.directory / "proxy/nginx.conf"
        self.tag, self.smoke = tag, smoke
        self.drain, self.attempts, self.interval = drain, attempts, interval
        self.env = os.environ.copy()
        self.env["BLUEGREEN_STATE_DIR"] = str(self.directory)
        self.env["BACKEND_TAG"] = tag
        self.env.pop("COMPOSE_PROJECT_NAME", None)
        self.compose_file = Path(__file__).resolve().parents[1] / "docker-compose.bluegreen.yml"

    def compose(self, *args):
        subprocess.run(["docker", "compose", "-f", str(self.compose_file), *args],
                       env=self.env, check=True, timeout=180)

    def health(self, color):
        with urllib.request.urlopen(
                f"http://127.0.0.1:{PORTS[color][1]}/actuator/health/readiness", timeout=5) as response:
            if json.load(response).get("status") != "UP":
                raise RuntimeError("readiness is not UP")

    def ready(self, color):
        for attempt in range(self.attempts):
            try:
                self.health(color)
                return
            except (OSError, ValueError, RuntimeError):
                if attempt + 1 == self.attempts:
                    raise
                time.sleep(self.interval)

    def probe(self, color, port):
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/groups", timeout=10) as response:
            if response.status != 200:
                raise RuntimeError("public API smoke failed")
            if port == 8080 and response.headers.get("X-Jarihana-Color") != color:
                raise RuntimeError("proxy routes to wrong color")
        with urllib.request.urlopen(
                f"http://127.0.0.1:{PORTS[color][1]}/actuator/prometheus", timeout=10) as response:
            metrics = response.read().decode()
            for expected in ("jvm_memory_used_bytes", "hikaricp_connections_active", 'environment="prod"'):
                if expected not in metrics:
                    raise RuntimeError("management metrics smoke failed")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/actuator/prometheus", timeout=10):
                raise RuntimeError("management endpoint is publicly reachable")
        except urllib.error.HTTPError as error:
            if error.code != 403:
                raise RuntimeError("public management endpoint must return 403") from error
        subprocess.run([sys.executable, self.smoke, f"http://127.0.0.1:{port}", color],
                       check=True, timeout=60, env=self.env)

    def route(self, color):
        atomic_write(self.config_file, nginx_config(color))
        self.compose("exec", "-T", "proxy", "nginx", "-t")
        self.compose("exec", "-T", "proxy", "nginx", "-s", "reload")

    def routed_probe(self, color):
        for attempt in range(10):
            try:
                self.probe(color, 8080)
                return
            except (OSError, RuntimeError, subprocess.SubprocessError):
                if attempt == 9:
                    raise
                time.sleep(1)

    def deploy(self):
        if not (self.directory / "migration-approved").is_file():
            raise RuntimeError("one-time host migration required; see infra/BLUEGREEN.md")
        state = json.loads(self.state_file.read_text())
        old = state["active"]
        if old not in PORTS or self.config_file.read_text() != nginx_config(old):
            raise RuntimeError("state/proxy mismatch; reconcile host before deploying")
        for color in PORTS:
            tag = state["tags"][color]
            if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", tag):
                raise RuntimeError("invalid stored image tag")
            self.env[color.upper() + "_TAG"] = tag
        new = "green" if old == "blue" else "blue"
        self.env[new.upper() + "_TAG"] = self.tag
        self.ready(old)
        self.probe(old, 8080)
        self.compose("pull", "backend-" + new)
        self.compose("up", "-d", "--no-deps", "--no-build", "backend-" + new)
        self.ready(new)
        self.probe(new, PORTS[new][0])
        try:
            self.route(new)
            self.routed_probe(new)
            for _ in range(self.drain):
                time.sleep(1)
                self.health(new)
            self.probe(new, 8080)
            state["active"] = new
            state["tags"][new] = self.tag
            atomic_write(self.state_file, json.dumps(state) + "\n")
        except BaseException:
            self.route(old)
            self.ready(old)
            self.routed_probe(old)
            raise
        self.compose("stop", "--timeout", "45", "backend-" + old)
        print(f"Deployment verified: {new}; prior image retained: {state['tags'][old]}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--initialize", choices=PORTS, help="create local state/config only; never stops or starts containers")
    parser.add_argument("--smoke", default=str(Path(__file__).with_name("chat-smoke.py")),
                        help="Python authenticated WS/catch-up check: URL COLOR")
    parser.add_argument("--drain-seconds", type=int, default=30)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", args.tag):
        parser.error("invalid image tag")
    if not 0 <= args.drain_seconds <= 60:
        parser.error("drain must be 0..60 seconds")
    if args.initialize:
        initialize(args.state_dir, args.initialize, args.tag)
        return
    def interrupted(signum, frame):
        raise InterruptedError("deployment interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    with (Path(args.state_dir) / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        Deployment(args.state_dir, args.tag, args.smoke, args.drain_seconds).deploy()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Deployment failed: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
