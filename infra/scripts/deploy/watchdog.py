#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# ─── How to run ───
# Run: uv run --offline infra/scripts/deploy/watchdog.py /etc/jarihana-deploy/watchdog.json
# Prepare the pinned dependency cache during installation, never in the watchdog timer.
# ──────────────────
"""Inspect one local deployment journal without taking ownership or stopping a server."""
from datetime import datetime, timezone
from pathlib import Path
import sys

from pydantic import Field, ValidationError

from bluegreen.models import Phase, Record
from bluegreen.state_store import StateConflict, StateStore
from bluegreen.watchdog import inspect


class WatchdogSettings(Record):
    state_directory: Path
    stale_seconds: float = Field(default=60, ge=1, allow_inf_nan=False)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: watchdog.py /absolute/path/to/watchdog.json", file=sys.stderr)
        return 2
    try:
        settings = WatchdogSettings.model_validate_json(Path(sys.argv[1]).read_bytes())
        if not settings.state_directory.is_absolute():
            print("state_directory must be absolute", file=sys.stderr)
            return 2
        state = inspect(StateStore(settings.state_directory), datetime.now(timezone.utc), settings.stale_seconds)
    except (OSError, ValidationError, StateConflict):
        print("deployment watchdog could not inspect the journal", file=sys.stderr)
        return 2
    if state is None:
        print('{"phase":"IDLE"}')
        return 0
    print(state.model_dump_json(include={"deployment_id", "phase", "heartbeat", "reason"}))
    return 1 if state.phase is Phase.ATTENTION else 0


if __name__ == "__main__":
    raise SystemExit(main())
