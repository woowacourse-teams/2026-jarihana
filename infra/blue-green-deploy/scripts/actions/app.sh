#!/usr/bin/env bash
# Runs on the selected application runner; management access never leaves loopback.
set -Eeuo pipefail
set +x
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

app_check() {
  bg_grant "$GRANT_OPERATION" "$BG_SLOT"
  [[ $(jq -r '.pending.id' <<<"$STATE") == "$GRANT_ID" ]] || bg_die 'Application grant changed'
  [[ $(jq -r '.deployment_id' <<<"$STATE") == "$DEPLOYMENT_ID" ]] || bg_die 'Application deployment changed'
  (( $(bg_now) < APP_DEADLINE )) || bg_die 'Application operation deadline expired; preserve both hosts'
}

app_assert() { jq -e "$1" <<<"$SNAPSHOT" >/dev/null || bg_die "${2:-Application state is unsafe}"; }
app_authority() {
  jq -c --arg env "$ENVIRONMENT" '.authority // {environment:$env,deploymentId:null,epoch:0,phase:"IDLE",revision:0,authorityRevision:0,owner:null,status:"UNASSIGNED"}' <<<"$1"
}
app_equal() { [[ $(jq -Sc . <<<"$1") == "$(jq -Sc . <<<"$2")" ]]; }

# curl's stdin config keeps the machine token out of process arguments and logs.
app_http() {
  local method=$1 path=$2 body=${3:-} code output
  output=$(mktemp "$APP_DIR/http.XXXXXX")
  chmod 600 "$output"
  if ! code=$({ printf 'header = "X-Jarihana-Worker-Control-Token: %s"\n' "$WORKER_CONTROL_TOKEN";
    printf 'header = "Content-Type: application/json"\n';
  } | curl -q --config - --silent --show-error --noproxy '*' --proto '=http' --max-redirs 0 \
      --connect-timeout 2 --max-time 3 --max-filesize 65536 --request "$method" \
      ${body:+--data-binary} ${body:+@"$body"} --output "$output" --write-out '%{http_code}' \
      "http://127.0.0.1:$MANAGEMENT_PORT$path" 2>/dev/null); then
    rm -f "$output"; return 1
  fi
  if [[ "$code" != 200 && ! ( "$path" == /actuator/health/readiness && "$code" == 503 ) ]]; then
    rm -f "$output"; return 1
  fi
  [[ $(wc -c <"$output") -le 65536 ]] || { rm -f "$output"; return 1; }
  cat "$output"; rm -f "$output"
}

app_snapshot() {
  local raw health
  app_check
  raw=$(app_http GET /actuator/workercontrol) || return 1
  health=$(app_http GET /actuator/health/readiness) || return 1
  jq -e --arg env "$ENVIRONMENT" --arg host "$HOST_ID" '
    def counter: type=="number" and .>=0 and floor==.;
    def uuid: type=="string" and test("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$");
    .environment==$env and .identity.hostId==$host and (.identity.bootId|uuid)
    and (.version|test("^sha256:[a-f0-9]{64}$"))
    and (.worker.state|IN("ACTIVE","DRAINING","PAUSED","BLOCKED"))
    and (.worker.inFlight|counter) and (.worker.unresolved|counter)
    and (.activity.httpInFlight|counter) and (.activity.backgroundInFlight|counter)
    and (.activity.backgroundDrained|type=="boolean")
    and (.authority==null or (.authority|.environment==$env and ((.deploymentId|uuid) or (.deploymentId==null and .phase=="IDLE"))
      and (.epoch|counter) and (.revision|counter) and (.authorityRevision|counter)
      and (.phase|IN("IDLE","PREPARE","HANDOFF","OBSERVE","COMPLETE","NEEDS_ATTENTION"))
      and (.status|IN("ACTIVE","DRAINING","UNASSIGNED"))
      and (.owner==null or (.owner|(.hostId|type=="string") and (.bootId|uuid)))))' <<<"$raw" >/dev/null || return 1
  jq -e '.status|IN("UP","DOWN","OUT_OF_SERVICE","UNKNOWN")' <<<"$health" >/dev/null || return 1
  if [[ -n ${BOOT_ID:-} && $(jq -r '.identity.bootId' <<<"$raw") != "$BOOT_ID" ]]; then
    bg_die 'Application boot changed during operation'
  fi
  SNAPSHOT=$(jq -c --argjson healthy "$(jq '.status=="UP"' <<<"$health")" '. + {healthy:$healthy}' <<<"$raw")
}
app_read() { app_snapshot || bg_die 'Application snapshot unavailable or invalid; no mutation authorized'; }
app_drained() { app_assert '.worker.state=="PAUSED" and .worker.inFlight==0 and .worker.unresolved==0'; }
app_all_drained() { app_drained; app_assert '.activity.httpInFlight==0 and .activity.backgroundInFlight==0 and .activity.backgroundDrained'; }
app_current_owner() { app_assert '.authority.owner==.identity and .authority.status=="ACTIVE" and .worker.state=="ACTIVE"'; }
app_owner() { app_current_owner; app_assert '.healthy'; }
app_unassigned() { app_drained; app_assert '.authority.owner==null and .authority.status=="UNASSIGNED"'; }
app_deployment() { [[ $(jq -r '.authority.deploymentId' <<<"$SNAPSHOT") == "$DEPLOYMENT_ID" ]] || bg_die 'Authority belongs to a different deployment'; }

app_command() {
  local operation=$1 next=${2:-} before expected payload response deadline body
  [[ -r /usr/share/zoneinfo/Asia/Seoul ]] || bg_die 'Install tzdata before issuing worker commands; Seoul deadlines are required'
  app_check
  [[ ! -f "$INTENT_FILE" ]] || jq -e '.resolved==true' "$INTENT_FILE" >/dev/null || bg_die 'Unresolved application command requires reconciliation; never replay'
  before=$(app_authority "$SNAPSHOT")
  app_read
  app_equal "$before" "$(app_authority "$SNAPSHOT")" || bg_die 'Authority changed before command'
  case "$operation" in
    begin) app_assert '(.authority==null) or ((.authority.phase=="IDLE" or .authority.phase=="COMPLETE") and .authority.status!="DRAINING")';;
    phase) app_deployment
      case "$next" in
        COMPLETE) app_owner; app_assert '.authority.phase=="OBSERVE"';;
        OBSERVE) app_owner; app_assert '.authority.phase=="HANDOFF"';;
        HANDOFF) app_assert '.authority.phase=="PREPARE" or .authority.phase=="OBSERVE"';;
        *) bg_die 'Unsupported worker phase';;
      esac;;
    pause) app_deployment
      if [[ "$OPERATION" == rollback && "$BG_SLOT" == "$(jq -r '.target' <<<"$STATE")" ]]; then app_current_owner; else app_owner; fi
      app_assert '.authority.phase=="HANDOFF"';;
    release) app_deployment; app_drained; app_assert '.authority.owner==.identity and .authority.phase=="HANDOFF" and .authority.status=="DRAINING"';;
    activate) app_deployment; app_unassigned; app_assert '.healthy and .authority.phase=="HANDOFF"';;
    *) bg_die 'Unsupported worker command';;
  esac
  expected=$(jq -c --arg op "$operation" --arg next "$next" --arg dep "$DEPLOYMENT_ID" --argjson identity "$(jq '.identity' <<<"$SNAPSHOT")" '
    .revision+=1 | if $op=="begin" then .deploymentId=$dep|.epoch+=1|.phase="PREPARE"
    elif $op=="phase" then .phase=$next
    elif $op=="pause" then .status="DRAINING"|.authorityRevision+=1
    elif $op=="release" then .status="UNASSIGNED"|.owner=null|.authorityRevision+=1
    elif $op=="activate" then .status="ACTIVE"|.owner=$identity|.authorityRevision+=1 else . end' <<<"$before")
  deadline=$(TZ=Asia/Seoul date -d "@$APP_DEADLINE" '+%Y-%m-%dT%H:%M:%S')
  payload=$(jq -cn --arg dep "$DEPLOYMENT_ID" --arg id "$(bg_uuid)" --arg deadline "$deadline" \
    --arg host "$HOST_ID" --arg boot "$BOOT_ID" --arg op "$operation" --arg next "$next" --argjson a "$before" \
    '{deploymentId:$dep,epoch:$a.epoch,commandId:$id,targetHostId:$host,targetBootId:$boot,expectedPhase:$a.phase,deadline:$deadline,expectedRevision:$a.revision} + (if $op=="phase" then {nextPhase:$next} else {} end)')
  bg_atomic "$INTENT_FILE" "$(jq -cn --argjson p "$payload" --argjson b "$before" --argjson a "$expected" --arg operation "$operation" --arg grant "$GRANT_ID" '{resolved:false,operation:$operation,grant:$grant,payload:$p,before:$b,after:$a}')"
  body=$(mktemp "$APP_DIR/body.XXXXXX"); chmod 600 "$body"; printf '%s' "$payload" >"$body"
  app_check
  bg_live
  if ! response=$(app_http POST "/actuator/workercontrol/$operation" "$body"); then
    rm -f "$body"; bg_die 'Worker command response uncertain; preserved intent, never retry'
  fi
  rm -f "$body"
  jq -e '.success==true' <<<"$response" >/dev/null || bg_die 'Worker command rejected; intent preserved'
  app_equal "$expected" "$(jq -c '.authority' <<<"$response")" || bg_die 'Worker command returned unexpected authority'
  app_read
  app_equal "$expected" "$(app_authority "$SNAPSHOT")" || bg_die 'Worker state changed after response; intent preserved'
  bg_atomic "$INTENT_FILE" "$(jq '.resolved=true' "$INTENT_FILE")"
}

app_wait_drain() {
  local deadline=$(( $(bg_now) + 120 ))
  while :; do
    app_read
    app_equal "$DRAIN_AUTHORITY" "$(app_authority "$SNAPSHOT")" || bg_die 'Authority changed while draining'
    if jq -e '.worker.state=="PAUSED" and .worker.inFlight==0 and .worker.unresolved==0' <<<"$SNAPSHOT" >/dev/null; then return; fi
    (( $(bg_now)<deadline )) || bg_die 'Worker drain timed out; preserve both hosts'
    sleep 5
  done
}
app_release() {
  app_command pause
  DRAIN_AUTHORITY=$(app_authority "$SNAPSHOT")
  app_wait_drain
  app_command release
}

app_inspect() {
  app_check
  docker inspect --format '{{json .}}' -- "$CONTAINER" 2>/dev/null
}
app_pin() { jq -c '{container_id:.Id,image_id:.Image,started_at:.State.StartedAt,restart_count:.RestartCount}' <<<"$1"; }
app_push_settings() {
  [[ $ENVIRONMENT == dev ]] || return 0
  case ${BG_DEV_AUTO_ENABLED:-false} in
    false) export PUSH_ENABLED=false PUSH_WORKER_ENABLED=false ;;
    true)
      [[ ${PUSH_ENABLED:-} == true || ${PUSH_ENABLED:-} == false ]] || bg_die 'Dev PUSH_ENABLED must be true or false'
      [[ ${PUSH_WORKER_ENABLED:-} == true || ${PUSH_WORKER_ENABLED:-} == false ]] || bg_die 'Dev PUSH_WORKER_ENABLED must be true or false'
      export PUSH_ENABLED PUSH_WORKER_ENABLED
      ;;
    *) bg_die 'Dev automatic deployment flag must be true or false' ;;
  esac
}
app_profile() {
  local inspected=$1 digest=${2:-$BG_IMAGE_DIGEST}
  app_push_settings
  # Environment is consumed on stdin and is never written to an artifact.
  jq -e --arg host "$HOST_ID" --arg env "$ENVIRONMENT" --arg digest "$digest" --arg repo "$IMAGE_REPOSITORY" \
    --arg db "jdbc:postgresql://${RDS_URL}:5432/jarihana_${ENVIRONMENT}?sslmode=require" --arg port "$MANAGEMENT_PORT" '
    . as $c | [.Config.Env[]|capture("^(?<key>[^=]+)=(?<value>.*)$")] as $pairs |
    ($pairs|from_entries) as $e |
    ($pairs|map(.key)|length)==($pairs|map(.key)|unique|length)
    and $c.State.Running and $c.HostConfig.RestartPolicy.Name=="no"
    and $c.Config.Image==($repo+"@"+$digest) and $e.APP_VERSION==$digest
    and $e.DB_URL==$db and $e.SPRING_PROFILES_ACTIVE==$env
    and $e.PUSH_WORKER_CONTROL_ENABLED=="true" and $e.PUSH_WORKER_START_PAUSED=="true"
    and $e.PUSH_WORKER_HOST_ID==$host and $e.PUSH_WORKER_ENVIRONMENT==$env
    and $e.WORKER_CONTROL_TOKEN==env.WORKER_CONTROL_TOKEN
    and ($c.HostConfig.PortBindings["8081/tcp"]==[{HostIp:"127.0.0.1",HostPort:$port}])
    and ($env!="dev" or ($e.PUSH_ENABLED==env.PUSH_ENABLED and $e.PUSH_WORKER_ENABLED==env.PUSH_WORKER_ENABLED))' <<<"$inspected" >/dev/null || bg_die 'Container profile, digest, database or management binding differs'
}

app_stop_container() {
  local before after pin original_authority stop_pid deadline code stop_id
  app_read; app_all_drained
  app_assert '.authority.status=="ACTIVE" and .authority.owner!=null and .authority.owner.hostId!=.identity.hostId'
  local other_host
  other_host=$(jq -r --arg slot "$BG_SLOT" 'if $slot=="A" then .topology.b.host_id else .topology.a.host_id end' <<<"$CONFIG")
  [[ $(jq -r '.authority.owner.hostId' <<<"$SNAPSHOT") == "$other_host" ]] || bg_die 'Shutdown authority owner is not the other configured host'
  original_authority=$(app_authority "$SNAPSHOT")
  before=$(app_inspect) || bg_die 'Cannot inspect stop target'
  pin=$(app_pin "$before")
  jq -e '.State.Running and (.State.Paused|not) and (.State.Restarting|not) and (.State.Dead|not) and (.State.OOMKilled|not) and (.HostConfig.AutoRemove|not)' <<<"$before" >/dev/null || bg_die 'Container is not safely stoppable'
  [[ ! -f "$STOP_FILE" ]] || jq -e '.resolved==true' "$STOP_FILE" >/dev/null || bg_die 'Unresolved SIGTERM; do not repeat shutdown'
  app_read; app_all_drained
  app_equal "$original_authority" "$(app_authority "$SNAPSHOT")" || bg_die 'Authority changed before shutdown'
  app_equal "$pin" "$(app_pin "$(app_inspect)")" || bg_die 'Container generation changed before shutdown'
  stop_id=$(bg_uuid)
  bg_atomic "$STOP_FILE" "$(jq -cn --arg id "$stop_id" --arg boot "$BOOT_ID" --argjson pin "$pin" '{resolved:false,command_id:$id,boot_id:$boot,container:$pin}')"
  app_check
  bg_live
  docker stop --signal SIGTERM --time -1 -- "$(jq -r '.container_id' <<<"$pin")" >"$APP_DIR/stop.log" 2>&1 &
  stop_pid=$!; deadline=$(( $(bg_now)+120 ))
  while :; do
    app_check
    after=$(app_inspect) || bg_die 'Shutdown inspect failed; do not retry SIGTERM'
    app_equal "$pin" "$(app_pin "$after")" || bg_die 'Container generation changed during shutdown'
    jq -e '(.State.OOMKilled|not) and (.State.Paused|not) and (.State.Restarting|not) and (.State.Dead|not)' <<<"$after" >/dev/null || bg_die 'Abnormal container shutdown'
    if ! kill -0 "$stop_pid" 2>/dev/null; then
      code=0; wait "$stop_pid" || code=$?
      [[ $code == 0 ]] || bg_die 'Docker stop failed; preserve both hosts'
      break
    fi
    (( $(bg_now)<deadline )) || bg_die 'SIGTERM timeout; no forced container termination'
    sleep 1
  done
  jq -e --arg started "$(jq -r '.started_at' <<<"$pin")" '(.State.Running|not) and (.State.ExitCode==0 or .State.ExitCode==143) and .State.FinishedAt>$started' <<<"$after" >/dev/null || bg_die 'Normal exit not proved'
  local finished_epoch
  finished_epoch=$(date -d "$(jq -r '.State.FinishedAt' <<<"$after")" +%s) || bg_die 'Invalid shutdown timestamp'
  (( finished_epoch <= $(bg_now)+5 )) || bg_die 'Shutdown timestamp is in the future'
  SHUTDOWN_EVIDENCE=$(jq -cn --arg id "$stop_id" --arg boot "$BOOT_ID" --argjson pin "$pin" --argjson state "$(jq '.State' <<<"$after")" '{command_id:$id,boot_id:$boot,container:$pin,signal:"SIGTERM",stop_cli_exit:0,exit_code:$state.ExitCode,oom_killed:$state.OOMKilled,restart_count_delta:0,finished_at:$state.FinishedAt}')
  bg_atomic "$STOP_FILE" "$(jq -cn --argjson evidence "$SHUTDOWN_EVIDENCE" '{resolved:true,evidence:$evidence}')"
  STOPPED=true
}

app_prepare() {
  local compose existing inspected deadline pin
  compose=$(jq -r '.compose_file' <<<"$CONFIG")
  bg_root_file "$compose"
  cmp -s "$compose" "$SCRIPT_ROOT/../../controller/app-compose.yml" || bg_die 'Installed Compose differs from immutable checkout'
  : "${RDS_URL:?GitHub RDS_URL is required}"
  [[ "$RDS_URL" =~ ^[a-zA-Z0-9.-]+$ ]] || bg_die 'RDS_URL must contain only the environment DB endpoint'
  export BACKEND_IMAGE="$IMAGE_REPOSITORY" BACKEND_DIGEST="$BG_IMAGE_DIGEST" DEPLOY_ENVIRONMENT="$ENVIRONMENT"
  export DEPLOY_HOST_ID="$HOST_ID" APP_BIND_ADDRESS="$(jq -r '.upstream|split(":")[0]' <<<"$HOST")"
  export APP_PORT="$(jq -r '.app_port' <<<"$CONFIG")" MANAGEMENT_PORT DEPLOY_CONTAINER="$CONTAINER" DEPLOY_DB_NAME="jarihana_$ENVIRONMENT"
  app_push_settings
  app_check
  existing=$(docker ps -aq --no-trunc --filter "name=^/$CONTAINER$") || bg_die 'Cannot enumerate application containers'
  if [[ -n "$existing" ]]; then
    [[ "$existing" =~ ^[a-f0-9]{64}$ ]] || bg_die 'Ambiguous existing container'
    inspected=$(app_inspect) || bg_die 'Cannot inspect existing application'
    if jq -e '.State.Running' <<<"$inspected" >/dev/null; then
      app_read; BOOT_ID=$(jq -r '.identity.bootId' <<<"$SNAPSHOT")
      app_profile "$inspected" "$(jq -r '.version' <<<"$SNAPSHOT")"
      app_stop_container
    else
      [[ -f "$STOP_FILE" ]] && jq -e '.resolved==true' "$STOP_FILE" >/dev/null || bg_die 'Stopped container has no prior normal-exit evidence'
      app_equal "$(app_pin "$inspected")" "$(jq -c '.evidence.container' "$STOP_FILE")" || bg_die 'Stopped container differs from recorded shutdown'
      jq -e --argjson evidence "$(jq '.evidence' "$STOP_FILE")" '
        (.State.Running|not) and (.State.OOMKilled|not) and (.State.Dead|not)
        and (.State.Restarting|not) and (.State.Paused|not)
        and .State.ExitCode==$evidence.exit_code and .State.FinishedAt==$evidence.finished_at
        and (.State.ExitCode==0 or .State.ExitCode==143)' <<<"$inspected" >/dev/null || bg_die 'Recorded standby normal exit no longer matches'
    fi
    pin=$(app_pin "$(app_inspect)")
    app_check
    bg_live
    docker rm -- "$(jq -r '.container_id' <<<"$pin")" >/dev/null || bg_die 'Cannot remove normally stopped standby'
  fi
  BOOT_ID=; STOPPED=false
  local args=(docker compose --project-name "$(jq -r '.project' <<<"$CONFIG")" --env-file /dev/null -f "$compose")
  app_check; "${args[@]}" config --quiet >/dev/null 2>&1 || bg_die 'Compose configuration invalid'
  app_check; timeout 150 "${args[@]}" pull backend >"$APP_DIR/compose.log" 2>&1 || bg_die 'Image pull failed'
  app_check; bg_live; timeout 150 "${args[@]}" up -d --no-build --pull never backend >>"$APP_DIR/compose.log" 2>&1 || bg_die 'Candidate startup uncertain; preserve container'
  deadline=$(( $(bg_now)+600 ))
  while :; do
    app_check
    if app_snapshot; then
      BOOT_ID=$(jq -r '.identity.bootId' <<<"$SNAPSHOT")
      [[ $(jq -r '.version' <<<"$SNAPSHOT") == "$BG_IMAGE_DIGEST" ]] || bg_die 'Candidate reports wrong version'
      app_drained
      if jq -e '.healthy' <<<"$SNAPSHOT" >/dev/null; then
        app_profile "$(app_inspect)"; app_all_drained; return
      fi
    fi
    (( $(bg_now)<deadline )) || bg_die 'Candidate readiness timed out'
    sleep 5
  done
}

app_uptime() { local elapsed rest; read -r elapsed rest < /proc/uptime; printf '%s\n' "${elapsed%%.*}"; }

app_observe() {
  OBSERVED_STARTED_AT=$(bg_now)
  local deadline=$(( OBSERVED_STARTED_AT+300 )) expected failures=0 monotonic_start now elapsed drift previous
  monotonic_start=$(app_uptime); previous=$OBSERVED_STARTED_AT
  app_owner; app_deployment; app_assert '.authority.phase=="OBSERVE"'
  expected=$(app_authority "$SNAPSHOT")
  while :; do
    if app_snapshot; then
      app_equal "$expected" "$(app_authority "$SNAPSHOT")" || bg_die 'Authority changed during observation'
      app_assert '.worker.state=="ACTIVE" and .worker.unresolved==0'
      if jq -e '.healthy' <<<"$SNAPSHOT" >/dev/null; then failures=0; else failures=$((failures+1)); fi
    else failures=$((failures+1)); fi
    (( failures<3 )) || bg_die 'Application failed consecutive readiness checks'
    now=$(bg_now); elapsed=$(( $(app_uptime)-monotonic_start )); drift=$(( now-OBSERVED_STARTED_AT-elapsed ))
    (( now>=previous && elapsed>=0 && drift>=-5 && drift<=5 )) || bg_die 'Clock changed during application observation'
    previous=$now
    if (( now>=deadline && elapsed>=300 )); then
      app_read; app_owner; app_assert '.worker.unresolved==0'
      app_equal "$expected" "$(app_authority "$SNAPSHOT")" || bg_die 'Authority changed at observation completion'
      break
    fi
    sleep 5
  done
  app_owner
  OBSERVED_FINISHED_AT=$(bg_now)
}

app_run() {
  case "$OPERATION" in
    prepare) app_prepare;;
    handoff) app_owner; app_command begin; app_command phase HANDOFF; app_release;;
    activate) app_command activate; app_command phase OBSERVE;;
    observe) app_observe;;
    complete) app_command phase COMPLETE;;
    bootstrap) app_all_drained; app_assert '.healthy and (.authority==null or (.authority.owner==null and .authority.status=="UNASSIGNED" and (.authority.phase=="IDLE" or .authority.phase=="COMPLETE")))'
      [[ $(jq -r '.version' <<<"$SNAPSHOT") == "$BG_IMAGE_DIGEST" ]] || bg_die 'Bootstrap image differs'
      app_command begin; app_command phase HANDOFF; app_command activate; app_command phase OBSERVE; app_command phase COMPLETE;;
    rollback)
      app_deployment
      if [[ "$BG_SLOT" == "$(jq -r '.target' <<<"$STATE")" ]]; then
        if jq -e '.authority.owner==null and .authority.status=="UNASSIGNED" and .authority.phase=="HANDOFF"' <<<"$SNAPSHOT" >/dev/null; then app_drained
        else app_current_owner; if [[ $(jq -r '.authority.phase' <<<"$SNAPSHOT") == OBSERVE ]]; then app_command phase HANDOFF; fi; app_release; fi
      else app_command activate; app_command phase OBSERVE; app_command phase COMPLETE; fi;;
    stop)
      app_deployment; app_assert '.authority.phase=="COMPLETE"'
      app_equal "$(jq -c '.identity' <<<"$SNAPSHOT")" "$(jq -c '.old_status.identity' <<<"$STATE")" || bg_die 'Shutdown app boot differs from handed-off old boot'
      app_equal "$(jq -c '.authority.owner' <<<"$SNAPSHOT")" "$(jq -c '.target_status.identity' <<<"$STATE")" || bg_die 'Shutdown owner differs from observed target boot'
      app_stop_container;;
    status) :;;
    *) bg_die 'Unsupported app operation';;
  esac
}

app_result() {
  RESULT=$(jq -c --arg instance "$INSTANCE_ID" --arg op "$OPERATION" --arg dep "$DEPLOYMENT_ID" --arg slot "$BG_SLOT" \
    --argjson run "$RUN_ID" --arg grant "$GRANT_ID" --argjson stopped "$STOPPED" --argjson evidence "${SHUTDOWN_EVIDENCE:-null}" \
    --argjson started "${OBSERVED_STARTED_AT:-null}" --argjson finished "${OBSERVED_FINISHED_AT:-null}" \
    '. + {instance_id:$instance,operation:$op,deployment_id:$dep,slot:$slot,run_id:$run,pending_id:$grant,grant_id:$grant,image:.version,running:($stopped|not),normal_exit:$stopped,shutdown_evidence:$evidence,observed_started_at:$started,observed_finished_at:$finished}' <<<"$SNAPSHOT")
  bg_output result "$RESULT"
}

main() {
  OPERATION=${1:-}; GRANT_OPERATION=${BG_GRANT_OPERATION:-$OPERATION}
  case "$OPERATION" in prepare|handoff|activate|observe|rollback|complete|stop|bootstrap|status) :;; *) bg_die 'Unknown app operation';; esac
  if [[ "$OPERATION" == status ]]; then
    [[ -n ${BG_GRANT_OPERATION:-} ]] || bg_die 'Status requires an explicit pending grant operation'
    case "$GRANT_OPERATION" in prepare|handoff|activate|observe|rollback|complete|stop|bootstrap) :;; *) bg_die 'Unknown status grant operation';; esac
  else
    [[ "$GRANT_OPERATION" == "$OPERATION" ]] || bg_die 'Mutation must use its matching grant operation'
  fi
  bg_api_context "$OPERATION"
  bg_init app
  [[ $OPERATION != bootstrap ]] || bg_api_context deploy
  HOST=$(jq -c --arg slot "$BG_SLOT" 'if $slot=="A" then .topology.a else .topology.b end' <<<"$CONFIG")
  HOST_ID=$(jq -r '.host_id' <<<"$HOST"); INSTANCE_ID=$(jq -r '.instance_id' <<<"$HOST")
  MANAGEMENT_PORT=$(jq -r '.management_port' <<<"$CONFIG"); CONTAINER=$(jq -r '.container_name' <<<"$CONFIG")
  IMAGE_REPOSITORY=$(jq -r '.image_repository' <<<"$CONFIG")
  [[ "$MANAGEMENT_PORT" =~ ^[0-9]+$ ]] && (( MANAGEMENT_PORT>0 && MANAGEMENT_PORT<65536 )) || bg_die 'Invalid management port'
  APP_DIR="/var/lib/jarihana-deploy/$ENVIRONMENT/app-$BG_SLOT"
  [[ -d "$APP_DIR" && ! -L "$APP_DIR" && -O "$APP_DIR" ]] || bg_die 'Provision runner-owned app state directory first'
  chmod 700 "$APP_DIR"; umask 077
  exec 9>"$APP_DIR/lock"; flock -n 9 || bg_die 'Another app operation is running'
  INTENT_FILE="$APP_DIR/worker-intent.json"; STOP_FILE="$APP_DIR/stop-intent.json"
  [[ ! -f "$INTENT_FILE" ]] || jq -e '.resolved==true' "$INTENT_FILE" >/dev/null || bg_die 'Unresolved previous worker intent requires reconciliation'
  [[ ! -f "$STOP_FILE" ]] || jq -e '.resolved==true' "$STOP_FILE" >/dev/null || bg_die 'Unresolved previous SIGTERM requires reconciliation'
  local token_file
  token_file=$(jq -r '.worker_token_file' <<<"$CONFIG"); bg_root_file "$token_file" 65536 true
  WORKER_CONTROL_TOKEN=$(cat "$token_file")
  [[ ${#WORKER_CONTROL_TOKEN} -ge 32 && "$WORKER_CONTROL_TOKEN" =~ ^[a-zA-Z0-9._~+/=-]+$ ]] || bg_die 'Invalid worker machine token'
  export WORKER_CONTROL_TOKEN
  bg_grant "$GRANT_OPERATION" "$BG_SLOT"
  GRANT_ID=$(jq -r '.pending.id' <<<"$STATE"); APP_DEADLINE=$(jq -r '.pending.deadline' <<<"$STATE")
  DEPLOYMENT_ID=$(jq -r '.deployment_id' <<<"$STATE"); BOOT_ID=; STOPPED=false
  if [[ "$OPERATION" != prepare ]]; then app_read; BOOT_ID=$(jq -r '.identity.bootId' <<<"$SNAPSHOT"); fi
  app_run
  app_check
  bg_live
  app_result
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
