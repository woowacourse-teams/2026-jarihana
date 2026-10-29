#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
SCRIPT=$ROOT/infra/blue-green-deploy/scripts/actions/dev-route.sh
TEST_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEST_DIR"' EXIT
passed=0

select_route() {
  : > "$TEST_DIR/output"
  env -i PATH="$PATH" GITHUB_REF="${ROUTE_REF:-refs/heads/develop}" \
    GITHUB_EVENT_NAME="$1" BG_REQUESTED_MODE="$2" BG_DEV_AUTO_ENABLED="$3" \
    BG_PROD_AUTO_ENABLED="$4" GITHUB_OUTPUT="$TEST_DIR/output" bash "$SCRIPT"
}
accept() {
  local event=$1 mode=$2 dev=$3 prod=$4 route=$5 result_mode=$6
  select_route "$event" "$mode" "$dev" "$prod"
  printf 'route=%s\nmode=%s\n' "$route" "$result_mode" > "$TEST_DIR/expected"
  diff -u "$TEST_DIR/expected" "$TEST_DIR/output"
  passed=$((passed+1)); printf 'ok dev-route: %s/%s dev=%s prod=%s -> %s\n' "$event" "$mode" "$dev" "$prod" "$route"
}
reject() {
  if select_route "$@" > "$TEST_DIR/rejected.log" 2>&1; then
    printf 'Unexpected deployment route accepted\n' >&2; exit 1
  fi
  [[ ! -s $TEST_DIR/output ]] || { printf 'Rejected input published a deployment route\n' >&2; exit 1; }
  passed=$((passed+1)); printf 'ok dev-route: unsafe or unsupported selection rejected\n'
}

accept push '' '' '' legacy legacy
accept push '' false false legacy legacy
accept push '' true false blue-green deploy
accept push '' false true legacy legacy
accept workflow_dispatch '' false false legacy legacy
accept workflow_dispatch legacy false false legacy legacy
accept workflow_dispatch legacy false true legacy legacy
accept workflow_dispatch bootstrap false false blue-green bootstrap
accept workflow_dispatch deploy false false blue-green deploy
accept workflow_dispatch bootstrap true false blue-green bootstrap
accept workflow_dispatch deploy true false blue-green deploy
reject push '' true true
reject workflow_dispatch deploy true true
reject workflow_dispatch legacy true false
reject workflow_dispatch '' true false
reject workflow_dispatch bootstrap false true
reject workflow_dispatch deploy false true
reject push '' TRUE false
reject push '' false typo
reject workflow_dispatch unexpected false false
reject push bootstrap true false
reject push legacy true false
reject pull_request '' true false
reject repository_dispatch '' true false
ROUTE_REF=refs/heads/main reject push '' true false
ROUTE_REF=refs/heads/feature reject workflow_dispatch deploy false false
printf 'DEV_ROUTE_TESTS_PASSED=%s\n' "$passed"
