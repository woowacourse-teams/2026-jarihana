#!/usr/bin/env bash
# Print the checks required by a push or PR. Compare both sides of a rename.
set -euo pipefail
event=${1:?event name}
base=${2:-}
head=${3:-}
scope=deploy
if [[ "$event" == pull_request || "$event" == push ]] &&
   [[ "$base" =~ ^[0-9a-f]{40}$ && "$head" =~ ^[0-9a-f]{40}$ ]] &&
   git cat-file -e "$base^{commit}" 2>/dev/null && git cat-file -e "$head^{commit}" 2>/dev/null; then
  range="$base..$head"
  if [[ "$event" == pull_request ]]; then range="$base...$head"; fi
  paths=$(mktemp)
  trap 'rm -f "$paths"' EXIT
  if git diff --no-renames --name-only -z "$range" -- > "$paths"; then
    scope=none
    while IFS= read -r -d '' path; do
      case "$path" in
        *.md|*/.gitignore|infra/realtime/.env.example) ;;
        realtime/src/test/*|.github/scripts/realtime-deploy.test.cjs|infra/realtime/verify-*.mjs|backend/src/main/resources/db/migration/*)
          scope=server-tests ;;
        realtime/*|contracts/realtime/v1/asset-capabilities.json|contracts/realtime/v1/surface-anchors.json|infra/realtime/*|.github/workflows/realtime-deploy.yml)
          scope=deploy
          break ;;
      esac
    done < "$paths"
  fi
fi
printf '%s\n' "$scope"
