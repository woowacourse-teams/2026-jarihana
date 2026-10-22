#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
# ─── How to run ───
# uv run infra/tests/deploy/run_tests.py
# Opens disposable loopback HTTP ports; no GitHub/AWS credentials or network required after dependency setup.
# ──────────────────
"""Run deployment tests with pinned dependencies and explicit import roots."""
import sys
import unittest
from pathlib import Path


def main() -> int:
    directory = Path(__file__).resolve().parent
    sys.path.insert(0, str(directory.parents[1] / "scripts/deploy"))
    sys.path.insert(0, str(directory))
    suite = unittest.defaultTestLoader.discover(str(directory), pattern="test_*.py")
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
