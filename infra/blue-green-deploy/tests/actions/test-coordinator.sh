#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/coordinator.sh"
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bg-coordinator.XXXXXX")
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir "$TEST_DIR/bin"
# Production runs on GNU/Linux; use the same coreutils semantics on macOS.
if [[ $(uname) == Darwin ]]; then
  ln -s "$(command -v gstat)" "$TEST_DIR/bin/stat"
  ln -s "$(command -v gsync)" "$TEST_DIR/bin/sync"
fi
export PATH="$TEST_DIR/bin:$PATH"
cat >"$TEST_DIR/bin/aws" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$EVENTS"
[[ ${AWS_MAX_ATTEMPTS:-} == 1 ]] || exit 9
case "$*" in
  *describe-instances*) cat "$AWS_FIXTURE";;
  *start-instances*) [[ ${MUTATION_FAIL:-false} != true ]] || exit 7; printf '%s\n' '{"StartingInstances":[{"InstanceId":"i-bbbbbbbbbbbbbbbbb","PreviousState":{"Name":"stopped"},"CurrentState":{"Name":"pending"}}]}' ;;
  *stop-instances*) [[ ${MUTATION_FAIL:-false} != true ]] || exit 7; printf '%s\n' '{"StoppingInstances":[{"InstanceId":"i-aaaaaaaaaaaaaaaaa","PreviousState":{"Name":"running"},"CurrentState":{"Name":"stopping"}}]}' ;;
  *) exit 8;;
esac
MOCK
cat >"$TEST_DIR/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$EVENTS"
case "$*" in
 *'{{.Id}}'*) echo container-1;;
 *'{{.State.StartedAt}}/{{.RestartCount}}'*) echo "${GENERATION:-started/0}";;
 *'sh -c'*) printf '%s\n' "${WORKERS:-42:100}";;
 *'nginx -t'*) [[ ${NGINX_TEST_FAIL:-false} != true ]];;
 *'nginx -s reload'*) jq -e '.switched==true and .drain_ticket!=null' "$STATE_FILE" >/dev/null || exit 9; [[ ${RELOAD_FAIL:-false} != true ]] || exit 7; touch "$RELOADED";;
 *) exit 8;;
esac
MOCK
cat >"$TEST_DIR/bin/curl" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *'/api/v1/query'* ]]; then cat "$PROM_FIXTURE"; exit; fi
slot=A; ip=10.0.0.10:8080
if [[ -f "$RELOADED" ]]; then slot=B; ip=10.0.0.11:8080; fi
printf 'HTTP/1.1 200 OK\r\nX-Jarihana-Slot: %s\r\nX-Jarihana-Target: %s\r\nX-Jarihana-Upstream: %s\r\n\r\n{"success":true}\n' "$slot" "$ip" "$ip"
MOCK
chmod +x "$TEST_DIR/bin/"*
export EVENTS="$TEST_DIR/events" AWS_FIXTURE="$TEST_DIR/aws.json" PROM_FIXTURE="$TEST_DIR/prom.json" RELOADED="$TEST_DIR/reloaded"
bg_now() { echo 1000; }
bg_uuid() { echo aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa; }
bg_live() { [[ ${REVOKED:-false} != true ]] || bg_die 'Run cancelled'; }
setup() {
  rm -f "$EVENTS" "$RELOADED"
  rm -rf "$TEST_DIR/state"
  mkdir -p "$TEST_DIR/state/nginx"
  chmod 700 "$TEST_DIR/state" "$TEST_DIR/state/nginx"
  export STATE_FILE="$TEST_DIR/state/state.json"
  CONFIG=$(jq -c --arg directory "$TEST_DIR/state/nginx" '.nginx.directory=$directory' "$ROOT/infra/blue-green-deploy/controller/full-coordinator.example.json")
  ENVIRONMENT=dev; RUN_ID=123; GITHUB_SHA=bbbb; CONTROL_SHA=aaaa; REPO=woowacourse-teams/2026-jarihana
  STATE=$(jq -cn '{schema_version:2,revision:0,environment:"dev",run_id:123,attempt:1,sha:"bbbb",control_sha:"aaaa",mode:"deploy",deployment_id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",phase:"PREPARING",target:"B",old:"A",image:"sha256:test",heartbeat:900,expires_at:8000,pending:{id:"grant-1",operation:"prepare",slot:"B",deadline:2500},old_status:null,target_status:null,switched:false,sealed:false}')
  STATE=$(jq -c --arg topology "$(bg_topology_digest)" '.topology_digest=$topology' <<<"$STATE")
  bg_atomic "$STATE_FILE" "$STATE"
  RECEIPT='{"operation":"prepare","slot":"B","deployment_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","pending_id":"grant-1","grant_id":"grant-1","run_id":123,"instance_id":"i-bbbbbbbbbbbbbbbbb","environment":"dev","identity":{"hostId":"dev-b","bootId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"},"worker":{"state":"PAUSED","inFlight":0,"unresolved":0},"activity":{"httpInFlight":0,"backgroundInFlight":0,"backgroundDrained":true},"authority":null,"healthy":true,"running":true,"image":"sha256:test"}'
  printf '%s\n' '{"Reservations":[{"OwnerId":"000000000000","Instances":[{"InstanceId":"i-bbbbbbbbbbbbbbbbb","VpcId":"vpc-00000000000000000","PrivateIpAddress":"10.0.0.11","RootDeviceType":"ebs","State":{"Name":"stopped"}}]}]}' >"$AWS_FIXTURE"
  printf 'old config\n' >"$TEST_DIR/state/nginx/current.conf"; chmod 600 "$TEST_DIR/state/nginx/current.conf"
}
rejects() { if ( "$@" ) >"$TEST_DIR/rejection.log" 2>&1; then echo "Unexpected success: $*" >&2; return 1; fi; }
run() { local name=$1; shift; ( setup; "$@" ); printf 'PASS %s\n' "$name"; }
valid_receipt() { bg_accept "$RECEIPT" prepare B target_status; jq -e '.target_status.pending_id=="grant-1" and .revision==1' "$STATE_FILE" >/dev/null; }
wrong_grant() { rejects bg_accept "$(jq '.grant_id="stale"' <<<"$RECEIPT")" prepare B target_status; }
fractional_activity() { rejects bg_accept "$(jq '.activity.httpInFlight=0.5' <<<"$RECEIPT")" prepare B target_status; }
wrong_boot() { bg_accept "$RECEIPT" prepare B target_status; rejects bg_accept "$(jq '.identity.bootId="cccccccc-cccc-cccc-cccc-cccccccccccc"' <<<"$RECEIPT")" prepare B target_status; }
private_state() { chmod 644 "$STATE_FILE"; rejects bg_load; }
symlink_state() { mv "$STATE_FILE" "$STATE_FILE.original"; ln -s "$STATE_FILE.original" "$STATE_FILE"; rejects bg_load; }
writable_dir() { chmod 777 "$TEST_DIR/state"; rejects bg_guard; }
cancel_guard() { REVOKED=true; rejects bg_guard; }
active_lease() { bg_guard; }
expired_lease() { STATE=$(jq '.pending.deadline=999' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"; rejects bg_guard; }
watchdog_active() { bg_watchdog; jq -e '.phase=="PREPARING"' "$STATE_FILE" >/dev/null; }
watchdog_expired() { STATE=$(jq '.pending.deadline=999' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"; bg_watchdog; jq -e '.phase=="NEEDS_ATTENTION" and .pending.id=="grant-1"' "$STATE_FILE" >/dev/null; }
cloud_start() { bg_ec2_change start B; [[ $(wc -l <"$EVENTS") -eq 2 ]]; }
cloud_mismatch() { jq '.Reservations[0].OwnerId="other"' "$AWS_FIXTURE" >"$AWS_FIXTURE.new"; mv "$AWS_FIXTURE.new" "$AWS_FIXTURE"; rejects bg_ec2_change start B; [[ $(wc -l <"$EVENTS") -eq 1 ]]; }
cloud_unknown() { export MUTATION_FAIL=true; rejects bg_ec2_change start B; [[ $(wc -l <"$EVENTS") -eq 2 ]]; }
cloud_stop_unsealed() { rejects bg_ec2_change stop B; [[ $(wc -l <"$EVENTS") -eq 1 ]]; }
nginx_failed_test() { export NGINX_TEST_FAIL=true; rejects bg_switch_http B; [[ ! -e "$RELOADED" ]]; jq -e '.switched==false' "$STATE_FILE" >/dev/null; }
nginx_switch() { bg_switch_http B; jq -e '.switched==true and .drain_ticket.workers==["42:100"]' "$STATE_FILE" >/dev/null; [[ -e "$RELOADED" ]]; }
nginx_unknown_reload() { export RELOAD_FAIL=true; rejects bg_switch_http B; jq -e '.switched==true and .drain_ticket!=null' "$STATE_FILE" >/dev/null; }
nginx_drain() { local ticket; ticket=$(bg_capture); rejects bg_drained "$ticket"; export WORKERS=42:101; bg_drained "$ticket"; export GENERATION=restarted/1; rejects bg_drained "$ticket"; }
nginx_bad_current() { chmod 666 "$TEST_DIR/state/nginx/current.conf"; rejects bg_switch_http B; [[ ! -e "$RELOADED" ]]; }
scalar_nan() { echo '{"status":"success","data":{"resultType":"vector","result":[{"value":[1000,"NaN"]}]}}' >"$PROM_FIXTURE"; rejects bg_scalar up; }
scalar_multiple() { echo '{"status":"success","data":{"resultType":"vector","result":[{"value":[1000,"1"]},{"value":[1000,"1"]}]}}' >"$PROM_FIXTURE"; rejects bg_scalar up; }
observation_minimum() {
  echo 1000 >"$TEST_DIR/clock"; echo 500 >"$TEST_DIR/mono"
  bg_now() { cat "$TEST_DIR/clock"; }
  bg_uptime() { cat "$TEST_DIR/mono"; }
  sleep() { echo "$(( $(cat "$TEST_DIR/clock")+300 ))" >"$TEST_DIR/clock"; echo "$(( $(cat "$TEST_DIR/mono")+300 ))" >"$TEST_DIR/mono"; }
  bg_github() { echo '{"jobs":[]}'; }
  bg_target_ready() { return 0; }
  STATE=$(jq '.phase="OBSERVING" | .pending.operation="observe"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  bg_observe
  jq -e '.http_observed_finished_at-.http_observed_started_at==900' "$STATE_FILE" >/dev/null
}
observation_clock_jump() {
  bg_uptime() { echo 1; }
  bg_now() { if [[ -f "$TEST_DIR/jumped" ]]; then echo 1100; else echo 1000; fi; }
  bg_github() { echo '{"jobs":[]}'; }; bg_target_ready() { return 0; }
  sleep() { touch "$TEST_DIR/jumped"; }
  STATE=$(jq '.phase="OBSERVING"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  rejects bg_observe
  jq -e '.http_observed_finished_at==null' "$STATE_FILE" >/dev/null
}
stop_requires_evidence() {
  STATE=$(jq '.old="B" | .target="A" | .pending.operation="stop"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  RECEIPT=$(jq '.operation="stop" | .normal_exit=true | .running=false | .authority={environment:"dev"}' <<<"$RECEIPT")
  rejects bg_accept "$RECEIPT" stop B old_status
}
unknown_blocks_plan() {
  STATE=$(jq '.phase="NEEDS_ATTENTION"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  rejects bg_plan
  [[ ! -e "$EVENTS" ]]
}
cloud_stop_sealed() {
  STATE=$(jq '.phase="SEALED" | .sealed=true | .old_status={normal_exit:true,running:false} | .pending.operation="stop"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  jq '.Reservations[0].Instances[0] |= (.InstanceId="i-aaaaaaaaaaaaaaaaa" | .PrivateIpAddress="10.0.0.10" | .State.Name="running")' "$AWS_FIXTURE" >"$AWS_FIXTURE.new"; mv "$AWS_FIXTURE.new" "$AWS_FIXTURE"
  bg_ec2_change stop A
  [[ $(wc -l <"$EVENTS") -eq 2 ]]
  grep -Fq -- '--no-force --no-hibernate' "$EVENTS"
}
rollback_fixture() {
  STATE=$(jq '.phase="ROLLING_BACK" | .pending.operation="rollback"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  APP_RESULT=$(jq '.operation="rollback" | .healthy=false | .authority={environment:"dev",deploymentId:.deployment_id,status:"UNASSIGNED",owner:null,phase:"HANDOFF"}' <<<"$RECEIPT")
}
rollback_unhealthy_released() {
  rollback_fixture; bg_grant_rollback_old
  jq -e '.pending.slot=="A" and .pending.operation=="rollback"' "$STATE_FILE" >/dev/null
  APP_RESULT=$(jq --arg grant "$(jq -r '.pending.id' <<<"$STATE")" '.slot="A" | .instance_id="i-aaaaaaaaaaaaaaaaa" | .healthy=true | .identity={hostId:"dev-a",bootId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} | .worker.state="ACTIVE" | .authority.owner=.identity | .authority.status="ACTIVE" | .authority.phase="COMPLETE" | .pending_id=$grant | .grant_id=$grant' <<<"$APP_RESULT")
  bg_drained() { return 0; }; bg_route() { echo A; }
  bg_finish_rollback
  jq -e '.phase=="ROLLED_BACK" and .worker_recovered==true and .pending==null' "$STATE_FILE" >/dev/null
}
rollback_unknown() { rollback_fixture; APP_RESULT=$(jq 'del(.worker.unresolved)' <<<"$APP_RESULT"); rejects bg_grant_rollback_old; jq -e '.pending.slot=="B"' "$STATE_FILE" >/dev/null; }
rollback_malformed() { rollback_fixture; APP_RESULT=$(jq '.healthy=null' <<<"$APP_RESULT"); rejects bg_grant_rollback_old; jq -e '.pending.slot=="B"' "$STATE_FILE" >/dev/null; }
rollback_owned() { rollback_fixture; APP_RESULT=$(jq '.authority.status="ACTIVE" | .authority.owner=.identity' <<<"$APP_RESULT"); rejects bg_grant_rollback_old; jq -e '.pending.slot=="B"' "$STATE_FILE" >/dev/null; }
stop_receipt_fixture() {
  STATE=$(jq '.old="B" | .target="A" | .pending.operation="stop" | .target_status={identity:{hostId:"dev-a",bootId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  APP_RESULT=$(jq '.operation="stop" | .normal_exit=true | .running=false | .authority={environment:"dev",deploymentId:.deployment_id,status:"ACTIVE",phase:"COMPLETE",owner:{hostId:"dev-a",bootId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}} | .shutdown_evidence={signal:"SIGTERM",stop_cli_exit:0,exit_code:143,boot_id:.identity.bootId,oom_killed:false,restart_count_delta:0}' <<<"$RECEIPT")
}
stop_valid_receipt() { stop_receipt_fixture; bg_accept "$APP_RESULT" stop B old_status; }
stop_wrong_target_boot() { stop_receipt_fixture; APP_RESULT=$(jq '.authority.owner.bootId="cccccccc-cccc-cccc-cccc-cccccccccccc"' <<<"$APP_RESULT"); rejects bg_accept "$APP_RESULT" stop B old_status; }
stop_wrong_grant() { stop_receipt_fixture; APP_RESULT=$(jq '.pending_id="old"' <<<"$APP_RESULT"); rejects bg_accept "$APP_RESULT" stop B old_status; }
topology_load() { bg_load; }
topology_load_mismatch() { CONFIG=$(jq '.topology.b.upstream="10.0.0.12:8080"' <<<"$CONFIG"); rejects bg_load; }
topology_guard_mismatch() { CONFIG=$(jq '.topology.a.instance_id="i-ccccccccccccccccc"' <<<"$CONFIG"); rejects bg_guard; }
topology_completed_mismatch() {
  STATE=$(jq '.phase="COMPLETE"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  CONFIG=$(jq '.topology.b.host_id="replacement-b"' <<<"$CONFIG")
  rejects bg_plan
  [[ ! -e "$EVENTS" ]]
}
topology_missing_completed() {
  STATE=$(jq '.phase="ROLLED_BACK" | del(.topology_digest)' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  rejects bg_plan
  [[ ! -e "$EVENTS" ]]
}
topology_plan() {
  STATE=$(jq '.phase="COMPLETE"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  BG_MODE=bootstrap; BG_IMAGE_DIGEST=sha256:test
  bg_ec2_state() { if [[ $1 == A ]]; then echo running; else echo stopped; fi; }
  bg_output() { :; }
  bg_plan
  jq -e --arg topology "$(bg_topology_digest)" '.topology_digest==$topology and .pending.operation=="bootstrap"' "$STATE_FILE" >/dev/null
}
readonly_guard_cache() {
  BG_COORDINATOR_READ_ONLY=true; BG_READ_ONLY_VERIFIED_AT=0
  bg_live() { echo checked >>"$EVENTS"; }
  bg_guard; bg_guard
  [[ $(wc -l <"$EVENTS") -eq 1 ]]
  BG_COORDINATOR_READ_ONLY=false
  bg_guard; bg_guard
  [[ $(wc -l <"$EVENTS") -eq 3 ]]
}
cloud_mutation_uncached() {
  BG_COORDINATOR_READ_ONLY=true; BG_READ_ONLY_VERIFIED_AT=1000; REVOKED=true
  rejects bg_ec2_change start B
  [[ $(wc -l <"$EVENTS") -eq 1 ]]
  grep -Fq -- 'describe-instances' "$EVENTS"
}
nginx_reload_uncached() {
  BG_COORDINATOR_READ_ONLY=true; BG_READ_ONLY_VERIFIED_AT=1000; REVOKED=true
  rejects bg_reload
  [[ ! -e "$EVENTS" ]]
}
observation_job_cadence() {
  echo 1000 >"$TEST_DIR/clock"; echo 500 >"$TEST_DIR/mono"
  bg_now() { cat "$TEST_DIR/clock"; }
  bg_uptime() { cat "$TEST_DIR/mono"; }
  sleep() { [[ $1 == 5 ]]; echo "$(( $(cat "$TEST_DIR/clock")+5 ))" >"$TEST_DIR/clock"; echo "$(( $(cat "$TEST_DIR/mono")+5 ))" >"$TEST_DIR/mono"; }
  bg_github() {
    bg_now >>"$TEST_DIR/job-polls"
    if [[ $(wc -l <"$TEST_DIR/job-polls") -eq 2 ]]; then echo '{"jobs":[{"name":"candidate-worker-observation","conclusion":"failure"}]}'; else echo '{"jobs":[]}'; fi
  }
  bg_target_ready() { bg_now >>"$TEST_DIR/health-polls"; }
  STATE=$(jq '.phase="OBSERVING" | .pending.operation="observe"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  rejects bg_observe
  [[ $(cat "$TEST_DIR/job-polls") == $'1000\n1015' ]]
  [[ $(cat "$TEST_DIR/health-polls") == $'1000\n1005\n1010\n1015' ]]
}
seal_fixture() {
  rm -f "$TEST_DIR/seal-outputs"
  echo 2000 >"$TEST_DIR/seal-clock"
  bg_now() { cat "$TEST_DIR/seal-clock"; }
  sleep() { echo "$(( $(bg_now)+60 ))" >"$TEST_DIR/seal-clock"; }
  bg_output() { printf '%s=%s\n' "$1" "$2" >>"$TEST_DIR/seal-outputs"; }
  bg_target_ready() { return 0; }
  bg_drained() { return 1; }
  STATE=$(jq '.phase="OBSERVING" | .switched=true | .observation_failed=false |
    .pending.operation="observe" | .pending.issued_at=100 | .pending.deadline=5000 |
    .http_observed_started_at=100 | .http_observed_finished_at=1000' <<<"$STATE")
  bg_atomic "$STATE_FILE" "$STATE"
  APP_RESULT=$(jq '.operation="observe" | .observed_started_at=100 | .observed_finished_at=1000 |
    .worker.state="ACTIVE" | .authority={environment:"dev",deploymentId:.deployment_id,status:"ACTIVE",phase:"OBSERVE",owner:.identity}' <<<"$RECEIPT")
}
seal_undrained_keeps_target() {
  seal_fixture
  bg_seal
  jq -e '.phase=="NEEDS_ATTENTION" and .cleanup_deferred==true and .sealed==false and
    .switched==true and .target_status.authority.owner.hostId=="dev-b" and .pending.id=="grant-1"' "$STATE_FILE" >/dev/null
  grep -qx 'cleanup_deferred=true' "$TEST_DIR/seal-outputs"
  [[ ! -e "$EVENTS" ]]
  bg_switch_http() { echo unexpected-switch >>"$EVENTS"; }
  rejects bg_rollback_http
  [[ ! -e "$EVENTS" ]]
  bg_attention 'Workflow interrupted'
  jq -e '.cleanup_deferred==true and (.reason|startswith("Previous HTTP connections did not drain"))' "$STATE_FILE" >/dev/null
}
seal_drained_completes_normally() {
  seal_fixture
  bg_drained() { return 0; }
  bg_seal
  jq -e '.phase=="SEALED" and .sealed==true and .pending.operation=="complete" and .pending.slot=="B" and .cleanup_deferred!=true' "$STATE_FILE" >/dev/null
  grep -qx 'cleanup_deferred=false' "$TEST_DIR/seal-outputs"
}
seal_unhealthy_still_allows_rollback() {
  seal_fixture
  echo 2300 >"$TEST_DIR/seal-clock"
  bg_target_ready() { return 1; }
  rejects bg_seal
  STATE=$(cat "$STATE_FILE")
  jq -e '.cleanup_deferred!=true and .sealed==false' <<<"$STATE" >/dev/null
  bg_switch_http() { echo recovered >>"$EVENTS"; TICKET='{}'; }
  bg_rollback_http
  jq -e '.phase=="ROLLING_BACK" and .http_recovered==true and .pending.operation=="rollback"' "$STATE_FILE" >/dev/null
}
seal_unknown_target_not_deferred() {
  seal_fixture
  bg_target_ready() { return 2; }
  rejects bg_seal
  jq -e '.cleanup_deferred!=true and .sealed==false' "$STATE_FILE" >/dev/null
  [[ ! -e "$TEST_DIR/seal-outputs" ]]
}
rollback_http_unknown_preserves_grant() {
  STATE=$(jq '.switched=true | .phase="OBSERVING" | .http_recovered=false | .pending.operation="observe"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  bg_switch_http() { return 1; }
  rejects bg_rollback_http
  jq -e '.pending.id=="grant-1" and .pending.operation=="observe" and .http_recovered==false' "$STATE_FILE" >/dev/null
}
for test in valid_receipt wrong_grant fractional_activity wrong_boot private_state symlink_state writable_dir cancel_guard active_lease expired_lease watchdog_active watchdog_expired cloud_start cloud_mismatch cloud_unknown cloud_stop_unsealed cloud_stop_sealed nginx_failed_test nginx_switch nginx_unknown_reload nginx_drain nginx_bad_current scalar_nan scalar_multiple observation_minimum observation_clock_jump stop_requires_evidence unknown_blocks_plan rollback_unhealthy_released rollback_unknown rollback_malformed rollback_owned stop_valid_receipt stop_wrong_target_boot stop_wrong_grant topology_load topology_load_mismatch topology_guard_mismatch topology_completed_mismatch topology_missing_completed topology_plan readonly_guard_cache cloud_mutation_uncached nginx_reload_uncached observation_job_cadence rollback_http_unknown_preserves_grant seal_undrained_keeps_target seal_drained_completes_normally seal_unhealthy_still_allows_rollback seal_unknown_target_not_deferred; do run "$test" "$test"; done
