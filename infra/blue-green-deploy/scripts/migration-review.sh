#!/usr/bin/env bash
# Warning-only SQL review aid. Never applies SQL or certifies compatibility.
set -euo pipefail

migration_requires_review() {
  tr '\n\r\t' '   ' | grep -Eiq '(^|[^[:alnum:]_])(DROP|TRUNCATE|RENAME|UPDATE|DELETE|ALTER[[:space:]]+COLUMN|NOT[[:space:]]+NULL|ADD[[:space:]]+CONSTRAINT|CREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX)([^[:alnum:]_]|$)'
}

main() {
  local base=${MIGRATION_BASE:-} head=${MIGRATION_HEAD:-} changes status name sql warnings=0
  [[ "$base" =~ ^[a-f0-9]{40}$ && "$head" =~ ^[a-f0-9]{40}$ ]] || {
    printf '::error::Migration review requires exact comparison SHAs.\n' >&2; return 1;
  }
  : "${GITHUB_STEP_SUMMARY:?}"
  changes=$(mktemp)
  trap 'rm -f -- "$changes"' RETURN
  git diff --name-status --no-renames -z "$base" "$head" -- backend/src/main/resources/db/migration/ > "$changes"
  printf '## DB migration review\n\nThis check does not prove backward compatibility.\n\n' >> "$GITHUB_STEP_SUMMARY"
  while IFS= read -r -d '' status && IFS= read -r -d '' name; do
    if [[ ! "$name" =~ ^backend/src/main/resources/db/migration/[A-Za-z0-9_.-]+\.sql$ ]]; then
      printf '%s\n' '- Migration filename requires manual review.' >> "$GITHUB_STEP_SUMMARY"
      warnings=$((warnings+1)); continue
    fi
    if [[ "$status" != A ]]; then
      printf -- '- `%s`: existing migration modified or removed; verify deployed Flyway history.\n' "$name" >> "$GITHUB_STEP_SUMMARY"
      warnings=$((warnings+1))
    fi
    if [[ "$status" != D ]]; then
      sql=$(git show "$head:$name")
      if migration_requires_review <<< "$sql"; then
        printf -- '- `%s`: potential destructive, constraint or bulk-write change; review old-version reads/writes and locks.\n' "$name" >> "$GITHUB_STEP_SUMMARY"
        warnings=$((warnings+1))
      fi
    fi
  done < "$changes"
  if (( warnings>0 )); then
    printf '::warning::DB changes require compatibility and lock review. See the summary and PR checklist.\n'
  else
    printf 'No heuristic warning. PR compatibility review is still required.\n' >> "$GITHUB_STEP_SUMMARY"
  fi
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
