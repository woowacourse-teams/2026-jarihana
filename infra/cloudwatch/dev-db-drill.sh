#!/usr/bin/env bash
# Run only on the EC2 self-hosted runner. Never select a container by name.
set -Eeuo pipefail

mode="${1:?Use preflight, inject, or restore}"
: "${RUNNER_TEMP:?GitHub runner temporary directory is required}"
if [[ "$mode" == preflight || "$mode" == inject ]]; then
  : "${EXPECTED_INSTANCE_ID:?Expected EC2 ID is required}"
  source "$(dirname "$0")/ec2-context.sh"
  [[ "${AWS_REGION}" == ap-northeast-2 ]] || { echo 'Unexpected AWS region' >&2; exit 1; }
fi

id_file="${RUNNER_TEMP}/jarihana-dev-db-drill-container-id"
timer_file="${RUNNER_TEMP}/jarihana-dev-db-drill-timer"
timeline_file="${RUNNER_TEMP}/jarihana-dev-db-drill-timeline.txt"
stamp() { TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST'; }
record() { printf '%s | %s\n' "$(stamp)" "$*" | tee -a "$timeline_file"; }

check_labels() {
  local id="$1"
  local project service
  project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$id")"
  service="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id")"
  [[ "$project" == jarihana-dev && "$service" == postgres ]]
}

find_db() {
  local ids
  mapfile -t ids < <(docker ps -aq \
    --filter 'label=com.docker.compose.project=jarihana-dev' \
    --filter 'label=com.docker.compose.service=postgres')
  [[ "${#ids[@]}" -eq 1 ]] || { echo 'Expected exactly one dev PostgreSQL container' >&2; exit 1; }
  check_labels "${ids[0]}"
  printf '%s' "${ids[0]}"
}

api_status() {
  curl --silent --show-error --max-time 8 --output /dev/null \
    --write-out '%{http_code}' http://127.0.0.1:80/api/groups || true
}

wait_healthy() {
  local id="$1" i
  for ((i=0; i<30; i++)); do
    if [[ "$(docker inspect -f '{{.State.Status}}' "$id")" == running ]] && \
       [[ "$(docker inspect -f '{{.State.Health.Status}}' "$id")" == healthy ]] && \
       [[ "$(api_status)" == 200 ]]; then
      record 'Dev DB healthy; GET /api/groups = 200'
      return 0
    fi
    sleep 2
  done
  record 'Dev DB health/API recovery still unconfirmed'
  return 1
}

restore_db() {
  [[ -f "$id_file" ]] || { record 'No dev DB was selected; restore skipped'; return 0; }
  local id timer
  id="$(cat "$id_file")"
  check_labels "$id" || { record 'Stored container labels changed; refusing to start it'; return 1; }
  if [[ "$(docker inspect -f '{{.State.Status}}' "$id")" != running ]]; then
    docker start "$id" >/dev/null
    record 'Dev PostgreSQL docker start issued'
  else
    record 'Dev PostgreSQL is already running'
  fi
  wait_healthy "$id" || return 1
  if [[ -f "$timer_file" ]]; then
    timer="$(cat "$timer_file")"
    sudo -n systemctl stop "${timer}.timer" || true
    record 'Independent recovery timer canceled after health verification'
  fi
}

case "$mode" in
  preflight)
    id="$(find_db)"
    [[ "$(docker inspect -f '{{.State.Status}}' "$id")" == running ]]
    [[ "$(docker inspect -f '{{.State.Health.Status}}' "$id")" == healthy ]]
    [[ "$(api_status)" == 200 ]] || { record 'Dev groups API baseline is not 200'; exit 1; }
    command -v systemd-run >/dev/null
    command -v docker >/dev/null
    sudo -n systemd-run --version >/dev/null
    sudo -n systemctl --version >/dev/null
    printf '%s\n' "$id" > "$id_file"
    record 'Dev DB labels, health, API 200, and independent recovery capability verified'
    ;;
  inject)
    [[ -f "$id_file" ]] || { echo 'Run preflight first' >&2; exit 1; }
    id="$(cat "$id_file")"
    [[ "$(find_db)" == "$id" ]] && check_labels "$id"
    [[ "$(docker inspect -f '{{.State.Health.Status}}' "$id")" == healthy ]]
    [[ "$(api_status)" == 200 ]]
    docker_bin="$(command -v docker)"
    timer="jarihana-dev-db-recover-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
    # The host timer survives a canceled or killed Actions step.
    sudo -n systemd-run --unit "$timer" --on-active=90s \
      --timer-property=AccuracySec=1s --collect "$docker_bin" start "$id" >/dev/null
    printf '%s\n' "$timer" > "$timer_file"
    sudo -n systemctl is-active --quiet "${timer}.timer"
    record 'Independent docker start timer armed for 90 seconds'
    cleanup() { restore_db; }
    trap cleanup EXIT
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "${RUNNER_TEMP}/jarihana-dev-db-drill-start-utc"
    docker stop --time 1 "$id" >/dev/null
    [[ "$(docker inspect -f '{{.State.Status}}' "$id")" == exited ]]
    record 'Dev PostgreSQL stopped'
    deadline=$((SECONDS + 45))
    found=false
    while ((SECONDS < deadline)); do
      status="$(api_status)"
      record "GET /api/groups = ${status}"
      if [[ "$status" == 500 ]]; then
        found=true
        break
      fi
      sleep 2
    done
    # EXIT trap starts the DB immediately, including when no 500 was seen.
    [[ "$found" == true ]] || { record 'No HTTP 500 within 45 seconds'; exit 1; }
    record 'HTTP 500 observed; restoring immediately'
    ;;
  restore)
    restore_db
    ;;
  *)
    echo 'Use preflight, inject, or restore' >&2
    exit 2
    ;;
esac
