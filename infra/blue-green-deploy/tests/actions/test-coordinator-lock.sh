#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/coordinator.sh"
umask 077
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

await_file() {
  local i
  for ((i=0; i<1000; i++)); do
    [[ ! -f $1 ]] || return 0
    command sleep 0.01
  done
  printf 'Timed out waiting for test event: %s\n' "$1" >&2
  return 1
}

# Keep the real main entrypoint and flock; isolate host setup and phase side effects.
bg_init() { STATE_FILE="$CASE_DIR/state.json"; RUN_ID=123; }
bg_load() { STATE=$(cat "$STATE_FILE"); jq -r '.revision' <<<"$STATE" > "$CASE_DIR/loaded${PHASE_ID:-}"; }
bg_observe() {
  touch "$CASE_DIR/entered${PHASE_ID:-}"
  if [[ ${HOLD_PHASE:-false} == true ]]; then await_file "$CASE_DIR/release-phase"; fi
}
bg_attention() { touch "$CASE_DIR/attention"; }
bg_output() { :; }
flock() { touch "$CASE_DIR/attempted${PHASE_ID:-}"; command flock "$@"; }

phase_waits_for_watchdog() {
  (
    exec 8>"$STATE_FILE.lock"
    command flock 8
    touch "$CASE_DIR/held"
    await_file "$CASE_DIR/attempted"
    command sleep 0.3
    printf '{"revision":1}\n' > "$STATE_FILE"
  ) &
  local holder=$! status=0
  await_file "$CASE_DIR/held"
  ( main observe ) > "$CASE_DIR/phase.log" 2>&1 || status=$?
  wait "$holder"
  if (( status!=0 )); then cat "$CASE_DIR/phase.log" >&2; return 1; fi
  [[ -f $CASE_DIR/entered && $(cat "$CASE_DIR/loaded") == 1 && ! -e $CASE_DIR/attention ]]
}

phases_remain_exclusive() {
  ( PHASE_ID=first HOLD_PHASE=true main observe ) > "$CASE_DIR/first.log" 2>&1 &
  local first=$!
  await_file "$CASE_DIR/enteredfirst"
  local probe_status=0
  command flock -n -E 75 "$STATE_FILE.lock" true || probe_status=$?
  [[ $probe_status == 75 ]]
  ( PHASE_ID=second main observe ) > "$CASE_DIR/second.log" 2>&1 &
  local second=$!
  await_file "$CASE_DIR/attemptedsecond"
  [[ ! -e $CASE_DIR/enteredsecond ]]
  touch "$CASE_DIR/release-phase"
  wait "$first"
  wait "$second"
  [[ -f $CASE_DIR/enteredsecond ]]
}

phase_lock_timeout_preserves_state() {
  exec 8>"$STATE_FILE.lock"
  command flock 8
  local started=$SECONDS status=0
  ( exec 8>&-; main observe ) > "$CASE_DIR/phase.log" 2>&1 || status=$?
  exec 8>&-
  (( status!=0 && SECONDS-started>=14 && SECONDS-started<25 ))
  grep -q 'Timed out waiting 15 seconds for the deployment lock' "$CASE_DIR/phase.log"
  [[ ! -e $CASE_DIR/entered && ! -e $CASE_DIR/loaded && ! -e $CASE_DIR/attention ]]
  [[ $(cat "$STATE_FILE") == '{"revision":0}' ]]
}

watchdog_skips_busy_lock() {
  exec 8>"$STATE_FILE.lock"
  command flock 8
  (
    exec 8>&- 9>"$STATE_FILE.lock"
    if bg_lock watchdog; then touch "$CASE_DIR/entered"; fi
  )
  exec 8>&-
  [[ ! -e $CASE_DIR/entered ]]
}

watchdog_acquires_free_lock() {
  ( exec 9>"$STATE_FILE.lock"; bg_lock watchdog; touch "$CASE_DIR/entered" )
  [[ -f $CASE_DIR/entered ]]
}

watchdog_lock_error_is_failure() {
  local status=0
  ( exec 9>&-; if bg_lock watchdog; then touch "$CASE_DIR/entered"; fi ) > "$CASE_DIR/watchdog.log" 2>&1 || status=$?
  (( status!=0 ))
  grep -q 'Cannot acquire the watchdog deployment lock' "$CASE_DIR/watchdog.log"
  [[ ! -e $CASE_DIR/entered ]]
}

for test in phase_waits_for_watchdog phases_remain_exclusive phase_lock_timeout_preserves_state watchdog_skips_busy_lock watchdog_acquires_free_lock watchdog_lock_error_is_failure; do
  (
    CASE_DIR="$TEST_DIR/$test"
    mkdir -m 700 "$CASE_DIR"
    STATE_FILE="$CASE_DIR/state.json"
    printf '{"revision":0}\n' > "$STATE_FILE"
    "$test"
  )
  printf 'PASS %s\n' "$test"
done
