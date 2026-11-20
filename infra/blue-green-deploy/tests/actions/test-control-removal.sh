#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/coordinator.sh"
SCRIPT="$ROOT/infra/blue-green-deploy/scripts/prepare-control-removal.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEST_DIR"' EXIT
umask 077

setup() {
  CASE_DIR="$TEST_DIR/$1"; mkdir "$CASE_DIR" "$CASE_DIR/input"
  local name
  for name in coordinator app-A app-B; do
    jq '.topology.control={ref:"refs/tags/deployment-control-old",sha:"1111111111111111111111111111111111111111"} | .control_transition={legacy:true}' \
      "$ROOT/infra/blue-green-deploy/controller/full-$name.example.json" >"$CASE_DIR/input/$name.json"
  done
  CONFIG=$(cat "$CASE_DIR/input/coordinator.json")
  jq -n --arg digest "$(bg_topology_digest)" '{schema_version:2,environment:"dev",run_id:123,attempt:1,sha:"2222222222222222222222222222222222222222",control_sha:"1111111111111111111111111111111111111111",topology_digest:$digest,mode:"deploy",phase:"COMPLETE",sealed:true,pending:null,old:"A",target:"B",image:"sha256:preserve",target_status:{compose_source:{commit:"3333333333333333333333333333333333333333",sha256:"preserve-hash"}},frontend:{current:"keep"}}' >"$CASE_DIR/input/state.json"
}
change() { local path="$CASE_DIR/input/$1"; jq "$2" "$path" >"$path.next"; mv "$path.next" "$path"; }
prepare() { bash "$SCRIPT" "$CASE_DIR/input" "$CASE_DIR/output" >"$CASE_DIR/log" 2>&1; }
reject() { if prepare; then cat "$CASE_DIR/log" >&2; return 1; fi; [[ ! -e $CASE_DIR/output ]]; }
verify() {
  local name
  for name in coordinator app-A app-B; do
    jq -e --slurpfile original "$CASE_DIR/input/$name.json" '.==($original[0]|del(.topology.control,.control_transition))' "$CASE_DIR/output/after/$name.json" >/dev/null
  done
  jq -e --slurpfile original "$CASE_DIR/input/state.json" '(del(.topology_digest))==($original[0]|del(.topology_digest)) and .topology_digest!=$original[0].topology_digest' "$CASE_DIR/output/after/state.json" >/dev/null
  for name in coordinator.json app-A.json app-B.json state.json; do
    cmp "$CASE_DIR/input/$name" "$CASE_DIR/output/before/$name"
    [[ $(stat -c %a "$CASE_DIR/output/after/$name") == 600 ]]
  done
  [[ $(stat -c %a "$CASE_DIR/output") == 700 ]]
  (cd "$CASE_DIR/output/before" && sha256sum --check SHA256SUMS >/dev/null)
  (cd "$CASE_DIR/output/after" && sha256sum --check SHA256SUMS >/dev/null)
  CONFIG=$(cat "$CASE_DIR/output/after/coordinator.json")
  ENVIRONMENT=dev; STATE_FILE="$CASE_DIR/output/after/state.json"
  bg_previous_journal
  # The migration does not weaken later protection against a real topology change.
  CONFIG=$(jq '.topology.a.upstream="10.0.0.99:8080"' <<<"$CONFIG")
  if (bg_previous_journal) >"$CASE_DIR/mismatch.log" 2>&1; then return 1; fi
}
complete() { prepare; verify; }
bootstrap() { change state.json '.mode="bootstrap" | .sealed=false'; complete; }
rollback() { change state.json '.phase="ROLLED_BACK" | .sealed=false | .http_recovered=true | .worker_recovered=true | .frontend={changed:true,recovered:true}'; complete; }
unfinished() { change state.json '.phase="NEEDS_ATTENTION"'; reject; }
pending() { change state.json '.pending={operation:"stop"}'; reject; }
cleanup() { change state.json '.cleanup_deferred=true'; reject; }
unsealed() { change state.json '.sealed=false'; reject; }
rollback_incomplete() { change state.json '.phase="ROLLED_BACK" | .http_recovered=true | .worker_recovered=true | .frontend={changed:true,recovered:false}'; reject; }
config_mismatch() { change app-A.json '.topology.a.upstream="10.0.0.99:8080"'; reject; }
digest_mismatch() { change state.json '.topology_digest="different"'; reject; }
wrong_slot() { change app-A.json '.local_slot="B"'; reject; }
wrong_repository() { change app-B.json '.repository.id=1'; reject; }
wrong_control_sha() { change state.json '.control_sha="4444444444444444444444444444444444444444"'; reject; }
already_removed() { change coordinator.json 'del(.topology.control)'; reject; }
multiple_json() { printf '{}\n' >>"$CASE_DIR/input/state.json"; reject; }
public_snapshot() { chmod 644 "$CASE_DIR/input/state.json"; reject; }
symlink_snapshot() { mv "$CASE_DIR/input/state.json" "$CASE_DIR/state.json"; ln -s "$CASE_DIR/state.json" "$CASE_DIR/input/state.json"; reject; }
existing_output() {
  mkdir "$CASE_DIR/output"; printf keep >"$CASE_DIR/output/sentinel"
  if prepare; then return 1; fi
  [[ $(cat "$CASE_DIR/output/sentinel") == keep ]]
}

for scenario in complete bootstrap rollback unfinished pending cleanup unsealed rollback_incomplete config_mismatch digest_mismatch wrong_slot wrong_repository wrong_control_sha already_removed multiple_json public_snapshot symlink_snapshot existing_output; do
  (setup "$scenario"; "$scenario")
  printf 'PASS control removal: %s\n' "$scenario"
done
