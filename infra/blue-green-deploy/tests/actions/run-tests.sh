#!/usr/bin/env bash
# Run from any directory. Linux + Bash + jq + coreutils; no production credentials.
set -euo pipefail
DIRECTORY=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$DIRECTORY/../../../.." && pwd)
bash -n "$ROOT/infra/blue-green-deploy/scripts/migration-review.sh"
for file in "$ROOT"/infra/blue-green-deploy/scripts/actions/*.sh "$DIRECTORY"/test-*.sh; do bash -n "$file"; done
for file in "$DIRECTORY"/test-*.sh; do bash "$file"; done
