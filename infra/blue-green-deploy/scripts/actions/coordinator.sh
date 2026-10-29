#!/usr/bin/env bash
set -euo pipefail
SCRIPT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_ROOT/common.sh"
source "$SCRIPT_ROOT/cloud.sh"
source "$SCRIPT_ROOT/nginx.sh"
source "$SCRIPT_ROOT/frontend.sh"

bg_owned_directory() {
  local directory=$1 uid mode component
  [[ $directory == /* && -d $directory && ! -L $directory ]] || bg_die 'Invalid coordinator directory'
  component=$directory
  while [[ $component != / ]]; do
    [[ ! -L $component ]] || bg_die 'Coordinator directory contains a symlink'
    read -r uid mode < <(stat -Lc '%u %a' "$component")
    [[ $uid == 0 || $uid == "$(id -u)" ]] || bg_die 'Coordinator directory ancestor belongs to another account'
    if (( (8#$mode & 0022)!=0 )); then
      [[ $uid == 0 ]] && (( (8#$mode & 01000)!=0 )) || bg_die 'Coordinator directory ancestor is writable'
    fi
    component=$(dirname "$component")
  done
  read -r uid mode < <(stat -Lc '%u %a' "$directory")
  [[ $uid == "$(id -u)" && $mode =~ ^[0-7]{3,4}$ ]] && (( (8#$mode & 0022)==0 )) || bg_die 'Coordinator directory ownership or mode differs'
}
bg_owned_file() {
  local path=$1 maximum=${2:-65536}
  local uid mode size
  bg_owned_directory "$(dirname "$path")"
  [[ -f $path && ! -L $path ]] || bg_die 'Invalid coordinator file'
  read -r uid mode size < <(stat -Lc '%u %a %s' "$path")
  [[ $uid == "$(id -u)" && $mode =~ ^[0-7]{3,4}$ && $size -le $maximum ]] && (( (8#$mode & 0077)==0 )) || bg_die 'Coordinator file ownership, mode or size differs'
}
bg_state_file() { bg_owned_file "$STATE_FILE"; }
bg_load() {
  bg_state_file
  STATE=$(cat "$STATE_FILE")
  jq -e --arg env "$ENVIRONMENT" --argjson run "$RUN_ID" --arg sha "$GITHUB_SHA" --arg control "$CONTROL_SHA" --arg topology "$(bg_topology_digest)" '
    .schema_version==2 and .environment==$env and .run_id==$run and .attempt==1 and .sha==$sha and .control_sha==$control and .topology_digest==$topology and (.revision|type)=="number"' <<<"$STATE" >/dev/null || bg_die 'Journal context differs; manual reconciliation required'
}
bg_guard() {
  if [[ ${BG_COORDINATOR_READ_ONLY:-false} == true ]]; then bg_live_readonly; else bg_live; fi
  bg_guard_local
}
bg_guard_local() {
  local latest
  bg_state_file
  latest=$(cat "$STATE_FILE")
  [[ $latest == "$STATE" ]] || bg_die 'Journal changed while executing this phase'
  jq -e --arg topology "$(bg_topology_digest)" '.topology_digest==$topology' <<<"$STATE" >/dev/null || bg_die 'Journal topology differs; manual reconciliation required'
  jq -e --argjson now "$(bg_now)" '.expires_at>$now and .heartbeat<=($now+5) and (if .pending==null then ($now-.heartbeat)<=60 else .pending.deadline>$now end)' <<<"$STATE" >/dev/null || bg_die 'Journal lease expired'
}
bg_save() {
  local next=$1
  bg_guard
  STATE=$(jq -c --argjson now "$(bg_now)" '.revision+=1 | .heartbeat=$now' <<<"$next")
  bg_atomic "$STATE_FILE" "$STATE"
}
bg_touch() { bg_save "$STATE"; }
# File completion may refresh only the heartbeat after its entry guard checked GitHub.
bg_touch_local() {
  bg_guard_local
  STATE=$(jq -c --argjson now "$(bg_now)" '.revision+=1 | .heartbeat=$now' <<<"$STATE")
  bg_atomic "$STATE_FILE" "$STATE"
}
bg_phase() { jq -e --arg phase "$1" '.phase==$phase' <<<"$STATE" >/dev/null || bg_die "Expected phase $1"; }
bg_pending() {
  jq -e --arg op "$1" --arg slot "$2" --argjson now "$(bg_now)" '.pending.operation==$op and .pending.slot==$slot and .pending.deadline>$now' <<<"$STATE" >/dev/null || bg_die 'Operation grant differs or expired'
}
bg_issue() {
  local op=$1 slot=$2 phase=$3 duration=${4:-600}
  bg_save "$(jq -c --arg op "$op" --arg slot "$slot" --arg phase "$phase" --arg id "$(bg_uuid)" --argjson issued "$(bg_now)" --argjson deadline "$(( $(bg_now)+duration ))" '.phase=$phase | .pending={id:$id,operation:$op,slot:$slot,issued_at:$issued,deadline:$deadline}' <<<"$STATE")"
}
bg_accept() {
  local result=$1 op=$2 slot=$3 key=$4 host previous
  bg_pending "$op" "$slot"; host=$(bg_host "$slot")
  jq -e --argjson state "$STATE" --argjson host "$host" --arg op "$op" --arg slot "$slot" '
    type=="object" and .operation==$op and .slot==$slot and .deployment_id==$state.deployment_id and .run_id==$state.run_id and
    .pending_id==$state.pending.id and .grant_id==$state.pending.id and
    .instance_id==$host.instance_id and .environment==$state.environment and .identity.hostId==$host.host_id and
    (.identity.bootId|type=="string" and test("^[0-9a-fA-F-]{36}$")) and
    (if $op=="prepare" and .authority==null then true else .authority.environment==$state.environment end) and
    ([.worker.inFlight,.worker.unresolved,.activity.httpInFlight,.activity.backgroundInFlight] | all(type=="number" and .>=0 and floor==.)) and
    (.activity.backgroundDrained|type)=="boolean" and
    (if $op=="stop" then .normal_exit==true and .running==false and
      (.shutdown_evidence.exit_code==0 or .shutdown_evidence.exit_code==143) and
      .shutdown_evidence.signal=="SIGTERM" and .shutdown_evidence.stop_cli_exit==0 and
      .shutdown_evidence.boot_id==.identity.bootId and
      .shutdown_evidence.oom_killed==false and .shutdown_evidence.restart_count_delta==0 and
      $state.target_status!=null and .authority.owner==$state.target_status.identity and
      .authority.deploymentId==$state.deployment_id and .authority.status=="ACTIVE" and .authority.phase=="COMPLETE"
     elif $op=="rollback" and $slot==$state.target then (.healthy|type)=="boolean" and .running==true
     else .healthy==true and .running==true end) and
    (if $slot==$state.target and $op!="bootstrap" then .image==$state.image else true end)' <<<"$result" >/dev/null || bg_die 'App receipt identity or health is invalid'
  previous=$(jq -c --arg key "$key" '.[$key]' <<<"$STATE")
  if [[ $previous != null ]]; then
    jq -e --argjson previous "$previous" '.identity==$previous.identity and .image==$previous.image' <<<"$result" >/dev/null || bg_die 'App boot or image changed between phases'
  fi
  bg_save "$(jq -c --arg key "$key" --argjson result "$result" '.[$key]=$result' <<<"$STATE")"
}
bg_paused() {
  jq -e '.worker.state=="PAUSED" and .worker.inFlight==0 and .worker.unresolved==0' <<<"$1" >/dev/null || bg_die 'Worker has not drained'
}
bg_unassigned() {
  bg_paused "$1"
  jq -e --arg dep "$(jq -r '.deployment_id' <<<"$STATE")" '.authority.deploymentId==$dep and .authority.status=="UNASSIGNED" and .authority.owner==null' <<<"$1" >/dev/null || bg_die 'Authority was not released'
}
bg_owner() {
  jq -e --arg dep "$(jq -r '.deployment_id' <<<"$STATE")" --arg phase "$2" '.authority.deploymentId==$dep and .authority.phase==$phase and .authority.status=="ACTIVE" and .authority.owner==.identity and .worker.state=="ACTIVE"' <<<"$1" >/dev/null || bg_die 'Worker owner or authority phase differs'
}
bg_scalar() {
  local raw
  raw=$(curl --noproxy '*' --fail --silent --show-error --max-time 3 --max-filesize 65536 --get --data-urlencode "query=$1" --data-urlencode timeout=2s "$(jq -r '.telemetry.url' <<<"$CONFIG")/api/v1/query") || return 1
  jq -er '. | select(.status=="success" and ((.warnings // [])|length)==0 and .data.resultType=="vector" and (.data.result|length)==1) | .data.result[0].value[1] | select(type=="string" and test("^[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$")) | tonumber | select(isfinite and .>=0)' <<<"$raw"
}
bg_metrics() {
  local labels selector up age requests errors duration
  labels="job=\"jarihana-backend\",environment=\"$ENVIRONMENT\",host_id=\"$(bg_host "$1" | jq -r '.host_id')\""; selector="{$labels}"
  up=$(bg_scalar "up$selector") && age=$(bg_scalar "time() - timestamp(up$selector)") || return 2
  jq -en --argjson age "$age" --argjson cfg "$CONFIG" '$age<=$cfg.telemetry.max_age_seconds' >/dev/null || return 2
  [[ $up == 1 ]] || return 1
  requests=$(bg_scalar "sum(increase(http_server_requests_seconds_count${selector}[2m]))") || return 2
  errors=$(bg_scalar "sum(increase(http_server_requests_seconds_count{$labels,status=~\"5..\"}[2m])) or vector(0)") || return 2
  duration=$(bg_scalar "sum(increase(http_server_requests_seconds_sum${selector}[2m]))") || return 2
  jq -en --argjson r "$requests" --argjson e "$errors" --argjson d "$duration" '$e<=$r and ($r>0 or $d==0)' >/dev/null || return 2
  jq -en --argjson r "$requests" --argjson e "$errors" --argjson d "$duration" --argjson cfg "$CONFIG" '$r==0 or ($e/$r<=$cfg.telemetry.max_error_ratio and $d/$r<=$cfg.telemetry.max_mean_seconds)' >/dev/null
}
bg_target_ready() { [[ $(bg_route) == "$(jq -r '.target' <<<"$STATE")" ]] && bg_metrics "$(jq -r '.target' <<<"$STATE")"; }
bg_plan() {
  local old target now previous_status=null previous_image=""
  [[ ${BG_FRONTEND_ONLY:-false} != true || ${BG_BACKEND_ONLY:-false} != true ]] || bg_die 'A release cannot be frontend-only and backend-only'
  [[ ${BG_BACKEND_ONLY:-false} != true || ( $ENVIRONMENT == prod && $BG_MODE == deploy ) ]] || bg_die 'Backend-only scope is production deploy only'
  if [[ -e $STATE_FILE ]]; then
    bg_state_file
    jq -e --arg env "$ENVIRONMENT" --arg control "$CONTROL_SHA" --arg topology "$(bg_topology_digest)" '.schema_version==2 and .environment==$env and .control_sha==$control and .topology_digest==$topology and (.phase=="COMPLETE" or .phase=="ROLLED_BACK")' "$STATE_FILE" >/dev/null || bg_die 'Previous deployment requires reconciliation'
  fi
  if fe_enabled; then
    [[ -f $STATE_FILE ]] || bg_die 'Production frontend release requires a completed backend bootstrap journal'
    fe_temp; fe_preflight; fe_pointer_read
    rm -rf -- "$FE_TEMP"
  fi
  old=$(bg_route) || bg_die 'Cannot establish current HTTP slot'
  if fe_enabled; then
    previous_status=$(jq -c --arg old "$old" '[.target_status,.old_status] | map(select(.slot==$old and .running==true and .healthy==true and .authority.status=="ACTIVE" and .authority.phase=="COMPLETE" and .authority.owner==.identity)) | if length==1 then .[0] else error("Current backend receipt is ambiguous") end' "$STATE_FILE")
    previous_image=$(jq -er '.image|select(test("^sha256:[a-f0-9]{64}$"))' <<<"$previous_status")
    if [[ ${BG_FRONTEND_ONLY:-false} == true ]]; then BG_IMAGE_DIGEST=$previous_image; fi
  fi
  target=A; [[ $old == A ]] && target=B
  [[ ${BG_FRONTEND_ONLY:-false} != true ]] || target=$old
  if [[ ${BG_FRONTEND_ONLY:-false} != true ]]; then
    [[ $(bg_ec2_state "$old") == running ]] || bg_die 'Current EC2 is not running'
  fi
  now=$(bg_now)
  STATE=$(jq -cn --arg env "$ENVIRONMENT" --arg dep "$(bg_uuid)" --argjson run "$RUN_ID" --arg sha "$GITHUB_SHA" --arg control "$CONTROL_SHA" --arg topology "$(bg_topology_digest)" --arg mode "$BG_MODE" --arg old "$old" --arg target "$target" --arg image "$BG_IMAGE_DIGEST" --argjson now "$now" '{schema_version:2,revision:0,environment:$env,deployment_id:$dep,run_id:$run,attempt:1,sha:$sha,control_sha:$control,topology_digest:$topology,mode:$mode,phase:"PREPARING",old:$old,target:$target,image:$image,created_at:$now,heartbeat:$now,expires_at:($now+7200),pending:null,old_status:null,target_status:null,drain_ticket:null,switched:false,sealed:false,http_recovered:false,worker_recovered:false,observation_failed:false,reason:null}')
  STATE=$(jq -c --arg previous "$previous_image" --argjson frontend_only "${BG_FRONTEND_ONLY:-false}" --argjson backend_only "${BG_BACKEND_ONLY:-false}" --argjson previous_status "$previous_status" '.previous_backend_image=$previous | .frontend_only=$frontend_only | .backend_only=$backend_only | .release_scope=(if $frontend_only then "frontend" elif $backend_only then "backend" else "both" end) | .previous_backend_status=$previous_status' <<<"$STATE")
  bg_atomic "$STATE_FILE" "$STATE"
  if fe_enabled; then
    bg_issue frontend-stage "$old" PREPARING 1500
    fe_stage
  fi
  if [[ ${BG_FRONTEND_ONLY:-false} == true ]]; then
    fe_enabled || bg_die 'Frontend-only mode is production deploy only'
    bg_issue frontend-publish "$old" SWITCHING 1500
  elif [[ $BG_MODE == bootstrap ]]; then
    [[ $(bg_ec2_state "$target") == stopped ]] || bg_die 'Bootstrap standby must be stopped'
    bg_issue bootstrap "$old" PREPARING
  else
    [[ $BG_MODE == deploy ]] || bg_die 'Invalid mode'
    bg_issue prepare "$target" PREPARING 1500
    bg_ec2_change start "$target" && bg_ec2_wait "$target" running || bg_die 'Standby start uncertain'
    bg_issue prepare "$target" PREPARING 1500
  fi
  bg_output digest "$BG_IMAGE_DIGEST"; bg_output old "$old"; bg_output target "$target"; bg_output deployment_id "$(jq -r '.deployment_id' <<<"$STATE")"
}
bg_grant_handoff() {
  local target deadline
  bg_phase PREPARING; target=$(jq -r '.target' <<<"$STATE")
  bg_accept "$APP_RESULT" prepare "$target" target_status; bg_paused "$APP_RESULT"
  bg_save "$(jq -c '.pending=null' <<<"$STATE")"
  deadline=$(( $(bg_now)+600 ))
  while ! { bg_direct "$target" && bg_metrics "$target"; }; do
    (( $(bg_now)<deadline )) || bg_die 'Candidate telemetry warmup timed out'
    bg_touch; sleep 5
  done
  bg_issue handoff "$(jq -r '.old' <<<"$STATE")" HANDOFF
}
bg_switch() {
  bg_phase HANDOFF
  bg_accept "$APP_RESULT" handoff "$(jq -r '.old' <<<"$STATE")" old_status; bg_unassigned "$APP_RESULT"
  if fe_enabled; then
    [[ $(jq -r .old_status.image <<<"$STATE") == "$(jq -r .previous_backend_image <<<"$STATE")" ]] || bg_die 'Actual backend image differs from the archived frontend pair'
  fi
  bg_save "$(jq -c '.phase="SWITCHING" | .pending=null' <<<"$STATE")"
  bg_switch_http "$(jq -r '.target' <<<"$STATE")" || bg_die 'HTTP switch failed; inspect actual route'
  bg_save "$(jq -c --argjson ticket "$TICKET" '.switched=true | .drain_ticket=$ticket' <<<"$STATE")"
  if fe_enabled; then
    bg_issue frontend-publish "$(jq -r .target <<<"$STATE")" SWITCHING 1500
    fe_publish
  fi
  bg_issue activate "$(jq -r '.target' <<<"$STATE")" SWITCHING
}
bg_grant_observe() {
  bg_phase SWITCHING
  if fe_enabled && fe_changed; then
    jq -e '.frontend.published==true and .frontend.finalized==false' <<<"$STATE" >/dev/null || bg_die 'Frontend must be published before observation'
  fi
  bg_accept "$APP_RESULT" activate "$(jq -r '.target' <<<"$STATE")" target_status; bg_owner "$APP_RESULT" OBSERVE
  bg_issue observe "$(jq -r '.target' <<<"$STATE")" OBSERVING 1800
}
bg_uptime() { local elapsed rest; read -r elapsed rest < /proc/uptime; printf '%s\n' "${elapsed%%.*}"; }
bg_observe() {
  local start last now elapsed failures=0 status jobs jobs_checked_at=-15 frontend_checked_at=-30
  local monotonic_start
  bg_phase OBSERVING
  if fe_enabled && fe_changed; then
    jq -e '.frontend.published==true' <<<"$STATE" >/dev/null || bg_die 'Frontend publication must precede observation'
    fe_observe_prepare
  fi
  start=$(bg_now); last=$start; monotonic_start=$(bg_uptime)
  bg_save "$(jq -c --argjson now "$start" '.http_observed_started_at=$now' <<<"$STATE")"
  while :; do
    bg_guard; now=$(bg_now); elapsed=$(( $(bg_uptime)-monotonic_start ))
    (( now>=last && now-start-elapsed<=5 && elapsed-(now-start)<=5 )) || bg_die 'Observation clock discontinuity'
    last=$now
    status=0; bg_target_ready || status=$?
    if (( status==2 )); then bg_die 'Observation telemetry is unknown'; fi
    if (( status==0 )); then failures=0; else failures=$((failures+1)); fi
    (( failures<3 )) || bg_die 'Three unhealthy observation samples'
    if [[ $(jq -r '.frontend_only // false' <<<"$STATE") != true ]] && (( elapsed-jobs_checked_at>=15 )); then
      jobs=$(bg_github "/repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100") || bg_die 'Cannot verify app observation job'
      jq -e '[.jobs[] | select(.name|contains("candidate-worker-observation")) | select(.conclusion!=null and .conclusion!="success")] | length==0' <<<"$jobs" >/dev/null || bg_die 'App observation failed'
      jobs_checked_at=$elapsed
    fi
    if fe_enabled && fe_changed && (( elapsed-frontend_checked_at>=30 )); then
      fe_observe_check
      frontend_checked_at=$elapsed
    fi
    bg_touch
    if (( now-start>=900 && elapsed>=900 && failures==0 )); then break; fi
    sleep 5
  done
  bg_save "$(jq -c --argjson now "$(bg_now)" '.http_observed_finished_at=$now' <<<"$STATE")"
  if fe_enabled && fe_changed; then rm -rf -- "$FE_TEMP"; fi
}
bg_seal() {
  APP_RESULT=${TARGET_RESULT:-${APP_RESULT:-}}
  local deadline
  bg_phase OBSERVING
  if fe_enabled && fe_changed; then
    jq -e '.frontend.published==true and .http_observed_started_at>=.frontend.published_at and
      (.frontend_only or .frontend.published_at>0)' <<<"$STATE" >/dev/null || bg_die 'Observation must follow frontend publication'
  fi
  bg_accept "$APP_RESULT" observe "$(jq -r '.target' <<<"$STATE")" target_status; bg_owner "$APP_RESULT" OBSERVE
  jq -e --argjson now "$(bg_now)" '.observation_failed==false and
    ([.http_observed_started_at,.http_observed_finished_at,.target_status.observed_started_at,.target_status.observed_finished_at] | all(type=="number" and floor==. and .>0 and .<=($now+5))) and
    .target_status.observed_started_at>=.pending.issued_at and
    (.http_observed_finished_at-.http_observed_started_at)>=900 and (.target_status.observed_finished_at-.target_status.observed_started_at)>=900' <<<"$STATE" >/dev/null || bg_die 'Both observation periods must finish'
  if fe_enabled && fe_changed; then
    jq -e '.target_status.observed_started_at>=.frontend.published_at' <<<"$STATE" >/dev/null || bg_die 'Worker observation started before frontend publication'
  fi
  deadline=$(( $(bg_now)+300 ))
  while ! bg_drained "$(jq -c '.drain_ticket' <<<"$STATE")"; do
    bg_target_ready || bg_die 'Target failed during drain'
    if (( $(bg_now)>=deadline )); then
      bg_save "$(jq -c '.cleanup_deferred=true | .phase="NEEDS_ATTENTION" | .reason="Previous HTTP connections did not drain; keep target serving and both EC2 instances running"' <<<"$STATE")"
      bg_output cleanup_deferred true
      return 0
    fi
    bg_touch; sleep 5
  done
  bg_target_ready || bg_die 'Target is not healthy before seal'
  if fe_enabled; then fe_finalize; fi
  bg_save "$(jq -c '.sealed=true | .phase="SEALED"' <<<"$STATE")"
  bg_issue complete "$(jq -r '.target' <<<"$STATE")" SEALED
  bg_output cleanup_deferred false
}
bg_grant_stop() {
  bg_phase SEALED
  bg_accept "$APP_RESULT" complete "$(jq -r '.target' <<<"$STATE")" target_status; bg_owner "$APP_RESULT" COMPLETE
  bg_issue stop "$(jq -r '.old' <<<"$STATE")" SEALED
}
bg_stop() {
  local old
  bg_phase SEALED; old=$(jq -r '.old' <<<"$STATE")
  bg_accept "$APP_RESULT" stop "$old" old_status; bg_paused "$APP_RESULT"
  jq -e '.activity.httpInFlight==0 and .activity.backgroundInFlight==0 and .activity.backgroundDrained==true' <<<"$APP_RESULT" >/dev/null || bg_die 'Old app activity remains'
  bg_target_ready || bg_die 'Target health unknown before EC2 stop'
  bg_ec2_change stop "$old" || bg_die 'Old EC2 stop uncertain'
  bg_save "$(jq -c '.pending=null' <<<"$STATE")"
  bg_ec2_wait "$old" stopped || bg_die 'Old EC2 stop uncertain'
  bg_save "$(jq -c '.phase="COMPLETE" | .pending=null' <<<"$STATE")"
}
bg_rollback_http() {
  jq -e '.frontend.finalized!=true and .switched and (.sealed|not) and (.http_recovered|not) and .cleanup_deferred!=true' <<<"$STATE" >/dev/null || bg_die 'Automatic rollback boundary closed'
  bg_switch_http "$(jq -r '.old' <<<"$STATE")" true || bg_die 'Safe old HTTP recovery could not be proven'
  bg_save "$(jq -c --argjson ticket "$TICKET" '.phase="ROLLING_BACK" | .http_recovered=true | .rollback_drain_ticket=$ticket' <<<"$STATE")"
  # Frontend recovery runs before the candidate worker job and may transfer an archive.
  local rollback_window=600
  if fe_enabled; then rollback_window=2400; fi
  bg_issue rollback "$(jq -r '.target' <<<"$STATE")" ROLLING_BACK "$rollback_window"
  bg_output rollback_ready true
}
bg_grant_rollback_old() {
  bg_phase ROLLING_BACK
  bg_accept "$APP_RESULT" rollback "$(jq -r '.target' <<<"$STATE")" target_status; bg_unassigned "$APP_RESULT"
  bg_issue rollback "$(jq -r '.old' <<<"$STATE")" ROLLING_BACK
}
bg_finish_rollback() {
  local deadline
  bg_phase ROLLING_BACK
  bg_accept "$APP_RESULT" rollback "$(jq -r '.old' <<<"$STATE")" old_status; bg_owner "$APP_RESULT" COMPLETE
  deadline=$(( $(bg_now)+300 ))
  while ! bg_drained "$(jq -c '.rollback_drain_ticket' <<<"$STATE")"; do
    (( $(bg_now)<deadline )) || bg_die 'Candidate HTTP generation did not drain'
    bg_touch; sleep 5
  done
  [[ $(bg_route) == "$(jq -r '.old' <<<"$STATE")" ]] || bg_die 'Old HTTP recovery lost'
  if fe_enabled; then
    jq -e '.frontend.recovered==true' <<<"$STATE" >/dev/null || bg_die 'Frontend recovery remains unproven'
  fi
  bg_save "$(jq -c '.phase="ROLLED_BACK" | .worker_recovered=true | .pending=null' <<<"$STATE")"
}
bg_frontend_only_publish() {
  bg_phase SWITCHING
  jq -e '.frontend_only==true and .old==.target' <<<"$STATE" >/dev/null || bg_die 'Not a frontend-only release'
  [[ $(bg_route) == "$(jq -r '.old' <<<"$STATE")" ]] || bg_die 'Active backend route changed'
  fe_publish
  bg_issue frontend-observe "$(jq -r '.old' <<<"$STATE")" OBSERVING 1800
}
bg_frontend_only_seal() {
  bg_phase OBSERVING
  jq -e --argjson now "$(bg_now)" '.frontend_only==true and .frontend.published==true and .observation_failed==false and
    .http_observed_started_at>=.frontend.published_at and
    (.http_observed_finished_at-.http_observed_started_at)>=900 and .http_observed_finished_at<=($now+5)' <<<"$STATE" >/dev/null || bg_die 'Frontend-only observation is incomplete'
  bg_target_ready || bg_die 'Current backend health is unknown'
  fe_finalize
  bg_save "$(jq -c '.sealed=true | .phase="COMPLETE" | .pending=null | .old_status=.previous_backend_status' <<<"$STATE")"
}
bg_frontend_recover() {
  jq -e '.frontend!=null and .frontend.finalized!=true and .sealed!=true and .cleanup_deferred!=true' <<<"$STATE" >/dev/null || bg_die 'Frontend recovery boundary closed'
  if [[ $(jq -r '.frontend_only' <<<"$STATE") == true ]]; then
    jq -e '.old==.target and (.pending.operation|startswith("frontend-"))' <<<"$STATE" >/dev/null || bg_die 'Frontend-only recovery grant differs'
    bg_issue frontend-recover "$(jq -r '.old' <<<"$STATE")" ROLLING_BACK 1800
  fi
  fe_recover
  if [[ $(jq -r '.frontend_only' <<<"$STATE") == true ]]; then
    [[ $(bg_route) == "$(jq -r '.old' <<<"$STATE")" ]] || bg_die 'Backend route changed during frontend-only recovery'
    bg_save "$(jq -c '.phase="ROLLED_BACK" | .pending=null | .old_status=.previous_backend_status | .http_recovered=true | .worker_recovered=true' <<<"$STATE")"
  fi
}
bg_finish_bootstrap() {
  bg_phase PREPARING
  [[ $(jq -r '.mode' <<<"$STATE") == bootstrap ]] || bg_die 'Not a bootstrap run'
  bg_accept "$APP_RESULT" bootstrap "$(jq -r '.old' <<<"$STATE")" old_status; bg_owner "$APP_RESULT" COMPLETE
  bg_save "$(jq -c '.phase="COMPLETE" | .pending=null' <<<"$STATE")"
}
bg_attention() {
  # Preserve unresolved intent. Recording uncertainty never grants another worker.
  local reason=$1 latest
  [[ -f $STATE_FILE ]] || return 0
  bg_state_file
  latest=$(cat "$STATE_FILE")
  jq -e --argjson run "$RUN_ID" '.schema_version==2 and .run_id==$run and .phase!="COMPLETE" and .phase!="ROLLED_BACK"' <<<"$latest" >/dev/null || return 0
  STATE=$(jq -c --arg reason "$reason" --argjson now "$(bg_now)" '.phase="NEEDS_ATTENTION" | .observation_failed=true | .reason=(.reason // $reason) | .heartbeat=$now | .revision+=1' <<<"$latest")
  bg_atomic "$STATE_FILE" "$STATE"
}
bg_watchdog() {
  local latest
  [[ -f $STATE_FILE ]] || return 0
  bg_state_file; latest=$(cat "$STATE_FILE")
  jq -e --argjson now "$(bg_now)" '.schema_version==2 and .phase!="COMPLETE" and .phase!="ROLLED_BACK" and (.expires_at<=$now or (if .pending==null then ($now-.heartbeat)>60 else .pending.deadline<=$now end))' <<<"$latest" >/dev/null || return 0
  RUN_ID=$(jq -r '.run_id' <<<"$latest"); bg_attention 'Coordinator heartbeat stale; inspect both hosts'
}
main() {
  local command=${1:-}
  if [[ $command == watchdog ]]; then
    ENVIRONMENT=${BG_ENVIRONMENT:?}
    [[ $ENVIRONMENT == dev || $ENVIRONMENT == prod ]] || bg_die 'Invalid watchdog environment'
    [[ $(id -un) == jarihana-coordinator ]] || bg_die 'Use the coordinator account'
    bg_config "/etc/jarihana-deploy/$ENVIRONMENT/coordinator.json"
    STATE_FILE="/var/lib/jarihana-deploy/$ENVIRONMENT/state.json"
    RUN_ID=0
  else
    bg_init coordinator
  fi
  BG_COORDINATOR_READ_ONLY=false
  [[ $command != observe ]] || BG_COORDINATOR_READ_ONLY=true
  umask 077
  bg_owned_directory "$(dirname "$STATE_FILE")"
  [[ ! -e $STATE_FILE.lock && ! -L $STATE_FILE.lock ]] || bg_owned_file "$STATE_FILE.lock"
  exec 9>"$STATE_FILE.lock"; flock -n 9 || bg_die 'Another coordinator phase holds the deployment lock'
  trap 'code=$?; if (( code!=0 )); then bg_attention "Coordinator phase failed; inspect preserved intent" || true; fi' EXIT
  if [[ $command != plan && $command != watchdog ]]; then bg_load; fi
  case "$command" in
    plan) bg_plan;; grant-handoff) bg_grant_handoff;; switch) bg_switch;; grant-observe) bg_grant_observe;;
    frontend-publish) bg_frontend_only_publish;; frontend-seal) bg_frontend_only_seal;; frontend-recover) bg_frontend_recover;;
    observe) bg_observe;; seal) bg_seal;; grant-stop) bg_grant_stop;; stop) bg_stop;;
    rollback-http) bg_rollback_http;; grant-rollback-old) bg_grant_rollback_old;; finish-rollback) bg_finish_rollback;;
    finish-bootstrap) bg_finish_bootstrap;; interrupt) bg_attention 'Workflow interrupted; inspect both hosts';;
    watchdog) bg_watchdog;; *) bg_die 'Unknown coordinator operation';;
  esac
  [[ -n ${STATE:-} ]] && bg_output result "$STATE"
  return 0
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
