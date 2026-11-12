#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/coordinator.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
chmod 700 "$TEST_DIR"
ENVIRONMENT=dev
STATE_FILE="$TEST_DIR/state.json"
bg_now() { echo 1000; }
bg_route() { echo A; }
setup() {
  rm -f "$TEST_DIR/cloud-events"
  BG_MODE=deploy
  CONFIG=$(cat "$ROOT/infra/blue-green-deploy/controller/full-coordinator.example.json")
  jq -n --arg digest "$(bg_topology_digest)" '{schema_version:2,environment:"dev",sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",topology_digest:$digest,phase:"ROLLED_BACK",pending:null,http_recovered:true,worker_recovered:true,frontend:{changed:true,recovered:true}}' >"$STATE_FILE"
  chmod 600 "$STATE_FILE"
}
run() { local name=$1; shift; ( setup; "$@" ); printf 'PASS previous journal: %s\n' "$name"; }
change_state() { jq "$1" "$STATE_FILE" >"$STATE_FILE.next"; mv "$STATE_FILE.next" "$STATE_FILE"; chmod 600 "$STATE_FILE"; }
valid() { cp "$STATE_FILE" "$TEST_DIR/original"; bg_previous_journal; cmp "$STATE_FILE" "$TEST_DIR/original"; }
complete() { change_state '.phase="COMPLETE" | .sealed=true'; valid; }
bootstrap() { change_state '.phase="COMPLETE" | .mode="bootstrap"'; valid; }
plan_setup() {
  RUN_ID=123; GITHUB_SHA=cccccccccccccccccccccccccccccccccccccccc
  BG_IMAGE_DIGEST=sha256:new
  fe_enabled() { return 1; }
  bg_ec2_state() { echo running; }
  bg_ec2_change() { echo "$*" >>"$TEST_DIR/cloud-events"; }
  bg_ec2_wait() { :; }
  bg_issue() { :; }
  bg_output() { :; }
}
plan() {
  plan_setup
  bg_plan
  jq -e --arg sha "$GITHUB_SHA" --arg topology "$(bg_topology_digest)" '.phase=="PREPARING" and .sha==$sha and .topology_digest==$topology and .old=="A" and .target=="B"' "$STATE_FILE" >/dev/null
  [[ $(cat "$TEST_DIR/cloud-events") == 'start B' ]]
}
bad_state() {
  change_state "$1"
  plan_setup
  cp "$STATE_FILE" "$TEST_DIR/original"
  if ( bg_plan ) >"$TEST_DIR/error" 2>&1; then echo "Unexpected plan acceptance: $1" >&2; exit 1; fi
  cmp "$STATE_FILE" "$TEST_DIR/original"
  [[ ! -e "$TEST_DIR/cloud-events" ]]
}
run completed-rollback valid
run completed-deployment complete
run completed-bootstrap bootstrap
run next-main-sha-starts-without-configuration-change plan
for expression in \
  '.phase="NEEDS_ATTENTION"' \
  '.phase="OBSERVING"' \
  '.phase="COMPLETE"' \
  '.environment="prod"' \
  '.topology_digest="different"' \
  '.pending={operation:"rollback"}' \
  '.cleanup_deferred=true' \
  '.http_recovered=false' \
  '.worker_recovered=false' \
  '.frontend.recovered=false'; do
  run "$expression" bad_state "$expression"
done
