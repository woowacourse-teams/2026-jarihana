#!/usr/bin/env bash
set -euo pipefail

backend=false
frontend=false
e2e=false
case "${1:-}" in
  workflow_dispatch)
    backend=true; frontend=true; e2e=true
    ;;
  pull_request)
    base=${2:?missing pull request base SHA}
    head=${3:?missing pull request head SHA}
    if [[ ! "$base" =~ ^[0-9a-f]{40}$ || ! "$head" =~ ^[0-9a-f]{40}$ ]]; then
      echo "Expected two full pull request commit SHAs" >&2
      exit 1
    fi

    # Finish the diff before emitting decisions. A failed diff must never look like an empty PR.
    paths=$(mktemp)
    trap 'rm -f "$paths"' EXIT
    git diff --no-renames --name-only -z "$base...$head" -- > "$paths"
    while IFS= read -r -d '' file; do
      case "$file" in
        .gitattributes|.github/workflows/ci.yml|.github/scripts/pr-ci-scope.sh|.github/scripts/pr-ci-scope.test.cjs)
          backend=true; frontend=true; e2e=true ;;
        # Jest and the mock browser API both read the seeded furniture and blueprint rows.
        backend/src/main/resources/db/migration/V45__versioned_space_blueprints.sql|\
        backend/src/main/resources/db/migration/V46__space_furniture_catalog.sql|\
        backend/src/main/resources/db/migration/V47__space_blueprint_runtime.sql|\
        backend/src/main/resources/db/migration/V48__space_furniture_interactions.sql)
          backend=true; frontend=true; e2e=true ;;
        backend/src/test/resources/group-space-v9-catalog.json|\
        backend/src/main/resources/rhythm-harpoon/ranked-chart.json|\
        backend/src/test/resources/rhythm-harpoon/golden-replays.json)
          backend=true; frontend=true ;;
        # Frontend fixtures serve and test the public realtime HTTP contract.
        realtime/src/main/resources/contracts/asset-capabilities.json|\
        frontend/tests/fixtures/clubhouse-seeds.cjs)
          frontend=true; e2e=true ;;
        infra/cloudfront/spa-fallback.js|infra/cloudfront/group-share-preview.js|frontend/docs/rhythm-double-tap-mix.json)
          frontend=true ;;
        # Bundled assets and classpath resources can also have documentation extensions.
        frontend/public/*)
          frontend=true; e2e=true ;;
        backend/src/main/resources/*|backend/src/test/resources/*)
          backend=true ;;
        backend/docs/*|frontend/docs/*|*.md) ;;
        backend/*)
          backend=true ;;
        # E2E scripts also go through frontend ESLint. Unit-only edits need no browser.
        frontend/tests/e2e/*)
          frontend=true; e2e=true ;;
        frontend/tests/*|frontend/src/*.test.js|frontend/src/*.test.jsx|frontend/eslint.config.mjs)
          frontend=true ;;
        frontend/*)
          frontend=true; e2e=true ;;
      esac
    done < "$paths"
    ;;
  *)
    echo "Unsupported CI event: ${1:-<empty>}" >&2
    exit 1 ;;
esac
printf 'backend=%s\nfrontend=%s\ne2e=%s\n' "$backend" "$frontend" "$e2e"
