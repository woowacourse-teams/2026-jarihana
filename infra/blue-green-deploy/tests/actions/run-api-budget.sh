#!/usr/bin/env bash
set -euo pipefail
DIRECTORY=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for baseline in first existing; do
  for outcome in success rollback-final; do
    bash "$DIRECTORY/deployment-api-budget-case.sh" 79 "$outcome" both "$baseline"
  done
done
for scope in frontend backend; do
  for outcome in success rollback-final; do
    if [[ $scope == backend && $outcome == rollback-final ]]; then outcome=rollback; fi
    bash "$DIRECTORY/deployment-api-budget-case.sh" 79 "$outcome" "$scope" first
  done
done
for outcome in success rollback-final; do
  bash "$DIRECTORY/deployment-api-budget-case.sh" 79 "$outcome" both first 0 1
done
bash "$DIRECTORY/deployment-api-budget-case.sh" 5 success both first 200
bash "$DIRECTORY/deployment-api-budget-case.sh" 5 budget-rollback both first
