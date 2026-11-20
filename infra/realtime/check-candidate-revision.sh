#!/usr/bin/env bash
set -euo pipefail
revision=${1:?candidate revision}
head=$(git rev-parse --verify "${2:?develop reference}^{commit}")
if ! git merge-base --is-ancestor "$revision" "$head"; then
  echo 'Candidate revision is not on develop. Keeping the current deployment.' >&2
  exit 1
fi
scope=$(bash infra/realtime/change-scope.sh push "$revision" "$head")
case "$scope" in
  none|server-tests) ;;
  *) echo 'Develop contains newer realtime deployment changes. Keeping the current deployment.' >&2; exit 1 ;;
esac
