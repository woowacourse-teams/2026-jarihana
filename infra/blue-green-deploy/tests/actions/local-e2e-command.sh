#!/usr/bin/env bash
# Local-only adapters. The real HTTP, authority CAS, journal, Nginx and stop code is sourced below.
# Runtime files consume these globals; source paths are fixed inside the test container.
# shellcheck disable=SC1091,SC2034
set -Eeuo pipefail
: "${BG_E2E_DIR:?}" "${BG_E2E_PREFIX:?}"
[[ $BG_E2E_DIR == /private/tmp/jarihana-actions-e2e.* && $BG_E2E_PREFIX == jarihana-actions-e2e-* ]] || exit 2
ROLE=$1 COMMAND=$2
ROOT=/repo
if [[ $ROLE == app ]]; then source "$ROOT/infra/blue-green-deploy/scripts/actions/app.sh"; else source "$ROOT/infra/blue-green-deploy/scripts/actions/coordinator.sh"; fi

# Replace external host identity/bootstrap only. Production grant/context/lease checks remain active.
bg_init() {
  ENVIRONMENT=dev RUN_ID=$BG_E2E_RUN ATTEMPT=1 BRANCH=develop
  GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa CONTROL_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  REPO=woowacourse-teams/2026-jarihana WORKFLOW_ID=9
  CONFIG=$(cat "$BG_E2E_DIR/config.json")
  STATE_FILE=$BG_E2E_DIR/state/state.json
  if [[ $1 == app ]]; then CONFIG=$(jq -c --arg slot "$BG_SLOT" '. + {local_slot:$slot,container_name:(.fixture_prefix+"-"+$slot)}' <<< "$CONFIG"); fi
  umask 077
  bg_live
}
bg_github() {
  if [[ $1 == */jobs\?* ]]; then printf '{"jobs":[]}\n'; return; fi
  jq -cn --argjson run "$BG_E2E_RUN" '{id:$run,run_attempt:1,head_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",head_branch:"develop",workflow_id:9,path:".github/workflows/backend-dev-deploy.yml",event:"workflow_dispatch",repository:{id:1321030074,full_name:"woowacourse-teams/2026-jarihana"},head_repository:{id:1321030074,full_name:"woowacourse-teams/2026-jarihana"},status:"in_progress",conclusion:null}'
}

# Virtual duration is explicit: actual JVM/API/Nginx evidence is real; this is not a 15-minute soak.
fixture_offset() { (flock -s 8; cat "$BG_E2E_DIR/clock") 8>"$BG_E2E_DIR/clock.lock"; }
bg_now() { printf '%s\n' "$(( $(date +%s)+$(fixture_offset) ))"; }
fixture_uptime() { local value rest; read -r value rest < /proc/uptime; printf '%s\n' "$(( ${value%%.*}+$(fixture_offset) ))"; }
app_uptime() { fixture_uptime; }
bg_uptime() { fixture_uptime; }
sleep() {
  if [[ ${BG_E2E_VIRTUAL_OBSERVATION:-false} == true && $1 == 5 ]]; then
    (flock 8
      offset=$(cat "$BG_E2E_DIR/clock")
      printf '%s\n' "$((offset+5))" > "$BG_E2E_DIR/clock"
    ) 8>"$BG_E2E_DIR/clock.lock"
    command sleep 0.01
  else command sleep "$@"; fi
}

if [[ $ROLE == app ]]; then
  app_prepare() {
    app_read; BOOT_ID=$(jq -r '.identity.bootId' <<< "$SNAPSHOT")
    if [[ ${BG_E2E_PREPARE_STOP_ONLY:-false} == true ]]; then app_stop_container; return; fi
    app_all_drained; app_assert '.healthy'
    [[ $(jq -r '.version' <<< "$SNAPSHOT") == "$BG_IMAGE_DIGEST" ]] || bg_die 'Fixture candidate version differs'
    app_check
    # docker metadata is real; production image/Compose profile coverage belongs to test-app.sh.
    docker inspect --format '{{json .}}' "$CONTAINER" | jq -e --arg host "$HOST_ID" '
      .State.Running and .HostConfig.RestartPolicy.Name=="no" and
      (.Config.Env|index("PUSH_WORKER_START_PAUSED=true"))!=null and
      (.Config.Env|index("PUSH_ENABLED=false"))!=null and
      (.Config.Env|index("PUSH_WORKER_ENABLED=false"))!=null and
      (.Config.Env|index("PUSH_WORKER_HOST_ID="+$host))!=null' >/dev/null || bg_die 'Fixture startup profile differs'
  }
fi
main "$COMMAND"
