#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/tests/actions/test-frontend.sh" --fixtures-only
source "$ROOT/infra/blue-green-deploy/scripts/actions/cloud.sh"
source "$ROOT/infra/blue-green-deploy/scripts/actions/nginx.sh"
eval "$(declare -f main | sed '1s/main/coordinator_main/')"
eval "$(declare -f curl | sed '1s/curl/public_curl/')"
source "$ROOT/infra/blue-green-deploy/scripts/actions/app.sh"
eval "$(declare -f main | sed -e '1s/main/app_main/' -e 's|/var/lib/jarihana-deploy/\$ENVIRONMENT/app-\$BG_SLOT|$CASE_DIR/app-$BG_SLOT|')"
source "$ROOT/infra/blue-green-deploy/scripts/actions/queue-guard.sh"
eval "$(declare -f main | sed '1s/main/guardian_main/')"
FILES=${1:-79}
OUTCOME=${2:-success}
SCOPE=${3:-both}
BASELINE=${4:-first}
PREUSED=${5:-0}
IO_SECONDS=${6:-0}
API_LIMIT=1000
bg_now() { cat "$CASE_DIR/clock"; }
bg_uptime() { bg_now; }
app_uptime() { bg_now; }
sleep() { local delta=${1%.*}; (( delta>0 )) || return 0; echo "$(( $(bg_now)+delta ))" >"$CASE_DIR/clock"; }
bg_atomic() { printf '%s\n' "$2" >"$1"; }
eval "$(declare -f bg_touch_local | sed '1s/bg_touch_local/actual_touch_local/')"
bg_touch_local() { actual_touch_local; if (( IO_SECONDS>0 )); then echo "$(( $(bg_now)+IO_SECONDS ))" >"$CASE_DIR/clock"; fi; }
bg_root_file() { :; }
bg_uuid() { local n; n=$(( $(cat "$CASE_DIR/uuid")+1 )); echo "$n" >"$CASE_DIR/uuid"; printf 'aaaaaaaa-aaaa-aaaa-aaaa-%012d\n' "$n"; }
bg_output() { if [[ $1 == result && ${ACTOR:-} == app ]]; then printf '%s\n' "$2" >"$CASE_DIR/receipt"; fi; }
timeout() { shift; "$@"; }
ssh() { cat "$STATE_FILE"; }
curl() { public_curl "$@"; }
api_event() {
  printf '%s\t%s\t%s\n' "$(bg_now)" "$LABEL" "$1" >>"$CASE_DIR/api.tsv"
  if (( API_LIMIT>0 && $(wc -l <"$CASE_DIR/api.tsv")>API_LIMIT )); then bg_die 'Simulated shared GitHub rate limit exhausted'; fi
}
run_response() {
  jq -cn --arg sha "$GITHUB_SHA" --arg repo "$REPO" '{id:123,run_attempt:1,head_sha:$sha,head_branch:"main",workflow_id:999,path:".github/workflows/backend-prod-deploy.yml",event:"push",repository:{id:1321030074,full_name:$repo},head_repository:{id:1321030074,full_name:$repo},status:"in_progress",conclusion:null}'
}
bg_github() {
  api_event "$1"
  local remaining high_water guardian_reads
  # Observation jobs run in parallel. Precharge guardian reads through the greatest virtual wall time seen.
  high_water=$(awk -F '\t' 'BEGIN{t=1000} $1>t{t=$1} END{print t}' "$CASE_DIR/api.tsv")
  guardian_reads=$((2*((high_water-1000+29)/30+1)))
  remaining=$((1000-PREUSED-$(wc -l <"$CASE_DIR/api.tsv")-guardian_reads))
  printf 'x-ratelimit-limit: 1000\nx-ratelimit-remaining: %s\nx-ratelimit-reset: 9999999999\nx-ratelimit-resource: core\n' "$remaining" >"$CASE_DIR/headers"
  if ! bg_api_budget "$CASE_DIR/headers"; then bg_die 'Simulated rate budget refused the phase'; fi
  case $1 in
    */workflows/*) echo '{"id":999,"path":".github/workflows/backend-prod-deploy.yml","state":"active"}';;
    */jobs*) echo '{"jobs":[{"name":"candidate-worker-observation","conclusion":null}]}';;
    *) run_response;;
  esac
}
bg_init() {
  # Identity, machine and protected-file checks are environment doubles. Preserve both startup HTTP reads.
  ENVIRONMENT=prod; BG_MODE=deploy; REPO=woowacourse-teams/2026-jarihana; BRANCH=main; WORKFLOW_ID=999
  RUN_ID=123; ATTEMPT=1; CONTROL_SHA=$(printf '%040d' 3)
  BG_READ_ONLY_VERIFIED_AT=0; BG_LIVE_CACHED_AT=0
  CONFIG=$(cat "$CASE_DIR/coordinator.json")
  [[ $1 != app ]] || CONFIG=$(cat "$CASE_DIR/app-$BG_SLOT.json")
  bg_github "/repos/$REPO/actions/workflows/backend-prod-deploy.yml" >/dev/null
  bg_live
}
bg_route() { cat "$CASE_DIR/route"; }
bg_metrics() { return 0; }
bg_direct() { return 0; }
bg_target_ready() { [[ $(bg_route) == "$(jq -r '.target' <<<"$STATE")" ]] && bg_metrics "$(jq -r '.target' <<<"$STATE")"; }
bg_capture() { printf '{"container_id":"nginx","generation":"same/0","workers":["42:100"]}\n'; }
bg_drained() { return 0; }
bg_await_route() { echo "$1" >"$CASE_DIR/route"; }
aws() {
  local op=$2 slot=A instance=i-aaaaaaaaaaaaaaaaa
  [[ $* != *i-bbbbbbbbbbbbbbbbb* ]] || { slot=B; instance=i-bbbbbbbbbbbbbbbbb; }
  case $op in
    describe-instances)
      jq -cn --arg id "$instance" --arg state "$(cat "$CASE_DIR/ec2-$slot")" --arg ip "$(bg_host "$slot" | jq -r '.upstream|split(":")[0]')" '{Reservations:[{OwnerId:"000000000000",Instances:[{InstanceId:$id,VpcId:"vpc-00000000000000000",PrivateIpAddress:$ip,RootDeviceType:"ebs",State:{Name:$state}}]}]}' ;;
    start-instances) echo running >"$CASE_DIR/ec2-$slot"; jq -cn --arg id "$instance" '{StartingInstances:[{InstanceId:$id,PreviousState:{Name:"stopped"},CurrentState:{Name:"running"}}]}' ;;
    stop-instances) echo stopped >"$CASE_DIR/ec2-$slot"; jq -cn --arg id "$instance" '{StoppingInstances:[{InstanceId:$id,PreviousState:{Name:"running"},CurrentState:{Name:"stopped"}}]}' ;;
    *) return 1;;
  esac
}
docker() {
  case $1 in
    exec) return 0;;
    ps) return 0;;
    compose) return 0;;
    inspect) cat "$CASE_DIR/docker-$BG_SLOT";;
    stop)
      jq --arg finished "$(date -u -d "@$(bg_now)" '+%Y-%m-%dT%H:%M:%SZ')" '.State.Running=false|.State.ExitCode=143|.State.FinishedAt=$finished' "$CASE_DIR/docker-$BG_SLOT" >"$CASE_DIR/docker-$BG_SLOT.next"
      mv "$CASE_DIR/docker-$BG_SLOT.next" "$CASE_DIR/docker-$BG_SLOT";;
    *) return 1;;
  esac
}
app_http() {
  local method=$1 path=$2 payload=${3:-} op next output
  if [[ $method == GET ]]; then
    if [[ $path == /actuator/health/readiness ]]; then echo '{"status":"UP"}'; return; fi
    jq --slurpfile a "$CASE_DIR/authority.json" '.authority=$a[0]' "$CASE_DIR/api-$BG_SLOT"; return
  fi
  op=${path##*/}; next=$(jq -r '.nextPhase // ""' "$payload")
  jq -e --slurpfile a "$CASE_DIR/authority.json" '.epoch==$a[0].epoch and .expectedRevision==$a[0].revision and .expectedPhase==$a[0].phase' "$payload" >/dev/null || return 1
  output=$(jq -c --arg op "$op" --arg next "$next" --arg dep "$DEPLOYMENT_ID" --argjson identity "$(jq .identity "$CASE_DIR/api-$BG_SLOT")" '
    .revision+=1 |
    if $op=="begin" then .epoch+=1|.deploymentId=$dep|.phase="PREPARE"
    elif $op=="phase" then .phase=$next
    elif $op=="pause" then .status="DRAINING"|.authorityRevision+=1
    elif $op=="release" then .status="UNASSIGNED"|.owner=null|.authorityRevision+=1
    elif $op=="activate" then .status="ACTIVE"|.owner=$identity|.authorityRevision+=1
    else error("unexpected API command") end' "$CASE_DIR/authority.json")
  printf '%s\n' "$output" >"$CASE_DIR/authority.json"
  if [[ $op == pause || $op == activate ]]; then
    local worker=PAUSED; [[ $op != activate ]] || worker=ACTIVE
    jq --arg worker "$worker" '.worker.state=$worker' "$CASE_DIR/api-$BG_SLOT" >"$CASE_DIR/api-$BG_SLOT.next"
    mv "$CASE_DIR/api-$BG_SLOT.next" "$CASE_DIR/api-$BG_SLOT"
  fi
  jq -cn --argjson a "$output" '{success:true,authority:$a}'
}
setup audit
echo 0 >"$CASE_DIR/uuid"; : >"$CASE_DIR/api.tsv"
echo A >"$CASE_DIR/route"; echo running >"$CASE_DIR/ec2-A"; echo stopped >"$CASE_DIR/ec2-B"
REPO=woowacourse-teams/2026-jarihana
WORKFLOW_ID=999; BRANCH=main; BG_LIVE_CACHED_AT=0
export GITHUB_REPOSITORY=$REPO GITHUB_RUN_ID=123 GITHUB_RUN_ATTEMPT=1 GH_TOKEN=not-a-real-token
export GITHUB_SHA
export RDS_URL=db.internal
echo abcdefghijklmnopqrstuvwxyz1234567890 >"$CASE_DIR/token"
jq --arg directory "$CASE_DIR/nginx" '.topology.environment="prod"|.topology.a.host_id="prod-a"|.topology.b.host_id="prod-b"|.nginx.directory=$directory' "$ROOT/infra/blue-green-deploy/controller/full-coordinator.example.json" >"$CASE_DIR/coordinator.json"
mkdir -m700 "$CASE_DIR/nginx"; echo initial >"$CASE_DIR/nginx/current.conf"; chmod 600 "$CASE_DIR/nginx/current.conf"
for slot in A B; do
  jq --slurpfile c "$CASE_DIR/coordinator.json" --arg token "$CASE_DIR/token" --arg compose "$ROOT/infra/blue-green-deploy/controller/app-compose.yml" '.topology=$c[0].topology|.coordinator_address="10.0.0.5"|.journal_key="/etc/jarihana-deploy/prod/grant-key"|.known_hosts="/etc/jarihana-deploy/prod/known-hosts"|.worker_token_file=$token|.compose_file=$compose' "$ROOT/infra/blue-green-deploy/controller/full-app-$slot.example.json" >"$CASE_DIR/app-$slot.json"
  digest=$OLD_DIGEST; worker=ACTIVE; boot=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
  [[ $slot != B ]] || { digest=$BG_IMAGE_DIGEST; worker=PAUSED; boot=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb; }
  jq -cn --arg image "$digest" --arg slot "${slot,,}" --arg boot "$boot" --arg worker "$worker" '{version:$image,environment:"prod",identity:{hostId:("prod-"+$slot),bootId:$boot},worker:{state:$worker,inFlight:0,unresolved:0},activity:{httpInFlight:0,backgroundInFlight:0,backgroundDrained:true}}' >"$CASE_DIR/api-$slot"
  jq -cn --arg slot "${slot,,}" --arg digest "$digest" --arg token "$(cat "$CASE_DIR/token")" '{Id:("container-"+$slot),Image:"sha256:image",RestartCount:0,State:{Running:true,Paused:false,Restarting:false,Dead:false,OOMKilled:false,ExitCode:0,StartedAt:"1970-01-01T00:00:01Z",FinishedAt:"0001-01-01T00:00:00Z"},HostConfig:{AutoRemove:false,RestartPolicy:{Name:"no"},PortBindings:{"8081/tcp":[{HostIp:"127.0.0.1",HostPort:"8081"}]}},Config:{Image:("ghcr.io/woowacourse-teams/jarihana-backend@"+$digest),Env:["APP_VERSION="+$digest,"DB_URL=jdbc:postgresql://db.internal:5432/jarihana_prod?sslmode=require","SPRING_PROFILES_ACTIVE=prod","PUSH_WORKER_CONTROL_ENABLED=true","PUSH_WORKER_START_PAUSED=true","PUSH_WORKER_HOST_ID=prod-"+$slot,"PUSH_WORKER_ENVIRONMENT=prod","WORKER_CONTROL_TOKEN="+$token]}}' >"$CASE_DIR/docker-$slot"
done
jq -cn --argjson identity "$(jq .identity "$CASE_DIR/api-A")" '{environment:"prod",deploymentId:"11111111-1111-1111-1111-111111111111",epoch:4,phase:"COMPLETE",revision:10,authorityRevision:7,owner:$identity,status:"ACTIVE"}' >"$CASE_DIR/authority.json"
CONFIG=$(cat "$CASE_DIR/coordinator.json")
old_status=$(jq -c --slurpfile a "$CASE_DIR/authority.json" --arg image "$OLD_DIGEST" '.authority=$a[0]|.slot="A"|.image=$image|.running=true|.healthy=true' "$CASE_DIR/api-A")
STATE=$(jq -c --argjson status "$old_status" --arg topology "$(bg_topology_digest)" '.phase="COMPLETE"|.old_status=$status|.topology_digest=$topology' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
for ((i=5;i<FILES;i++)); do echo "old $i" >"$CASE_DIR/s3/$FE_LIVE/assets/file-$i.txt"; echo "new $i" >"$BG_FRONTEND_DIST/assets/file-$i.txt"; done
LABEL=seed
BG_API_MIN_REMAINING=10
if [[ $BASELINE == existing ]]; then
  fe_temp; fe_pointer_read; fe_capture_baseline; rm -rf "$FE_TEMP"
  : >"$CASE_DIR/api.tsv"
fi
BG_FRONTEND_ONLY=false; BG_BACKEND_ONLY=false
[[ $SCOPE != frontend ]] || BG_FRONTEND_ONLY=true
[[ $SCOPE != backend ]] || BG_BACKEND_ONLY=true
step_coordinator() {
  LABEL="coordinator:$1"; ACTOR=coordinator
  ( coordinator_main "$1" )
  STATE=$(cat "$STATE_FILE")
}
step_app() {
  LABEL="app:$1"; ACTOR=app
  (
    BG_SLOT=$2
    mkdir -p "$CASE_DIR/app-$BG_SLOT"
    app_main "$1"
  )
  APP_RESULT=$(cat "$CASE_DIR/receipt")
}
if (( PREUSED>100 )); then
  if ( LABEL=coordinator:plan; ACTOR=coordinator; coordinator_main plan ) >"$CASE_DIR/denied.log" 2>&1; then echo 'Expected plan budget rejection' >&2; exit 1; fi
  grep -q 'GitHub API budget' "$CASE_DIR/denied.log"
  [[ ! -e $CASE_DIR/writes ]]
  [[ $(cat "$STATE_FILE") == "$STATE" ]]
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
  echo 'PASS api-budget admission rejects a depleted hour before S3 writes'
  exit 0
fi
step_coordinator plan
if [[ $SCOPE == frontend ]]; then
  step_coordinator frontend-publish
else
  step_app prepare B
  step_coordinator grant-handoff
  step_app handoff A
  step_coordinator switch
  step_app activate B
  step_coordinator grant-observe
fi
observation_start=$(bg_now)
if [[ $OUTCOME == budget-rollback ]]; then
  PREUSED=500
  if ( LABEL=app:observe-denied; ACTOR=app; BG_SLOT=B; app_main observe ) >"$CASE_DIR/pressure.log" 2>&1; then echo 'Expected mid-run budget rejection' >&2; exit 1; fi
  grep -q 'GitHub API budget' "$CASE_DIR/pressure.log"
else
  if [[ $SCOPE != frontend ]]; then
    step_app observe B
    TARGET_RESULT=$APP_RESULT
    echo "$observation_start" >"$CASE_DIR/clock"
  fi
  step_coordinator observe
fi
if [[ $OUTCOME == success ]]; then
  if [[ $SCOPE == frontend ]]; then step_coordinator frontend-seal
  else
    step_coordinator seal
    step_app complete B
    step_coordinator grant-stop
    step_app stop A
    step_coordinator stop
  fi
  jq -e '.phase=="COMPLETE" and .frontend.finalized==true' "$STATE_FILE" >/dev/null
else
  if [[ $OUTCOME == rollback ]]; then
    TARGET_RESULT=$(jq '.healthy=false' <<<"$TARGET_RESULT")
    LABEL=coordinator:seal-failed; ACTOR=coordinator
    if ( coordinator_main seal ) >"$CASE_DIR/failure.log" 2>&1; then echo 'Expected unhealthy app receipt rejection' >&2; exit 1; fi
    grep -q 'receipt identity or health' "$CASE_DIR/failure.log"
    STATE=$(cat "$STATE_FILE")
  fi
  if [[ $OUTCOME == rollback-final ]]; then
    # Public validation fails late in seal, after the final candidate download. Then execute the actual recovery chain.
    BAD_PUBLIC=sw.js
    failing_phase=seal; [[ $SCOPE != frontend ]] || failing_phase=frontend-seal
    LABEL="coordinator:$failing_phase-failed"; ACTOR=coordinator
    if ( coordinator_main "$failing_phase" ) >"$CASE_DIR/failure.log" 2>&1; then echo 'Expected final public check failure' >&2; exit 1; fi
    grep -q 'Frontend public content differs' "$CASE_DIR/failure.log"
    STATE=$(cat "$STATE_FILE")
    jq -e '.phase=="NEEDS_ATTENTION" and .frontend.finalized==false' "$STATE_FILE" >/dev/null
    unset BAD_PUBLIC
  fi
  if [[ $SCOPE == frontend ]]; then step_coordinator frontend-recover
  else
    step_coordinator rollback-http
    step_coordinator frontend-recover
    step_app rollback B
    step_coordinator grant-rollback-old
    step_app rollback A
    step_coordinator finish-rollback
  fi
  jq -e '.phase=="ROLLED_BACK" and .frontend.recovered==true' "$STATE_FILE" >/dev/null
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
fi
finish=$(bg_now)
# Run the real guardian loop on an independent virtual clock over the same interval as deployment jobs.
(
  LABEL=guardian
  echo 1000 >"$CASE_DIR/guardian-clock"
  q_now() { cat "$CASE_DIR/guardian-clock"; }
  sleep() { echo "$(( $(q_now)+$1 ))" >"$CASE_DIR/guardian-clock"; }
  q_request() {
    api_event "guardian:$2"
    if [[ -z $2 ]]; then run_response; return; fi
    local status=in_progress
    (( $(q_now)<finish )) || status=completed
    jq -cn --arg sha "$GITHUB_SHA" --arg status "$status" '{total_count:1,jobs:[{id:77,run_id:123,head_sha:$sha,name:"blue-green / deployment-result",status:$status,labels:["ubuntu-latest"]}]}'
  }
  guardian_main
)
requests=$(wc -l <"$CASE_DIR/api.tsv")
(( requests+PREUSED<1000 )) || { echo 'Whole deployment exceeded the repository budget' >&2; exit 1; }
printf 'PASS deployment-api-budget files=%s scope=%s baseline=%s outcome=%s io_seconds_per_file=%s simulated_seconds=%s requests=%s\n' "$FILES" "$SCOPE" "$BASELINE" "$OUTCOME" "$IO_SECONDS" "$((finish-1000))" "$requests"
awk -F '\t' '{n[$2]++} END{for (s in n) printf "%s %d\n",s,n[s]}' "$CASE_DIR/api.tsv" | sort
if [[ -n ${BG_API_EVIDENCE_DIR:-} ]]; then cp "$CASE_DIR/api.tsv" "$BG_API_EVIDENCE_DIR/$FILES-$SCOPE-$BASELINE-$OUTCOME-io$IO_SECONDS.tsv"; fi
