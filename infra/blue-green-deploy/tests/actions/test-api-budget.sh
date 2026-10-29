#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/common.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
GH_TOKEN=not-a-real-token
REMAINING=1000
HTTP_STATUS=200
HEADER_MODE=valid
curl() {
  local output='' headers=''
  while (( $# )); do
    case $1 in --output) output=$2; shift 2;; --dump-header) headers=$2; shift 2;; *) shift;; esac
  done
  cat >/dev/null
  echo request >>"$TEST_DIR/requests"
  printf '{"ok":true}\n' >"$output"
  printf 'HTTP/2 %s\r\n' "$HTTP_STATUS" >"$headers"
  if [[ $HEADER_MODE != missing ]]; then
    printf 'X-RateLimit-Limit: 1000\r\nx-ratelimit-remaining: %s\r\nX-RateLimit-Reset: 9999999999\r\nx-ratelimit-resource: core\r\n' "$REMAINING" >>"$headers"
  fi
  [[ $HEADER_MODE != duplicate ]] || printf 'X-RateLimit-Remaining: 1000\r\n' >>"$headers"
  [[ $HEADER_MODE != transport ]] || return 1
  printf '%s' "$HTTP_STATUS"
}
reject() {
  if ( "$@" ) >"$TEST_DIR/rejected.log" 2>&1; then echo 'Unexpected budget acceptance' >&2; exit 1; fi
}
for specification in 'plan 900' 'prepare 500' 'seal 500' 'frontend-recover 10' 'rollback 10'; do
  read -r operation threshold <<<"$specification"
  bg_api_context "$operation"
  REMAINING=$threshold
  bg_github /test >/dev/null
  REMAINING=$((threshold-1))
  reject bg_github /test
  grep -q 'GitHub API budget' "$TEST_DIR/rejected.log"
  echo "PASS api-budget $operation threshold $threshold"
done
REMAINING=499
bg_api_context seal; reject bg_github /test
bg_api_context frontend-recover; bg_github /test >/dev/null
echo 'PASS api-budget low normal budget still permits recovery'
for REMAINING in '-1' '1001' 'x' '01' '500 trailing'; do reject bg_github /test; done
REMAINING=1000
for HEADER_MODE in missing duplicate; do reject bg_github /test; done
HEADER_MODE=valid
echo 'PASS api-budget absent, duplicate and malformed counters fail closed'
for HTTP_STATUS in 403 429; do
  : >"$TEST_DIR/requests"
  reject bg_github /test
  [[ $(wc -l <"$TEST_DIR/requests") == 1 ]]
done
HTTP_STATUS=200; HEADER_MODE=transport
reject bg_github /test
echo 'PASS api-budget rejected and failed requests are never retried'
if grep -Fq "$GH_TOKEN" "$TEST_DIR/rejected.log"; then echo 'Token leaked' >&2; exit 1; fi

NOW=1000
REVOKED=false
bg_now() { echo "$NOW"; }
bg_live() { echo read >>"$TEST_DIR/cache-reads"; [[ $REVOKED == false ]] || bg_die 'Cancelled'; }
BG_LIVE_CACHED_AT=0
bg_live_cached
REVOKED=true; NOW=1009; bg_live_cached
[[ $(wc -l <"$TEST_DIR/cache-reads") == 1 ]]
NOW=1010; reject bg_live_cached; reject bg_live_cached
NOW=999; reject bg_live_cached
[[ $(wc -l <"$TEST_DIR/cache-reads") == 4 ]]
echo 'PASS api-budget 10-second cache rejects expiry, failed reads and backwards time'
