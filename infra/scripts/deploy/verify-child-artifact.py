#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0"]
# ///
# ─── How to run ───
# uv run infra/scripts/deploy/verify-child-artifact.py topology.json state.json child-result.json
# Read-only content validation; GitHub download provenance must be verified separately.
# ──────────────────
"""Validate an exact child JSON against a current local journal without any mutation."""
from datetime import datetime, timezone
from pathlib import Path
import json
import sys

from pydantic import ValidationError

from bluegreen.child_artifacts import ArtifactExpectation, MAX_ARTIFACT_BYTES, accept_artifact
from bluegreen.models import DeploymentState, Topology
from bluegreen.ports import DeploymentFailure


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: verify-child-artifact.py topology.json state.json child-result.json", file=sys.stderr)
        return 2
    try:
        topology = Topology.model_validate_json(Path(sys.argv[1]).read_bytes(), strict=True)
        state = DeploymentState.model_validate_json(Path(sys.argv[2]).read_bytes(), strict=True)
        with Path(sys.argv[3]).open("rb") as handle:
            payload = handle.read(MAX_ARTIFACT_BYTES + 1)
        result = accept_artifact(payload, ArtifactExpectation(state, topology, datetime.now(timezone.utc)))
    except (OSError, ValidationError, DeploymentFailure):
        print("child artifact validation failed; deployment cleanup remains blocked", file=sys.stderr)
        return 1
    print(json.dumps({"validated": True, "command_id": str(result.command.command_id),
                      "run_id": result.run.run_id, "attempt": result.run.attempt}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
