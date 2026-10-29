#!/usr/bin/env bash
# Behavioral tests: execute the production Bash functions against a stateful API/Docker double.
set -Eeuo pipefail
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/app.sh"

fixture() {
  APP_DIR=$(mktemp -d); trap 'rm -rf "$APP_DIR"' EXIT
  ENVIRONMENT=dev BG_SLOT=A RUN_ID=123 HOST_ID=dev-a INSTANCE_ID=i-aaaaaaaaaaaaaaaaa
  BG_DEV_AUTO_ENABLED=false
  DEPLOYMENT_ID=11111111-1111-4111-8111-111111111111 GRANT_ID=22222222-2222-4222-8222-222222222222
  BOOT_ID=33333333-3333-4333-8333-333333333333
  BG_IMAGE_DIGEST=sha256:$(printf 'a%.0s' {1..64})
  export WORKER_CONTROL_TOKEN=abcdefghijklmnopqrstuvwxyz1234567890
  IMAGE_REPOSITORY=ghcr.io/example/backend RDS_URL=db.internal MANAGEMENT_PORT=8081 CONTAINER=backend
  INTENT_FILE=$APP_DIR/intent.json STOP_FILE=$APP_DIR/stop.json
  GRANT_OPERATION=handoff OPERATION=handoff APP_DEADLINE=5000
  CONFIG='{"topology":{"a":{"host_id":"dev-a"},"b":{"host_id":"dev-b"}}}'
  printf '1000\n' > "$APP_DIR/clock"
  printf '0\n' > "$APP_DIR/monotonic"
  printf '0\n' > "$APP_DIR/live"
  jq -cn --arg id "$GRANT_ID" --arg dep "$DEPLOYMENT_ID" '{deployment_id:$dep,target:"B",pending:{id:$id,deadline:5000}}' > "$APP_DIR/grant"
  jq -cn --arg version "$BG_IMAGE_DIGEST" --arg boot "$BOOT_ID" --arg dep "$DEPLOYMENT_ID" '
    {version:$version,environment:"dev",identity:{hostId:"dev-a",bootId:$boot},
    worker:{state:"ACTIVE",inFlight:0,unresolved:0},activity:{httpInFlight:0,backgroundInFlight:0,backgroundDrained:true},
    authority:{environment:"dev",deploymentId:$dep,epoch:4,phase:"COMPLETE",revision:10,authorityRevision:7,
    owner:{hostId:"dev-a",bootId:$boot},status:"ACTIVE"}}' > "$APP_DIR/api"
  printf '{"status":"UP"}\n' > "$APP_DIR/health"
  : > "$APP_DIR/posts"
  bg_now() { cat "$APP_DIR/clock"; }
  app_uptime() { cat "$APP_DIR/monotonic"; }
  bg_uuid() { printf '44444444-4444-4444-8444-444444444444\n'; }
  bg_live() { printf '%s\n' "$(( $(cat "$APP_DIR/live")+1 ))" > "$APP_DIR/live"; }
  bg_grant() { STATE=$(cat "$APP_DIR/grant"); bg_live; }
  bg_atomic() { printf '%s\n' "$2" > "$1"; }
  date() { if command -v gdate >/dev/null; then command gdate "$@"; else command date "$@"; fi; }
  sleep() {
    printf '%s\n' "$(( $(cat "$APP_DIR/clock")+$1 ))" > "$APP_DIR/clock"
    printf '%s\n' "$(( $(cat "$APP_DIR/monotonic")+$1 ))" > "$APP_DIR/monotonic"
    command sleep 0.001
  }
  app_http() {
    local method=$1 path=$2 payload=${3:-} operation state next output
    if [[ "$method" == GET ]]; then
      if [[ "$path" == /actuator/workercontrol ]]; then cat "$APP_DIR/api"; else cat "$APP_DIR/health"; fi
      return
    fi
    operation=${path##*/}; state=$(cat "$APP_DIR/api")
    jq -e --argjson current "$state" '
      .epoch==$current.authority.epoch and .expectedRevision==$current.authority.revision
      and .expectedPhase==$current.authority.phase and .targetHostId==$current.identity.hostId
      and .targetBootId==$current.identity.bootId and (.deadline|type=="string")' "$payload" >/dev/null || return 1
    cat "$payload" >> "$APP_DIR/posts"; printf '\n' >> "$APP_DIR/posts"
    next=$(jq -r '.nextPhase // ""' "$payload")
    output=$(jq -c --arg op "$operation" --arg next "$next" --arg dep "$DEPLOYMENT_ID" '
      .authority.revision+=1 |
      if $op=="begin" then .authority.epoch+=1|.authority.deploymentId=$dep|.authority.phase="PREPARE"
      elif $op=="phase" then .authority.phase=$next
      elif $op=="pause" then .authority.status="DRAINING"|.authority.authorityRevision+=1|.worker.state="PAUSED"
      elif $op=="release" then .authority.status="UNASSIGNED"|.authority.owner=null|.authority.authorityRevision+=1
      elif $op=="activate" then .authority.status="ACTIVE"|.authority.owner=.identity|.authority.authorityRevision+=1|.worker.state="ACTIVE"
      else error("unsupported API command") end' <<< "$state")
    printf '%s\n' "$output" > "$APP_DIR/api"
    [[ ! -f "$APP_DIR/response-loss" ]] || return 1
    if [[ -f "$APP_DIR/race-after" ]]; then
      jq '.authority.authorityRevision+=1' "$APP_DIR/api" > "$APP_DIR/changed"
      mv "$APP_DIR/changed" "$APP_DIR/api"
    fi
    jq -c '{success:true,authority:.authority}' <<< "$output"
  }
  app_read
}
change() { jq "$1" "$APP_DIR/api" > "$APP_DIR/new"; mv "$APP_DIR/new" "$APP_DIR/api"; }
reject() {
  local before after
  before=$(wc -l < "$APP_DIR/posts")
  if ( "$@" ) > "$APP_DIR/rejected.log" 2>&1; then printf 'Expected rejection: %s\n' "$*" >&2; exit 1; fi
  after=$(wc -l < "$APP_DIR/posts")
  [[ "$before" == "$after" ]] || { printf 'Rejected action sent a POST\n' >&2; exit 1; }
}

case_handoff() {
  app_run
  jq -e '.authority|.phase=="HANDOFF" and .status=="UNASSIGNED" and .owner==null and .revision==14 and .authorityRevision==9 and .epoch==5' "$APP_DIR/api" >/dev/null
  jq -e '.resolved and .payload.expectedRevision==13 and .before.authorityRevision==8 and .after.authorityRevision==9' "$INTENT_FILE" >/dev/null
  (( $(wc -l < "$APP_DIR/posts") == 4 ))
  (( $(cat "$APP_DIR/live")>=12 ))
}
case_activation_and_completion() {
  change '.authority.phase="HANDOFF"|.authority.status="UNASSIGNED"|.authority.owner=null|.worker.state="PAUSED"'
  app_read; OPERATION=activate; app_run
  jq -e '.authority.phase=="OBSERVE" and .authority.owner==.identity and .worker.state=="ACTIVE" and .authority.revision==12 and .authority.authorityRevision==8' "$APP_DIR/api" >/dev/null
  OPERATION=complete; app_run
  jq -e '.authority.phase=="COMPLETE" and .authority.revision==13 and .authority.authorityRevision==8' "$APP_DIR/api" >/dev/null
}
case_response_loss() {
  touch "$APP_DIR/response-loss"
  if (app_command begin) > "$APP_DIR/failure" 2>&1; then exit 1; fi
  (( $(wc -l < "$APP_DIR/posts") == 1 ))
  jq -e '.resolved==false and .payload.expectedRevision==10' "$INTENT_FILE" >/dev/null
  app_read; reject app_command begin
}
case_cas_race_before() {
  change '.authority.authorityRevision+=1'
  reject app_command begin
}
case_cas_race_after() {
  touch "$APP_DIR/race-after"
  if (app_command begin) > "$APP_DIR/failure" 2>&1; then exit 1; fi
  (( $(wc -l < "$APP_DIR/posts") == 1 ))
  jq -e '.resolved==false' "$INTENT_FILE" >/dev/null
  reject app_command begin
}
case_grant_and_deadline() {
  jq '.pending.id="revoked"' "$APP_DIR/grant" > "$APP_DIR/new"; mv "$APP_DIR/new" "$APP_DIR/grant"
  reject app_command begin
  jq --arg id "$GRANT_ID" '.pending.id=$id' "$APP_DIR/grant" > "$APP_DIR/new"; mv "$APP_DIR/new" "$APP_DIR/grant"
  printf '5000\n' > "$APP_DIR/clock"
  reject app_command begin
}
case_boot_change() {
  change '.identity.bootId="55555555-5555-4555-8555-555555555555"'
  reject app_read
}
case_initial_idle_snapshot() {
  change '.authority.deploymentId=null|.authority.phase="IDLE"|.authority.status="UNASSIGNED"|.authority.owner=null|.worker.state="PAUSED"'
  app_read
  OPERATION=bootstrap; app_run
  jq -e '.authority.phase=="COMPLETE" and .authority.status=="ACTIVE" and .authority.owner==.identity' "$APP_DIR/api" >/dev/null
}
case_bad_counter() { change '.worker.inFlight=-1'; reject app_read; }
case_wrong_environment() { change '.environment="prod"'; reject app_read; }
case_no_release_with_work() {
  change '.authority.phase="HANDOFF"|.authority.status="DRAINING"|.worker.state="PAUSED"|.worker.inFlight=1'
  app_read; reject app_command release
}
case_no_activation_with_owner() { change '.authority.phase="HANDOFF"'; app_read; reject app_command activate; }
case_rollback_target() {
  change '.authority.phase="OBSERVE"'; app_read
  OPERATION=rollback
  jq '.target="A"' "$APP_DIR/grant" > "$APP_DIR/new"; mv "$APP_DIR/new" "$APP_DIR/grant"
  app_check; app_run
  jq -e '.authority.phase=="HANDOFF" and .authority.status=="UNASSIGNED" and .authority.owner==null and .worker.state=="PAUSED"' "$APP_DIR/api" >/dev/null
  (( $(wc -l < "$APP_DIR/posts") == 3 ))
}
case_rollback_unhealthy_target() {
  printf '{"status":"DOWN"}\n' > "$APP_DIR/health"
  case_rollback_target
  [[ $(jq -r '.healthy' <<< "$SNAPSHOT") == false ]]
}
case_rollback_wrong_owner() {
  change '.authority.phase="OBSERVE"|.authority.owner={hostId:"dev-b",bootId:"55555555-5555-4555-8555-555555555555"}'
  printf '{"status":"DOWN"}\n' > "$APP_DIR/health"; app_read
  OPERATION=rollback
  jq '.target="A"' "$APP_DIR/grant" > "$APP_DIR/new"; mv "$APP_DIR/new" "$APP_DIR/grant"
  app_check; reject app_run
}
case_handoff_unhealthy() {
  printf '{"status":"DOWN"}\n' > "$APP_DIR/health"; app_read
  OPERATION=handoff; reject app_run
}
case_activation_unhealthy() {
  change '.authority.phase="HANDOFF"|.authority.status="UNASSIGNED"|.authority.owner=null|.worker.state="PAUSED"'
  printf '{"status":"DOWN"}\n' > "$APP_DIR/health"; app_read
  OPERATION=activate; reject app_run
}
case_rollback_old() {
  change '.authority.phase="HANDOFF"|.authority.status="UNASSIGNED"|.authority.owner=null|.worker.state="PAUSED"'; app_read
  OPERATION=rollback; app_run
  jq -e '.authority.phase=="COMPLETE" and .authority.status=="ACTIVE" and .authority.owner==.identity' "$APP_DIR/api" >/dev/null
  (( $(wc -l < "$APP_DIR/posts") == 3 ))
}
case_rollback_already_released() {
  change '.authority.phase="HANDOFF"|.authority.status="UNASSIGNED"|.authority.owner=null|.worker.state="PAUSED"'; app_read
  OPERATION=rollback
  jq '.target="A"' "$APP_DIR/grant" > "$APP_DIR/new"; mv "$APP_DIR/new" "$APP_DIR/grant"
  app_check; app_run
  (( $(wc -l < "$APP_DIR/posts") == 0 ))
}
case_observation() {
  change '.authority.phase="OBSERVE"'; app_read
  # Advance both real-time sources in the test double; the implementation must poll for >=900s.
  sleep() {
    printf '%s\n' "$(( $(cat "$APP_DIR/clock")+300 ))" > "$APP_DIR/clock"
    printf '%s\n' "$(( $(cat "$APP_DIR/monotonic")+300 ))" > "$APP_DIR/monotonic"
  }
  app_observe
  (( OBSERVED_FINISHED_AT-OBSERVED_STARTED_AT>=900 ))
  (( $(cat "$APP_DIR/live")>=6 ))
}
case_observation_clock_jump() {
  change '.authority.phase="OBSERVE"'; app_read
  sleep() { printf '2000\n' > "$APP_DIR/clock"; printf '5\n' > "$APP_DIR/monotonic"; }
  reject app_observe
}
case_observation_readiness() {
  change '.authority.phase="OBSERVE"'; app_read
  printf '{"status":"DOWN"}\n' > "$APP_DIR/health"
  reject app_observe
}
case_command_rechecks_cached_parent() {
  bg_grant() { STATE=$(cat "$APP_DIR/grant"); }
  bg_live() { bg_die 'Cancelled before worker mutation'; }
  reject app_command begin
  [[ ! -s "$APP_DIR/posts" ]]
  jq -e '.resolved==false' "$INTENT_FILE" >/dev/null
}
case_shutdown_rechecks_cached_parent() {
  docker_fixture
  bg_grant() { STATE=$(cat "$APP_DIR/grant"); }
  bg_live() { bg_die 'Cancelled before SIGTERM'; }
  reject app_stop_container
  [[ ! -f "$APP_DIR/docker-command" ]]
}
case_status_requires_grant() { unset BG_GRANT_OPERATION; reject main status; }
case_mutation_grant_mismatch() { BG_GRANT_OPERATION=observe; reject main prepare; }

profile_fixture() {
  jq -cn --arg image "$IMAGE_REPOSITORY@$BG_IMAGE_DIGEST" --arg digest "$BG_IMAGE_DIGEST" '
    {State:{Running:true},HostConfig:{RestartPolicy:{Name:"no"},PortBindings:{"8081/tcp":[{HostIp:"127.0.0.1",HostPort:"8081"}]}},Config:{Image:$image,
    Env:["APP_VERSION="+$digest,"DB_URL=jdbc:postgresql://db.internal:5432/jarihana_dev?sslmode=require",
      "SPRING_PROFILES_ACTIVE=dev","PUSH_WORKER_CONTROL_ENABLED=true","PUSH_WORKER_START_PAUSED=true",
      "PUSH_WORKER_HOST_ID=dev-a","PUSH_WORKER_ENVIRONMENT=dev","WORKER_CONTROL_TOKEN="+env.WORKER_CONTROL_TOKEN,
      "PUSH_ENABLED=false","PUSH_WORKER_ENABLED=false"]}}' > "$APP_DIR/profile"
}
case_profile() { profile_fixture; app_profile "$(cat "$APP_DIR/profile")"; }
case_profile_public_management() {
  profile_fixture
  reject app_profile "$(jq '.HostConfig.PortBindings["8081/tcp"][0].HostIp="0.0.0.0"' "$APP_DIR/profile")"
}
case_profile_dev_scheduler() {
  profile_fixture
  reject app_profile "$(jq '.Config.Env += ["PUSH_WORKER_ENABLED=true"]' "$APP_DIR/profile")"
}
live_profile() {
  BG_DEV_AUTO_ENABLED=true
  export PUSH_ENABLED=true PUSH_WORKER_ENABLED=true
  profile_fixture
  jq '.Config.Env |= map(if .=="PUSH_ENABLED=false" then "PUSH_ENABLED=true"
    elif .=="PUSH_WORKER_ENABLED=false" then "PUSH_WORKER_ENABLED=true" else . end)' \
    "$APP_DIR/profile" > "$APP_DIR/live-profile"
}
case_profile_live_dev() { live_profile; app_profile "$(cat "$APP_DIR/live-profile")"; }
case_profile_live_dev_starts_paused() {
  live_profile
  reject app_profile "$(jq '.Config.Env |= map(if .=="PUSH_WORKER_START_PAUSED=true" then "PUSH_WORKER_START_PAUSED=false" else . end)' "$APP_DIR/live-profile")"
  reject app_profile "$(jq '.Config.Env |= map(if .=="PUSH_WORKER_CONTROL_ENABLED=true" then "PUSH_WORKER_CONTROL_ENABLED=false" else . end)' "$APP_DIR/live-profile")"
}
case_profile_live_dev_mismatched_push() {
  live_profile
  reject app_profile "$(cat "$APP_DIR/profile")"
  reject app_profile "$(jq '.Config.Env |= map(if .=="PUSH_WORKER_ENABLED=true" then "PUSH_WORKER_ENABLED=false" else . end)' "$APP_DIR/live-profile")"
}
case_push_settings_rehearsal() {
  export PUSH_ENABLED=true PUSH_WORKER_ENABLED=true
  app_push_settings
  [[ $PUSH_ENABLED == false && $PUSH_WORKER_ENABLED == false ]]
}
case_push_settings_live() {
  BG_DEV_AUTO_ENABLED=true
  for push in true false; do
    for worker in true false; do
      export PUSH_ENABLED=$push PUSH_WORKER_ENABLED=$worker
      app_push_settings
      [[ $PUSH_ENABLED == "$push" && $PUSH_WORKER_ENABLED == "$worker" ]]
    done
  done
}
case_push_settings_invalid() {
  BG_DEV_AUTO_ENABLED=typo; reject app_push_settings
  BG_DEV_AUTO_ENABLED=true; unset PUSH_ENABLED PUSH_WORKER_ENABLED; reject app_push_settings
  export PUSH_ENABLED=true PUSH_WORKER_ENABLED=typo; reject app_push_settings
}
case_push_settings_prod_unchanged() {
  ENVIRONMENT=prod BG_DEV_AUTO_ENABLED=false
  export PUSH_ENABLED=true PUSH_WORKER_ENABLED=true
  app_push_settings
  [[ $PUSH_ENABLED == true && $PUSH_WORKER_ENABLED == true ]]
}
case_live_push_handoff() {
  BG_DEV_AUTO_ENABLED=true
  export PUSH_ENABLED=true PUSH_WORKER_ENABLED=true
  case_handoff
}
case_live_push_cannot_take_owned_authority() {
  BG_DEV_AUTO_ENABLED=true
  export PUSH_ENABLED=true PUSH_WORKER_ENABLED=true
  case_no_activation_with_owner
}
case_profile_wrong_db() {
  profile_fixture
  reject app_profile "$(jq '.Config.Env |= map(if startswith("DB_URL=") then "DB_URL=jdbc:postgresql://prod:5432/jarihana_prod" else . end)' "$APP_DIR/profile")"
}
case_profile_wrong_token() {
  profile_fixture
  reject app_profile "$(jq '.Config.Env |= map(if startswith("WORKER_CONTROL_TOKEN=") then "WORKER_CONTROL_TOKEN=other" else . end)' "$APP_DIR/profile")"
}

prepare_db_fixture() {
  cp "$ROOT/infra/blue-green-deploy/controller/app-compose.yml" "$APP_DIR/compose.yml"
  CONFIG=$(jq --arg compose "$APP_DIR/compose.yml" '. + {compose_file:$compose,app_port:8080}' <<< "$CONFIG")
  HOST='{"upstream":"10.0.3.2:8080"}'
  docker() { printf '%s\n' "$*" >> "$APP_DIR/docker-calls"; return 1; }
}
case_prepare_single_rds() {
  prepare_db_fixture
  unset BLUE_GREEN_RDS_URL
  for ENVIRONMENT in dev prod; do
    rm -f "$APP_DIR/docker-calls"
    if (app_prepare) > "$APP_DIR/prepare.log" 2>&1; then exit 1; fi
    grep -q 'Cannot enumerate application containers' "$APP_DIR/prepare.log"
    [[ $(cat "$APP_DIR/docker-calls") == "ps -aq --no-trunc --filter name=^/$CONTAINER$" ]]
  done
}
case_prepare_ignores_legacy_rds() {
  prepare_db_fixture
  BLUE_GREEN_RDS_URL=obsolete-db.internal
  if (app_prepare) > "$APP_DIR/prepare.log" 2>&1; then exit 1; fi
  grep -q 'Cannot enumerate application containers' "$APP_DIR/prepare.log"
  [[ -s "$APP_DIR/docker-calls" ]]
}
case_prepare_invalid_rds() {
  prepare_db_fixture
  unset BLUE_GREEN_RDS_URL RDS_URL
  if (app_prepare) > "$APP_DIR/prepare.log" 2>&1; then exit 1; fi
  [[ ! -e "$APP_DIR/docker-calls" ]]
  for RDS_URL in '' 'jdbc:postgresql://db.internal' 'db.internal:5432' 'db.internal/jarihana_dev' 'db.internal?sslmode=require' 'db internal'; do
    if (app_prepare) > "$APP_DIR/prepare.log" 2>&1; then exit 1; fi
    [[ ! -e "$APP_DIR/docker-calls" ]]
  done
}
case_receipt() {
  STOPPED=false OPERATION=observe OBSERVED_STARTED_AT=1000 OBSERVED_FINISHED_AT=1900
  bg_output() { [[ $1 == result ]]; printf '%s\n' "$2" > "$APP_DIR/receipt"; }
  app_result
  jq -e --arg boot "$BOOT_ID" --arg grant "$GRANT_ID" --arg digest "$BG_IMAGE_DIGEST" '
    .operation=="observe" and .instance_id=="i-aaaaaaaaaaaaaaaaa" and .run_id==123 and .slot=="A"
    and .grant_id==$grant and .pending_id==$grant and .image==$digest and .identity.bootId==$boot
    and .running and .healthy and (.normal_exit|not) and .shutdown_evidence==null
    and (.observed_finished_at-.observed_started_at)>=900 and .authority.revision==10' "$APP_DIR/receipt" >/dev/null
}

docker_fixture() {
  change '.worker.state="PAUSED"|.authority.phase="COMPLETE"|.authority.owner={hostId:"dev-b",bootId:"55555555-5555-4555-8555-555555555555"}'
  app_read
  jq -cn '{Id:"container-generation",Image:"sha256:image",RestartCount:0,HostConfig:{AutoRemove:false},State:{StartedAt:"1970-01-01T00:10:00Z",FinishedAt:"0001-01-01T00:00:00Z",Running:true,OOMKilled:false,Paused:false,Restarting:false,Dead:false,ExitCode:0}}' > "$APP_DIR/docker"
  docker() {
    case "$1" in
      inspect) cat "$APP_DIR/docker";;
      stop)
        printf '%s\n' "$*" > "$APP_DIR/docker-command"
        jq --argjson code "${DOCKER_EXIT_CODE:-143}" '.State.Running=false|.State.ExitCode=$code|.State.FinishedAt="1970-01-01T00:16:40Z"' "$APP_DIR/docker" > "$APP_DIR/docker-new"
        mv "$APP_DIR/docker-new" "$APP_DIR/docker"
        ;;
      *) return 1;;
    esac
  }
}
case_shutdown() {
  docker_fixture; app_stop_container
  [[ $STOPPED == true ]]
  [[ $(cat "$APP_DIR/docker-command") == 'stop --signal SIGTERM --time -1 -- container-generation' ]]
  jq -e '.resolved and .evidence.signal=="SIGTERM" and .evidence.exit_code==143 and .evidence.container.container_id=="container-generation"' "$STOP_FILE" >/dev/null
  OPERATION=stop
  bg_output() { printf '%s\n' "$2" > "$APP_DIR/receipt"; }
  app_result
  jq -e '.operation=="stop" and (.running|not) and .normal_exit and .shutdown_evidence.oom_killed==false and .shutdown_evidence.restart_count_delta==0 and .shutdown_evidence.stop_cli_exit==0' "$APP_DIR/receipt" >/dev/null
}
case_shutdown_abnormal() {
  docker_fixture; DOCKER_EXIT_CODE=137
  if (app_stop_container) > "$APP_DIR/rejected.log" 2>&1; then exit 1; fi
  jq -e '.resolved==false' "$STOP_FILE" >/dev/null
  reject app_stop_container
}
case_shutdown_http_work() {
  docker_fixture; change '.activity.httpInFlight=1'; app_read
  reject app_stop_container
  [[ ! -f "$APP_DIR/docker-command" ]]
}
case_shutdown_generation_change() {
  docker_fixture
  docker() {
    case "$1" in
      inspect) cat "$APP_DIR/docker";;
      stop) jq '.Id="replacement"' "$APP_DIR/docker" > "$APP_DIR/docker-new"; mv "$APP_DIR/docker-new" "$APP_DIR/docker";;
      *) return 1;;
    esac
  }
  if (app_stop_container) > "$APP_DIR/rejected.log" 2>&1; then exit 1; fi
  jq -e '.resolved==false' "$STOP_FILE" >/dev/null
}

if [[ ${1:-} == --case ]]; then fixture; "case_$2"; exit; fi
passed=0
for scenario in command_rechecks_cached_parent shutdown_rechecks_cached_parent handoff activation_and_completion response_loss cas_race_before cas_race_after grant_and_deadline boot_change initial_idle_snapshot bad_counter wrong_environment no_release_with_work no_activation_with_owner rollback_target rollback_unhealthy_target rollback_wrong_owner handoff_unhealthy activation_unhealthy rollback_old rollback_already_released observation observation_clock_jump observation_readiness status_requires_grant mutation_grant_mismatch profile profile_public_management profile_dev_scheduler profile_live_dev profile_live_dev_starts_paused profile_live_dev_mismatched_push push_settings_rehearsal push_settings_live push_settings_invalid push_settings_prod_unchanged live_push_handoff live_push_cannot_take_owned_authority profile_wrong_db profile_wrong_token prepare_single_rds prepare_ignores_legacy_rds prepare_invalid_rds receipt shutdown shutdown_abnormal shutdown_http_work shutdown_generation_change; do
  bash "$0" --case "$scenario"
  printf 'PASS %s\n' "$scenario"
  passed=$((passed+1))
done
printf '%s app behavioral scenarios passed\n' "$passed"
