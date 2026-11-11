#!/usr/bin/env bash
# Installed by an administrator. Input is an Actions token on stdin, never a checkout path.
set -euo pipefail
shopt -s inherit_errexit
set +x
UPGRADE_PROTOCOL=1

upgrade_fail() { printf '%s\n' "$*" >&2; exit 1; }
upgrade_api() {
  printf 'header = "Authorization: Bearer %s"\n' "$UPGRADE_TOKEN" |
    curl -q --config - --proto '=https' --noproxy '*' --max-redirs 0 --max-filesize 2097152 \
      --fail --silent --show-error --connect-timeout 3 --max-time 20 \
      "https://api.github.com/repos/woowacourse-teams/2026-jarihana/$1"
}
upgrade_authenticate() {
  [[ $RUN =~ ^[1-9][0-9]{0,14}$ && $SHA =~ ^[a-f0-9]{40}$ ]] || upgrade_fail 'Invalid run or commit'
  IFS= read -r UPGRADE_TOKEN
  [[ $UPGRADE_TOKEN =~ ^[A-Za-z0-9_]+$ ]] || upgrade_fail 'Invalid token'
  upgrade_api "actions/runs/$RUN" | jq -e --argjson run "$RUN" --arg sha "$SHA" --argjson rollback "$([[ $OPERATION == rollback ]] && echo true || echo false)" '
    .id==$run and .repository.id==1321030074 and .head_repository.id==1321030074 and
    .repository.full_name=="woowacourse-teams/2026-jarihana" and .head_branch=="main" and
    .head_sha==$sha and .run_attempt==1 and (.status=="in_progress" or ($rollback and .conclusion=="cancelled")) and
    (.event=="push" or .event=="workflow_dispatch") and
    (.path==".github/workflows/backend-prod-deploy.yml" or
     .path==".github/workflows/backend-prod-deploy.yml@refs/heads/main")' >/dev/null || upgrade_fail 'Untrusted production run'
}
upgrade_protected() {
  local path=$1 uid mode
  [[ $path == /* && -e $path && ! -L $path ]] || upgrade_fail 'Missing or linked root path'
  while [[ $path != / ]]; do
    [[ ! -L $path ]] || upgrade_fail 'Linked root ancestor'
    read -r uid mode < <(stat -c '%u %a' "$path")
    [[ $uid == 0 ]] && (( (8#$mode & 0022)==0 )) || upgrade_fail 'Root installation is writable'
    path=$(dirname "$path")
  done
}
upgrade_replace() (
  local destination=$1 source=$2 temporary
  [[ -f $destination && ! -L $destination ]] || upgrade_fail 'Invalid installation target'
  temporary=$(mktemp "$(dirname "$destination")/.control.XXXXXX")
  trap 'rm -f "$temporary"' EXIT
  cp --preserve=all "$destination" "$temporary"
  cat "$source" >"$temporary"
  mv -fT "$temporary" "$destination"
)
upgrade_stage() (
  local temporary
  if [[ ! -e $RELEASE ]]; then
    temporary=$(mktemp -d "$RELEASES/.upgrade.XXXXXX")
    trap 'rm -rf "$temporary"' EXIT
    git init -q "$temporary"
    GIT_TERMINAL_PROMPT=0 timeout 120 git -C "$temporary" fetch -q --depth=1 https://github.com/woowacourse-teams/2026-jarihana.git "$REF"
    [[ $(git -C "$temporary" rev-parse 'FETCH_HEAD^{commit}') == "$SHA" ]]
    git -C "$temporary" checkout -q --detach "$SHA"
    chmod 0755 "$temporary"
    mv -T "$temporary" "$RELEASE"
  fi
  [[ ! -L $RELEASE && $(stat -c '%u %a' "$RELEASE") == '0 755' ]]
  [[ $(git -C "$RELEASE" rev-parse HEAD) == "$SHA" ]]
  [[ -z $(git -C "$RELEASE" status --porcelain) ]]
  [[ -z $(find "$RELEASE" \( ! -user root -o -perm /022 \) -print -quit) ]]
  local helper="$RELEASE/infra/blue-green-deploy/control/host-upgrade.sh"
  [[ ! -L $helper && $(sed -n 's/^UPGRADE_PROTOCOL=//p' "$helper") == "$UPGRADE_PROTOCOL" ]]
  bash -n "$helper"
)
# Recover the topology represented by the unchanged journal, including an upgrade
# whose following deployment never reached plan. Fresh live checks remain mandatory.
upgrade_previous_topology() {
  local topology hash
  topology=$(jq -c .topology <<<"$CONFIG")
  if [[ $(jq -r .control_sha "$JOURNAL") != "$(jq -r .control.sha <<<"$topology")" ]]; then
    hash=$(sha256sum "$JOURNAL" | cut -d ' ' -f1)
    topology=$(jq -ce --arg hash "$hash" '. as $cfg | .control_transition |
      select(.schema_version==1 and .journal_sha256==$hash and .target_control==$cfg.topology.control and
        (.previous_topology|del(.control))==($cfg.topology|del(.control))) | .previous_topology' <<<"$CONFIG")
    [[ ! -L $JOURNAL.control-$hash ]]
    cmp -s "$JOURNAL" "$JOURNAL.control-$hash"
  fi
  printf '%s\n' "$topology"
}
upgrade_coordinator_check() {
  local active previous
  bg_config "$CONFIG_FILE"
  active=$(bg_route)
  bg_direct "$active"
  previous=$(upgrade_previous_topology)
  jq -e --arg digest "$(jq -Sc . <<<"$previous" | sha256sum | cut -d ' ' -f1)" \
    --arg sha "$(jq -r '.control.sha' <<<"$previous")" --arg active "$active" '
    .schema_version==2 and .environment=="prod" and
    .control_sha==$sha and .topology_digest==$digest and .pending==null and .cleanup_deferred!=true and
    (if .phase=="COMPLETE" then .sealed==true or .mode=="bootstrap"
     elif .phase=="ROLLED_BACK" then .http_recovered and .worker_recovered and
       (.frontend==null or .frontend.changed!=true or .frontend.recovered==true) else false end) and
    ([.old_status,.target_status]|map(select(.slot==$active and .running and .healthy and
      .authority.owner==.identity and .authority.phase=="COMPLETE" and .authority.status=="ACTIVE" and
      .worker.state=="ACTIVE" and .worker.unresolved==0))|length)==1
  ' "$JOURNAL" >/dev/null || upgrade_fail 'Previous deployment is unresolved'
  printf '%s\n' "$active"
}
upgrade_app_check() {
  local work container snapshot token port inspected intent topology
  work="$STATE/app-$ROLE"
  topology=$(jq -c .topology "$CONFIG_FILE")
  for intent in "$work"/*intent.json; do
    [[ ! -e $intent ]] || jq -e '.resolved==true' "$intent" >/dev/null || upgrade_fail 'Unresolved application intent'
  done
  container=$(jq -er '.container_name' "$CONFIG_FILE")
  inspected=$(timeout 10 docker inspect --format '{{json .}}' "$container")
  if jq -e '.State.Running' <<<"$inspected" >/dev/null; then
    token=$(cat "$(jq -er '.worker_token_file' "$CONFIG_FILE")")
    [[ $token =~ ^[A-Za-z0-9_+=./-]+$ ]]
    port=$(jq -er .management_port "$CONFIG_FILE")
    snapshot=$(printf 'header = "X-Jarihana-Worker-Control-Token: %s"\n' "$token" |
      curl -q --config - --noproxy '*' --fail --silent --show-error --max-time 3 \
        "http://127.0.0.1:$port/actuator/workercontrol")
    jq -e --arg host "$(jq -r --arg slot "${ROLE,,}" '.topology[$slot].host_id' "$CONFIG_FILE")" '
      .identity.hostId==$host and .environment=="prod" and .worker.unresolved==0 and
      .authority.phase=="COMPLETE" and .authority.status=="ACTIVE" and
      (if .worker.state=="ACTIVE" then .authority.owner==.identity
       else .worker.state=="PAUSED" and .worker.inFlight==0 and .authority.owner!=.identity end)
    ' <<<"$snapshot" >/dev/null || upgrade_fail 'Live worker ownership is uncertain'
    curl --noproxy '*' --fail --silent --show-error --max-time 3 \
      "http://127.0.0.1:$port/actuator/health/readiness" | jq -e '.status=="UP"' >/dev/null
    jq -c --arg role "$ROLE" --argjson topology "$topology" \
      '{slot:$role,topology:$topology,running:true,identity,version,worker:(.worker|{state,unresolved}),authority}' <<<"$snapshot"
  else
    jq -e --slurpfile proof "$work/stop-intent.json" '
      $proof[0].evidence as $e | $proof[0].resolved and
      ({container_id:.Id,image_id:.Image,started_at:.State.StartedAt,restart_count:.RestartCount}==$e.container) and
      .HostConfig.RestartPolicy.Name=="no" and (.State.Running|not) and (.State.OOMKilled|not) and
      (.State.Dead|not) and (.State.Restarting|not) and (.State.Paused|not) and
      .State.ExitCode==$e.exit_code and .State.FinishedAt==$e.finished_at and
      (.State.ExitCode==0 or .State.ExitCode==143)' <<<"$inspected" >/dev/null || upgrade_fail 'Standby shutdown proof differs'
    jq -cn --arg role "$ROLE" --argjson topology "$topology" '{slot:$role,topology:$topology,running:false}'
  fi
}
upgrade_prepare() {
  [[ ! -e $TRANSACTION ]] || upgrade_fail 'Preserved upgrade transaction requires reconciliation'
  upgrade_stage
  install -d -m 0700 "$TRANSACTION"
  cp -a "$CONFIG_FILE" "$TRANSACTION/config.json"
  cp -a "$INSTALLED_HELPER" "$TRANSACTION/helper.sh"
  if [[ $ROLE == coordinator ]]; then
    upgrade_coordinator_check >"$TRANSACTION/active"
    upgrade_previous_topology >"$TRANSACTION/previous-topology.json"
    cp -a "$JOURNAL" "$TRANSACTION/state.json"
    cp -a "$DROPIN" "$TRANSACTION/watchdog.conf"
    fe_get "$FE_ARCHIVE/state.json" "$TRANSACTION/frontend-state.json" >"$TRANSACTION/frontend-metadata.json"
    jq -e --slurpfile journal "$JOURNAL" --arg active "$(cat "$TRANSACTION/active")" '
      .pending==null and .backend_image==([$journal[0].old_status,$journal[0].target_status]|
        map(select(.slot==$active and .running and .healthy))|.[0].image)' "$TRANSACTION/frontend-state.json" >/dev/null
    local current
    current=$(jq -er .current "$TRANSACTION/frontend-state.json")
    fe_id "$current"
    fe_get "$FE_ARCHIVE/$current/release.json" "$TRANSACTION/frontend-manifest.json" >"$TRANSACTION/manifest-metadata.json"
    fe_validate_manifest "$TRANSACTION/frontend-manifest.json"
    jq -e --arg current "$current" --slurpfile pointer "$TRANSACTION/frontend-state.json" \
      '.release_id==$current and .backend_image==$pointer[0].backend_image' "$TRANSACTION/frontend-manifest.json" >/dev/null
    [[ $(grep -Fc "$OLD_RELEASE/" "$DROPIN") == 1 ]]
    sed "s|$OLD_RELEASE/|$RELEASE/|" "$DROPIN" >"$TRANSACTION/next-watchdog.conf"
    jq -cn --arg active "$(cat "$TRANSACTION/active")" --argjson topology "$(jq .topology <<<"$CONFIG")" \
      '{active:$active,topology:$topology}' >"$TRANSACTION/report.json"
  else
    cmp -s "$COMPOSE" "$OLD_RELEASE/infra/blue-green-deploy/controller/app-compose.yml"
    cp -a "$COMPOSE" "$TRANSACTION/app-compose.yml"
    upgrade_app_check >"$TRANSACTION/report.json"
    cp -a "$STATE/app-$ROLE" "$TRANSACTION/app-state"
  fi
  jq --arg ref "$REF" --arg sha "$SHA" '.topology.control={ref:$ref,sha:$sha}' "$CONFIG_FILE" >"$TRANSACTION/next-config.json"
  printf '%s\n' prepared >"$TRANSACTION/status"
}
upgrade_activate() {
  [[ $(cat "$TRANSACTION/status") == prepared ]]
  cmp -s "$CONFIG_FILE" "$TRANSACTION/config.json"
  if [[ $ROLE == coordinator ]]; then
    local active hash issued
    cmp -s "$JOURNAL" "$TRANSACTION/state.json"
    active=$(upgrade_coordinator_check)
    [[ $active == "$(cat "$TRANSACTION/active")" ]]
    systemctl stop jarihana-deploy-watchdog@prod.timer
    systemctl stop jarihana-deploy-watchdog@prod.service
    hash=$(sha256sum "$JOURNAL" | cut -d ' ' -f1)
    if [[ ! -e $JOURNAL.control-$hash ]]; then cp -a "$JOURNAL" "$JOURNAL.control-$hash"; fi
    [[ ! -L $JOURNAL.control-$hash ]]
    cmp -s "$JOURNAL" "$JOURNAL.control-$hash"
    issued=$(date +%s)
    jq --slurpfile previous "$TRANSACTION/previous-topology.json" --arg hash "$hash" --arg active "$active" --argjson now "$issued" '
      .control_transition={schema_version:1,previous_topology:$previous[0],target_control:.topology.control,
        journal_sha256:$hash,active_slot:$active,issued_at:$now,expires_at:($now+3600)}
    ' "$TRANSACTION/next-config.json" >"$TRANSACTION/transition.json"
    upgrade_replace "$CONFIG_FILE" "$TRANSACTION/transition.json"
    upgrade_replace "$DROPIN" "$TRANSACTION/next-watchdog.conf"
    systemctl daemon-reload
    runuser -u jarihana-coordinator -- bash -c '
      source "$1/infra/blue-green-deploy/scripts/actions/coordinator.sh"
      export ENVIRONMENT=prod; BG_MODE=deploy; CONTROL_SHA=$2
      STATE_FILE=/var/lib/jarihana-deploy/prod/state.json
      bg_config /etc/jarihana-deploy/prod/coordinator.json
      bg_previous_journal
    ' _ "$RELEASE" "$SHA"
  else
    upgrade_app_check >"$TRANSACTION/rechecked-report.json"
    cmp -s "$TRANSACTION/report.json" "$TRANSACTION/rechecked-report.json"
    upgrade_replace "$COMPOSE" "$RELEASE/infra/blue-green-deploy/controller/app-compose.yml"
    upgrade_replace "$CONFIG_FILE" "$TRANSACTION/next-config.json"
  fi
  printf '%s\n' activated >"$TRANSACTION/status"
}
upgrade_rollback() {
  [[ -d $TRANSACTION ]] || return 0
  if [[ $ROLE == coordinator && -f $TRANSACTION/state.json ]]; then
    cmp -s "$JOURNAL" "$TRANSACTION/state.json" || upgrade_fail 'Deployment has advanced; preserve current control'
    [[ ! -f $TRANSACTION/watchdog.conf ]] || upgrade_replace "$DROPIN" "$TRANSACTION/watchdog.conf"
    systemctl daemon-reload
  elif [[ -f $TRANSACTION/app-compose.yml ]]; then
    upgrade_replace "$COMPOSE" "$TRANSACTION/app-compose.yml"
  fi
  [[ ! -f $TRANSACTION/config.json ]] || upgrade_replace "$CONFIG_FILE" "$TRANSACTION/config.json"
  [[ ! -f $TRANSACTION/helper.sh ]] || upgrade_replace "$INSTALLED_HELPER" "$TRANSACTION/helper.sh"
  [[ $ROLE != coordinator ]] || systemctl start jarihana-deploy-watchdog@prod.timer
  printf '%s\n' rolled-back >"$TRANSACTION/status"
}
upgrade_finish() {
  [[ $(cat "$TRANSACTION/status") == activated ]]
  [[ $(jq -r '.topology.control.sha' "$CONFIG_FILE") == "$SHA" ]]
  upgrade_replace "$INSTALLED_HELPER" "$RELEASE/infra/blue-green-deploy/control/host-upgrade.sh"
  [[ $ROLE != coordinator ]] || systemctl start jarihana-deploy-watchdog@prod.timer
  printf '%s\n' finished >"$TRANSACTION/status"
}
upgrade_main() {
  [[ $(id -u) == 0 && $# == 3 ]] || upgrade_fail 'Use the installed root helper'
  OPERATION=$1
  RUN=$2; SHA=$3
  case $OPERATION in prepare|activate|rollback|finish|report|wake) :;; *) upgrade_fail 'Unknown operation';; esac
  upgrade_authenticate
  umask 077
  STATE=/var/lib/jarihana-deploy/prod
  RELEASES=/opt/jarihana-prod-deploy/releases
  JOURNAL="$STATE/state.json"
  COMPOSE=/etc/jarihana-deploy/prod/app-compose.yml
  DROPIN=/etc/systemd/system/jarihana-deploy-watchdog@prod.service.d/control-release.conf
  INSTALLED_HELPER=/usr/local/sbin/jarihana-control-upgrade
  TRANSACTION="/var/backups/jarihana-control/automatic/$RUN"
  local configs=(/etc/jarihana-deploy/prod/{coordinator,app-A,app-B}.json) config count=0 source_config
  for config in "${configs[@]}"; do
    if [[ -f $config ]]; then CONFIG_FILE=$config; count=$((count+1)); fi
  done
  [[ $count == 1 ]]
  upgrade_protected "$CONFIG_FILE"
  upgrade_protected "$RELEASES"
  upgrade_protected "$INSTALLED_HELPER"
  ROLE=$(jq -r '.local_slot // "coordinator"' "$CONFIG_FILE")
  source_config=$CONFIG_FILE
  # Recovery uses the original control library even after installing a new pin.
  if [[ $OPERATION == rollback && -f $TRANSACTION/config.json ]]; then
    upgrade_protected "$TRANSACTION/config.json"
    source_config="$TRANSACTION/config.json"
  fi
  OLD_RELEASE="$RELEASES/$(jq -er '.topology.control.sha' "$source_config")"
  [[ $OLD_RELEASE =~ /[a-f0-9]{40}$ && ! -L $OLD_RELEASE ]]
  upgrade_protected "$OLD_RELEASE/infra/blue-green-deploy/scripts/actions/coordinator.sh"
  [[ -z $(find "$OLD_RELEASE" \( ! -user root -o -perm /022 \) -print -quit) ]]
  source "$OLD_RELEASE/infra/blue-green-deploy/scripts/actions/coordinator.sh"
  bg_config "$CONFIG_FILE"
  if [[ $ROLE == coordinator ]]; then
    bg_machine "$(jq -r .topology.coordinator_instance_id <<<"$CONFIG")"
  else
    bg_machine "$(jq -r --arg slot "${ROLE,,}" '.topology[$slot].instance_id' <<<"$CONFIG")"
  fi
  [[ $(jq -r '.topology.environment' <<<"$CONFIG") == prod ]]
  export ENVIRONMENT=prod
  REF="refs/tags/deployment-control-prod-$SHA"
  RELEASE="$RELEASES/$SHA"
  install -d -m 0700 /var/backups/jarihana-control/automatic
  upgrade_protected /var/backups/jarihana-control/automatic
  [[ ! -L /var/backups/jarihana-control/automatic/lock ]]
  exec 8>/var/backups/jarihana-control/automatic/lock
  flock -n 8 || upgrade_fail 'Another control upgrade is active'
  case $OPERATION in
    prepare) upgrade_prepare;;
    activate) upgrade_activate;;
    rollback) upgrade_rollback;;
    report) cat "$TRANSACTION/report.json";;
    finish) upgrade_finish;;
    wake)
      [[ $ROLE == coordinator ]]
      upgrade_coordinator_check >/dev/null
      local slot instance state
      for slot in a b; do
        instance=$(jq -er --arg slot "$slot" '.topology[$slot].instance_id' <<<"$CONFIG")
        state=$(timeout 60 aws ec2 describe-instances --region ap-northeast-2 --instance-ids "$instance" --query 'Reservations[0].Instances[0].State.Name' --output text)
        if [[ $state == stopped ]]; then timeout 60 aws ec2 start-instances --region ap-northeast-2 --instance-ids "$instance" >/dev/null; fi
        [[ $state == stopped || $state == running || $state == pending ]]
      done;;
  esac
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then upgrade_main "$@"; fi
