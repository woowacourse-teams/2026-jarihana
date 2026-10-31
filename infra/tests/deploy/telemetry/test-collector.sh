#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
[[ $(uname -s) == Linux && $(id -u) == 0 ]] || { echo 'Linux root fixture required' >&2; exit 1; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ENVIRONMENT=${COLLECTOR_TEST_ENVIRONMENT:-prod}
[[ $ENVIRONMENT == dev || $ENVIRONMENT == prod ]] || exit 2
if [[ -n ${COLLECTOR_TEST_ARTIFACT_DIR:-} ]]; then COLLECTOR_TEST_ARTIFACT_DIR=$COLLECTOR_TEST_ARTIFACT_DIR/$ENVIRONMENT; fi
mkdir -p "$T/config/$ENVIRONMENT" "$T/deploy/$ENVIRONMENT" "$T/bin"
jq --arg env "$ENVIRONMENT" ' .topology.environment=$env | .nginx.directory=("/var/lib/jarihana-deploy/"+$env+"/nginx")' \
  "$ROOT/infra/blue-green-deploy/controller/full-coordinator.example.json" > "$T/config/$ENVIRONMENT/coordinator.json"
chmod 640 "$T/config/$ENVIRONMENT/coordinator.json"
export BG_OBSERVABILITY_CONFIG_ROOT="$T/config" BG_OBSERVABILITY_DEPLOY_ROOT="$T/deploy" BG_OBSERVABILITY_ROOT="$T/observability"
export TEST_CONFIG="$T/config/$ENVIRONMENT/coordinator.json" TEST_ROOT="$T"
cat > "$T/bin/aws" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ $1 == ec2 && $2 == describe-instances ]] || { touch "$TEST_ROOT/MUTATION"; exit 99; }
id=$4
jq -cn --arg id "$id" --slurpfile c "$TEST_CONFIG" --arg state "$(cat "$TEST_ROOT/ec2-state")" --arg bad "$(cat "$TEST_ROOT/ec2-bad")" '
$c[0] as $c|($c.topology|[.a,.b][]|select(.instance_id==$id)) as $h|
{Reservations:[{OwnerId:$c.ec2.account_id,Instances:[{InstanceId:(if $bad=="1" then "i-00000000" else $id end),VpcId:$c.ec2.vpc_id,PrivateIpAddress:($h.upstream|split(":")[0]),RootDeviceType:"ebs",State:{Name:$state}}]}]}'
MOCK
cat > "$T/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "$*" == *'/__deployment'* && "$*" != *'--request'* ]] || { touch "$TEST_ROOT/MUTATION"; exit 99; }
slot=$(cat "$TEST_ROOT/route")
upstream=$(jq -r --arg s "${slot,,}" '.topology[$s].upstream' "$TEST_CONFIG")
actual=$upstream; [[ $(cat "$TEST_ROOT/route-bad") == 0 ]] || actual=10.99.99.99:8080
printf 'HTTP/1.1 200 OK\r\nX-Jarihana-Slot: %s\r\nX-Jarihana-Target: %s\r\nX-Jarihana-Upstream: %s\r\n\r\n{"success":true}\n' "$slot" "$upstream" "$actual"
MOCK
cat > "$T/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
case "$1" in
 inspect) case "$3" in '{{.Id}}') echo container1;; '{{.State.StartedAt}}/{{.RestartCount}}') echo generation/0;; *) exit 1;; esac;;
 exec) [[ "$*" != *'nginx -s'* && "$*" == *'/proc/'* ]] || { touch "$TEST_ROOT/MUTATION"; exit 99; }; cat "$TEST_ROOT/workers";;
 logs) exit 0;;
 *) touch "$TEST_ROOT/MUTATION"; exit 99;;
esac
MOCK
chmod 755 "$T/bin/"*
export PATH="$T/bin:$PATH"
echo running > "$T/ec2-state"; echo 0 > "$T/ec2-bad"; echo A > "$T/route"; echo 0 > "$T/route-bad"; echo '20:200' > "$T/workers"
source "$ROOT/infra/scripts/deploy/actions/common.sh"
CONFIG=$(cat "$TEST_CONFIG"); now=$(date +%s)
journal=$(jq -cn --arg digest "$(bg_topology_digest)" --arg control "$(jq -r '.topology.control.sha' <<< "$CONFIG")" --argjson now "$now" --arg env "$ENVIRONMENT" '{schema_version:2,revision:1,environment:$env,run_id:123,attempt:1,sha:("a"*40),control_sha:$control,topology_digest:$digest,mode:"deploy",old:"A",target:"B",phase:"PREPARING",created_at:($now-100),heartbeat:$now,expires_at:($now+7200),pending:null,drain_ticket:{container_id:"container1",generation:"generation/0",workers:["10:100"]}}')
file="$T/deploy/$ENVIRONMENT/state.json"; prom="$T/observability/$ENVIRONMENT/textfile/deployment.prom"
iteration=0; assertions=0
run() {
  local before=absent
  [[ ! -f $file ]] || before=$(sha256sum "$file")
  bash "$ROOT/infra/monitoring/deployment/collect.sh" "$ENVIRONMENT"
  [[ ! -e "$T/MUTATION" ]]
  if [[ $before == absent ]]; then [[ ! -e $file ]]; else [[ $before == "$(sha256sum "$file")" ]]; fi
  iteration=$((iteration+1))
  if [[ -n ${COLLECTOR_TEST_ARTIFACT_DIR:-} ]]; then
    mkdir -p "$COLLECTOR_TEST_ARTIFACT_DIR"
    cp "$prom" "$COLLECTOR_TEST_ARTIFACT_DIR/poll-$iteration.prom"
  fi
}
expect() { assertions=$((assertions+1)); grep -Eq "$1" "$prom" || { cat "$prom"; exit 1; }; printf 'PASS %s\n' "$2"; }
save() { jq "$1" <<< "$journal" > "$file"; }
save '.'; before=$(sha256sum "$file"); run
expect '^jarihana_deployment_phase\{.*\} 1$' 'fresh active journal'
expect '^jarihana_nginx_active_slot\{.*\} 1$' 'actual probe A'
expect '^jarihana_nginx_old_workers_drained\{.*\} 1$' 'old workers absent'
[[ "$before" == "$(sha256sum "$file")" ]]
echo B > "$T/route"; run; expect '^jarihana_nginx_active_slot\{.*\} 2$' 'actual probe B independent of intent'
echo 1 > "$T/route-bad"; run; expect '^jarihana_nginx_active_slot\{.*\} -1$' 'wrong actual upstream unknown'
echo 0 > "$T/route-bad"; echo 1 > "$T/ec2-bad"; run; expect '^jarihana_ec2_state\{.*slot="A".*\} -1$' 'wrong EC2 identity unknown'
echo 0 > "$T/ec2-bad"; echo pending > "$T/ec2-state"; run; expect '^jarihana_ec2_state\{.*slot="A".*\} 2$' 'pending EC2'
save '.heartbeat-=90'; run; expect '^jarihana_deployment_phase\{.*\} -1$' 'stale active phase unknown'
save '.heartbeat-=90|.pending={deadline:(.expires_at-1)}'; run; expect '^jarihana_deployment_lease_valid\{.*\} 1$' 'pending operation lease remains valid'
save '.phase="COMPLETE"|.created_at-=10000|.heartbeat-=9000|.expires_at-=8000'; run; expect '^jarihana_deployment_phase\{.*\} 6$' 'old terminal COMPLETE durable'
save '.phase="NEEDS_ATTENTION"|.heartbeat-=90'; run; expect '^jarihana_deployment_phase\{.*\} 9$' 'attention preserved'
save '.drain_ticket.generation="old/0"'; run; expect '^jarihana_nginx_old_workers_drained\{.*\} -1$' 'generation mismatch unknown'
save '.'; echo '10:100' > "$T/workers"; run; expect '^jarihana_nginx_old_workers_drained\{.*\} 0$' 'old worker remains'
save '.backend_only=true|.frontend_only=false'; run
expect '^jarihana_deployment_phase\{.*\} 1$' 'backend-only keeps A/B journal valid'
save '.frontend_only=false|.backend_only=false'; run
expect '^jarihana_deployment_source_success\{.*source="journal".*\} 1$' 'coupled release remains valid'
save '.target=.old'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'same-slot journal requires frontend-only scope'

frontend_phase=-1; frontend_lease=-1; frontend_ok=0; frontend_complete=-1
if [[ $ENVIRONMENT == prod ]]; then frontend_phase=4; frontend_lease=1; frontend_ok=1; frontend_complete=6; fi
save '.frontend_only=true|.backend_only=false|.target=.old|.phase="OBSERVING"|.drain_ticket=null'; run
expect "^jarihana_deployment_phase\\{.*\\} $frontend_phase$" 'frontend-only observation follows environment scope'
expect "^jarihana_deployment_lease_valid\\{.*\\} $frontend_lease$" 'frontend-only lease follows environment scope'
expect "^jarihana_deployment_source_success\\{.*source=\"journal\".*\\} $frontend_ok$" 'frontend-only journal source status'
expect '^jarihana_nginx_old_workers_drained\{.*\} -1$' 'frontend-only without reload ticket cannot assert drain success'
if [[ $ENVIRONMENT == prod ]]; then
  expect '^jarihana_deployment_info\{.*old="A",target="A".*\} 1$' 'frontend-only retains release identity'
else
  ! grep -q '^jarihana_deployment_info' "$prom"
fi
save '.frontend_only=true|.target=.old|.phase="COMPLETE"|.created_at-=10000|.heartbeat-=9000|.expires_at-=8000'; run
expect "^jarihana_deployment_phase\\{.*\\} $frontend_complete$" 'completed frontend-only release remains visible'
save '.frontend_only=true|.target=.old|.phase="OBSERVING"|.heartbeat-=90'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'frontend-only stale lease remains unknown'
save '.frontend_only=true'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'frontend-only cannot switch backend slots'
save '.frontend_only=true|.backend_only=true|.target=.old'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'conflicting release scopes rejected'
save '.frontend_only=true|.target=.old|.mode="bootstrap"'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'frontend-only bootstrap rejected'
save '.frontend_only="true"'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'malformed frontend scope rejected'
save '.frontend_only=null'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'explicit null frontend scope rejected'
save '.backend_only=null'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'explicit null backend scope rejected'
save '.backend_only="true"'; run
expect '^jarihana_deployment_phase\{.*\} -1$' 'malformed backend scope rejected'

rollback='.phase="ROLLING_BACK"|.http_recovered=true|.rollback_drain_ticket=(.drain_ticket|.workers=["20:200"])'
echo '20:200' > "$T/workers"; save "$rollback"; run
expect '^jarihana_nginx_old_workers_drained\{.*\} 0$' 'rollback waits for candidate workers despite drained forward ticket'
echo '30:300' > "$T/workers"; run
expect '^jarihana_nginx_old_workers_drained\{.*\} 1$' 'rollback workers absent'
echo '20:200' > "$T/workers"
save "$rollback|.phase=\"ROLLED_BACK\""; run
expect '^jarihana_nginx_old_workers_drained\{.*\} 0$' 'terminal rollback still observes rollback ticket'
save "$rollback|.phase=\"NEEDS_ATTENTION\""; run
expect '^jarihana_nginx_old_workers_drained\{.*\} 0$' 'attention after rollback keeps recovery ticket'
save "$rollback|del(.http_recovered)"; run
expect '^jarihana_nginx_old_workers_drained\{.*\} 0$' 'rollback phase selects rollback ticket independently'
save "$rollback|del(.rollback_drain_ticket)"; run
expect '^jarihana_nginx_old_workers_drained\{.*\} -1$' 'missing rollback ticket cannot fall back to forward success'
save "$rollback|.rollback_drain_ticket.workers=[]"; run
expect '^jarihana_nginx_old_workers_drained\{.*\} -1$' 'malformed rollback ticket remains unknown'
save "$rollback|.rollback_drain_ticket.generation=\"old/0\""; run
expect '^jarihana_nginx_old_workers_drained\{.*\} -1$' 'rollback generation mismatch remains unknown'
save '.backend_only=true'; run
expect '^jarihana_nginx_old_workers_drained\{.*\} 1$' 'backend-only forward drain remains valid'

printf 'malformed' > "$file"; run; expect '^jarihana_deployment_phase\{.*\} -1$' 'malformed journal unknown'
rm "$file"; run; expect '^jarihana_deployment_phase\{.*\} 0$' 'absent journal idle'
chmod 666 "$TEST_CONFIG"; run; expect '^jarihana_deployment_source_success\{.*source="config".*\} 0$' 'writable config rejected'
printf 'COLLECTOR_TESTS_PASSED=%s ENVIRONMENT=%s\n' "$assertions" "$ENVIRONMENT"
