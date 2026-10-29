#!/usr/bin/env bash
set -euo pipefail
DIRECTORY=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SHARD=${1:-0}
SHARDS=${2:-1}
if (( $#>2 )) || [[ ! $SHARD =~ ^(0|[1-9][0-9]?)$ || ! $SHARDS =~ ^[1-9][0-9]?$ ]] || (( SHARDS>12 || SHARD>=SHARDS )); then
  echo 'Usage: run-api-budget.sh [shard-index shard-count], 0 <= index < count <= 12' >&2
  exit 2
fi
CASE_INDEX=0
EXECUTED=0
run_case() {
  local index=$CASE_INDEX
  CASE_INDEX=$((CASE_INDEX+1))
  if (( index%SHARDS!=SHARD )); then return 0; fi
  EXECUTED=$((EXECUTED+1))
  bash "$DIRECTORY/deployment-api-budget-case.sh" "$@"
}
for baseline in first existing; do
  for outcome in success rollback-final; do
    run_case 79 "$outcome" both "$baseline"
  done
done
for scope in frontend backend; do
  for outcome in success rollback-final; do
    if [[ $scope == backend && $outcome == rollback-final ]]; then outcome=rollback; fi
    run_case 79 "$outcome" "$scope" first
  done
done
for outcome in success rollback-final; do
  run_case 79 "$outcome" both first 0 1
done
run_case 5 success both first 200
run_case 5 budget-rollback both first
printf 'PASS api-budget shard=%s/%s cases=%s total=%s\n' "$SHARD" "$SHARDS" "$EXECUTED" "$CASE_INDEX"
