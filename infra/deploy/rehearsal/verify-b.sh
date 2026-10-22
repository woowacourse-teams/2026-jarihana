#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_DIGEST:?digest is required}"
: "${WORKER_CONTROL_TOKEN:?machine token is required}"
[[ "$BACKEND_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
compose=(docker compose -f infra/deploy/rehearsal/docker-compose.yml)
container="$("${compose[@]}" ps -q backend)"
[[ -n "$container" ]] || exit 1
[[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || exit 1
[[ "$(docker port "$container" 8081/tcp)" == '127.0.0.1:18081' ]] || exit 1
[[ "$(docker port "$container" 8080/tcp)" == '10.0.3.184:18080' ]] || exit 1

for endpoint in health/readiness health/database; do
  curl --fail --silent --show-error --max-time 5 \
    --retry 40 --retry-all-errors --retry-delay 3 \
    "http://127.0.0.1:18081/actuator/${endpoint}" | jq -e '.status == "UP"' > /dev/null
done

# 토큰은 curl의 명령행 인자나 출력에 넣지 않는다.
status="$(printf 'header = "X-Jarihana-Worker-Control-Token: %s"\n' "$WORKER_CONTROL_TOKEN" \
  | curl --config - --fail --silent --show-error --max-time 5 \
    http://127.0.0.1:18081/actuator/workercontrol)"
jq -e --arg digest "$BACKEND_DIGEST" '
  .version == $digest and .environment == "dev-rehearsal"
  and .identity.hostId == "jarihana-rehearsal-b"
  and .worker.state == "PAUSED" and .worker.inFlight == 0
  and .worker.unresolved == 0
  and (.authority == null or .authority.owner == null)
' <<< "$status" > /dev/null

curl --fail --silent --show-error --max-time 10 \
  'http://10.0.3.184:18080/api/groups?size=1' > /dev/null
code="$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' \
  http://10.0.3.184:18080/api/actuator/workercontrol)"
[[ "$code" == 403 || "$code" == 404 ]] || exit 1
printf 'B readiness / DB / public read API / PAUSED / management isolation: PASS\n'
