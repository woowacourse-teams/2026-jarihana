#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/coordinator.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
chmod 700 "$TEST_DIR"
ENVIRONMENT=dev
CONTROL_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
STATE_FILE="$TEST_DIR/state.json"
bg_now() { echo 1000; }
bg_route() { echo "${ROUTE:-A}"; }
setup() {
  rm -f "$TEST_DIR/cloud-events"
  ROUTE=A
  BG_MODE=deploy
  CONFIG=$(jq -c --arg sha "$CONTROL_SHA" '.topology.control={ref:"refs/tags/deployment-control-v2",sha:$sha}' "$ROOT/infra/blue-green-deploy/controller/full-coordinator.example.json")
  previous=$(jq -c '.topology | .control={ref:"refs/tags/deployment-control-v1",sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' <<<"$CONFIG")
  digest=$(jq -Sc . <<<"$previous" | sha256sum | cut -d ' ' -f 1)
  jq -n --arg digest "$digest" '{schema_version:2,environment:"dev",control_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",topology_digest:$digest,phase:"ROLLED_BACK",pending:null,http_recovered:true,worker_recovered:true,frontend:{changed:true,recovered:true},old:"A",target:"B",old_status:{slot:"A",image:"sha256:test",healthy:true,running:true,identity:{hostId:"dev-a",bootId:"boot-a"},authority:{phase:"COMPLETE",status:"ACTIVE",owner:{hostId:"dev-a",bootId:"boot-a"}},worker:{state:"ACTIVE",inFlight:0,unresolved:0}},target_status:null}' >"$STATE_FILE"
  chmod 600 "$STATE_FILE"
  hash=$(sha256sum "$STATE_FILE" | cut -d ' ' -f 1)
  cp -p "$STATE_FILE" "$STATE_FILE.control-$hash"
  CONFIG=$(jq -c --argjson previous "$previous" --arg hash "$hash" '.control_transition={schema_version:1,previous_topology:$previous,target_control:.topology.control,journal_sha256:$hash,active_slot:"A",issued_at:900,expires_at:1500}' <<<"$CONFIG")
}
refresh_hash() {
  hash=$(sha256sum "$STATE_FILE" | cut -d ' ' -f 1)
  cp -p "$STATE_FILE" "$STATE_FILE.control-$hash"
  CONFIG=$(jq -c --arg hash "$hash" '.control_transition.journal_sha256=$hash' <<<"$CONFIG")
}
change_state() { jq "$1" "$STATE_FILE" >"$STATE_FILE.next"; mv "$STATE_FILE.next" "$STATE_FILE"; chmod 600 "$STATE_FILE"; refresh_hash; }
rejects() { if ( bg_previous_journal ) >"$TEST_DIR/error" 2>&1; then echo "Unexpected transition acceptance: $1" >&2; exit 1; fi; }
run() { local name=$1; shift; ( setup; "$@" ); printf 'PASS control transition: %s\n' "$name"; }
valid() { cp "$STATE_FILE" "$TEST_DIR/original"; bg_previous_journal; [[ $BG_CONTROL_TRANSITION_SLOT == A ]]; cmp "$STATE_FILE" "$TEST_DIR/original"; }
same_control() { CONFIG=$(jq -c --argjson previous "$previous" '.topology=$previous | del(.control_transition)' <<<"$CONFIG"); CONTROL_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; bg_previous_journal; [[ -z $BG_CONTROL_TRANSITION_SLOT ]]; }
no_permit() { CONFIG=$(jq 'del(.control_transition)' <<<"$CONFIG"); rejects missing-permit; }
bad_permit() { CONFIG=$(jq "$1" <<<"$CONFIG"); rejects "$1"; }
bad_state() { change_state "$1"; rejects "$1"; }
changed_journal() { printf '\n' >>"$STATE_FILE"; rejects changed-journal; }
wrong_route() { ROUTE=B; rejects wrong-route; }
private_journal() { chmod 644 "$STATE_FILE"; rejects private-journal; }
missing_backup() { rm "$STATE_FILE.control-$hash"; rejects missing-backup; }
changed_backup() { printf '\n' >>"$STATE_FILE.control-$hash"; rejects changed-backup; }
public_backup() { chmod 644 "$STATE_FILE.control-$hash"; rejects public-backup; }
reused_permit() { change_state '.control_sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" | .phase="PREPARING"'; rejects reused-permit; }
complete() { change_state '.phase="COMPLETE" | .sealed=true'; valid; }
bootstrap() { change_state '.phase="COMPLETE" | .mode="bootstrap"'; valid; }
bootstrap_operation() { BG_MODE=bootstrap; rejects bootstrap-operation; }
wrong_control_sha() { CONTROL_SHA=cccccccccccccccccccccccccccccccccccccccc; rejects wrong-control-sha; }
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
  cp "$STATE_FILE" "$TEST_DIR/original"
  bg_plan
  jq -e --arg sha "$CONTROL_SHA" --arg topology "$(bg_topology_digest)" '.phase=="PREPARING" and .control_sha==$sha and .topology_digest==$topology and .old=="A" and .target=="B"' "$STATE_FILE" >/dev/null
  cmp "$TEST_DIR/original" "$STATE_FILE.control-$hash"
  [[ $(cat "$TEST_DIR/cloud-events") == 'start B' ]]
}
plan_route_changed() {
  plan_setup
  cp "$STATE_FILE" "$TEST_DIR/original"
  echo 0 >"$TEST_DIR/route-count"
  bg_route() {
    local count
    count=$(( $(cat "$TEST_DIR/route-count")+1 )); echo "$count" >"$TEST_DIR/route-count"
    if (( count==1 )); then echo A; else echo B; fi
  }
  if ( bg_plan ) >"$TEST_DIR/error" 2>&1; then exit 1; fi
  cmp "$TEST_DIR/original" "$STATE_FILE"
  [[ ! -f $TEST_DIR/cloud-events ]]
}
plan_expired() {
  plan_setup
  cp "$STATE_FILE" "$TEST_DIR/original"
  bg_now() { cat "$TEST_DIR/now"; }
  echo 1000 >"$TEST_DIR/now"
  bg_ec2_state() { echo 1500 >"$TEST_DIR/now"; echo running; }
  if ( bg_plan ) >"$TEST_DIR/error" 2>&1; then exit 1; fi
  cmp "$TEST_DIR/original" "$STATE_FILE"
  [[ ! -f $TEST_DIR/cloud-events ]]
}
run valid-rollback valid
run unchanged-control same_control
run missing-permit no_permit
run edited-journal changed_journal
run wrong-route wrong_route
run public-journal private_journal
run missing-backup missing_backup
run changed-backup changed_backup
run public-backup public_backup
run reused-permit reused_permit
run completed-deployment complete
run completed-bootstrap bootstrap
run bootstrap-operation-blocked bootstrap_operation
run wrong-control-sha wrong_control_sha
run next-plan-preserves-original plan
run changed-route-blocks-plan plan_route_changed
run expired-permit-blocks-plan plan_expired
for expression in \
  '.control_transition.expires_at=999' \
  '.control_transition.expires_at=5000' \
  '.control_transition.issued_at=1006' \
  '.control_transition.schema_version=2' \
  '.control_transition.target_control.sha="cccccccccccccccccccccccccccccccccccccccc"' \
  '.control_transition.previous_topology.a.instance_id="i-ccccccccccccccccc"' \
  '.control_transition.previous_topology.b.upstream="10.0.0.99:8080"' \
  '.control_transition.previous_topology.control.sha="cccccccccccccccccccccccccccccccccccccccc"' \
  '.control_transition.previous_topology.control.ref="refs/tags/deployment-control-v2"' \
  '.control_transition.active_slot="B"'; do
  run "$expression" bad_permit "$expression"
done
for expression in \
  '.phase="NEEDS_ATTENTION"' \
  '.phase="OBSERVING"' \
  '.phase="COMPLETE"' \
  '.environment="prod"' \
  '.pending={operation:"rollback"}' \
  '.cleanup_deferred=true' \
  '.http_recovered=false' \
  '.worker_recovered=false' \
  '.frontend.recovered=false' \
  '.old_status.worker.unresolved=1' \
  '.old_status.authority.owner.bootId="restarted"' \
  '.old_status.healthy=false'; do
  run "$expression" bad_state "$expression"
done
