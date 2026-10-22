#!/usr/bin/env python3
"""Call one fixed worker-control operation on this EC2 host."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from typing import Any


BASE_URL = "http://127.0.0.1:8081/actuator/workercontrol"
TOKEN_HEADER = "X-Jarihana-Worker-Control-Token"
TIMEOUT_SECONDS = 10
OPERATIONS = ("status", "begin", "phase", "pause", "activate", "release")
COMMAND_FIELDS = {
    "deploymentId",
    "epoch",
    "commandId",
    "targetHostId",
    "targetBootId",
    "expectedPhase",
    "deadline",
    "expectedRevision",
}
PHASES = {"IDLE", "PREPARE", "HANDOFF", "OBSERVE", "COMPLETE", "NEEDS_ATTENTION"}
HOST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")


class InputError(ValueError):
    """Raised when an operation or its JSON payload is outside the fixed contract."""


def validate_payload(operation: str, payload: Any) -> dict[str, Any] | None:
    if operation not in OPERATIONS:
        raise InputError("unsupported worker operation")
    if operation == "status":
        if payload is not None:
            raise InputError("status does not accept a request body")
        return None
    if not isinstance(payload, dict):
        raise InputError("worker command body must be a JSON object")

    expected_fields = COMMAND_FIELDS | ({"nextPhase"} if operation == "phase" else set())
    if payload.keys() != expected_fields:
        raise InputError("worker command fields do not match the operation contract")

    for field in ("deploymentId", "commandId", "targetBootId"):
        value = payload[field]
        if not isinstance(value, str):
            raise InputError(f"{field} must be a UUID string")
        try:
            uuid.UUID(value)
        except ValueError as exception:
            raise InputError(f"{field} must be a UUID string") from exception

    for field in ("epoch", "expectedRevision"):
        value = payload[field]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise InputError(f"{field} must be a non-negative integer")

    host_id = payload["targetHostId"]
    if not isinstance(host_id, str) or HOST_ID.fullmatch(host_id) is None:
        raise InputError("targetHostId is invalid")
    for field in ("expectedPhase", "nextPhase"):
        if field in payload and (not isinstance(payload[field], str) or payload[field] not in PHASES):
            raise InputError(f"{field} is invalid")

    deadline = payload["deadline"]
    if not isinstance(deadline, str):
        raise InputError("deadline must be an ISO-8601 local date-time")
    try:
        parsed_deadline = datetime.fromisoformat(deadline)
    except ValueError as exception:
        raise InputError("deadline must be an ISO-8601 local date-time") from exception
    if parsed_deadline.tzinfo is not None:
        raise InputError("deadline must not include a time-zone offset")
    return payload


def execute(operation: str, payload: Any, token: str) -> dict[str, Any]:
    validated = validate_payload(operation, payload)
    if not isinstance(token, str) or len(token.encode("utf-8")) < 32:
        raise InputError("WORKER_CONTROL_TOKEN must contain at least 32 bytes")

    is_status = operation == "status"
    body = None if is_status else json.dumps(validated, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        BASE_URL if is_status else f"{BASE_URL}/{operation}",
        data=body,
        headers={TOKEN_HEADER: token, "Accept": "application/json"},
        method="GET" if is_status else "POST",
    )
    if body is not None:
        request.add_header("Content-Type", "application/json")

    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        response_body = response.read()
    if not response_body:
        return {}
    result = json.loads(response_body)
    if not isinstance(result, dict):
        raise RuntimeError("worker-control returned an unexpected response")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=OPERATIONS)
    args = parser.parse_args(argv)

    try:
        raw_payload = sys.stdin.read() if args.operation != "status" else ""
        if args.operation == "status":
            payload = None
        else:
            try:
                payload = json.loads(raw_payload)
            except json.JSONDecodeError as exception:
                raise InputError("command JSON must be supplied on stdin") from exception
        result = execute(args.operation, payload, os.environ.get("WORKER_CONTROL_TOKEN", ""))
    except InputError as exception:
        print(str(exception), file=sys.stderr)
        return 2
    except urllib.error.HTTPError as exception:
        print(f"worker-control rejected the request (HTTP {exception.code})", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        print("worker-control request failed", file=sys.stderr)
        return 1
    except RuntimeError as exception:
        print(str(exception), file=sys.stderr)
        return 1

    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
