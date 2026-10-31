#!/usr/bin/env bash
set -euo pipefail
DIRECTORY=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$DIRECTORY/../../../.." && pwd)
if [[ "${1:-}" == --alloy-smoke ]]; then
  evidence=${ALLOY_TEST_ARTIFACT_DIR:-$ROOT/.omo/evidence/deployment-observability-core/alloy-runtime}
  mkdir -p "$evidence"
  temporary=$(mktemp -d)
  container=
  cleanup() {
    if [[ -n "$container" ]]; then
      docker logs "$container" > "$evidence/container.log" 2>&1 || true
      docker inspect --format '{{json .State}}' "$container" > "$evidence/container-state.json" || true
      docker rm -f "$container" >/dev/null || true
    fi
    rm -rf "$temporary"
  }
  trap cleanup EXIT
  printf 'jarihana_deployment_collector_timestamp_seconds{environment="dev"} %s\n' "$(date +%s)" > "$temporary/deployment.prom"
  container=$(docker run --detach --pull=never --memory=128m --cpus=0.5 \
    -e GOMEMLIMIT=96MiB \
    -e PROMETHEUS_REMOTE_WRITE_URL=http://127.0.0.1:9/api/v1/write \
    -p 127.0.0.1::12345 \
    -v "$ROOT/infra/monitoring/deployment/config.alloy:/etc/alloy/config.alloy:ro" \
    -v "$temporary:/var/lib/jarihana-observability/textfile:ro" \
    grafana/alloy:v1.20.1 run /etc/alloy/config.alloy \
    --storage.path=/tmp/alloy-data --server.http.listen-addr=0.0.0.0:12345)
  address=$(docker port "$container" 12345/tcp)
  [[ "$address" == 127.0.0.1:* ]] || exit 1
  ready=0
  for attempt in {1..30}; do
    if curl --noproxy '*' --fail --silent --show-error --max-time 2 "http://$address/-/ready" > "$evidence/ready.txt" 2>/dev/null; then ready=1; break; fi
    [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]] || break
    sleep 1
  done
  [[ "$ready" == 1 ]] || { echo 'FAIL Alloy runtime never ready' >&2; exit 1; }
  curl --noproxy '*' --fail --silent --show-error --max-time 2 "http://$address/-/healthy" > "$evidence/healthy.txt"
  docker logs "$container" > "$evidence/container.log" 2>&1
  if grep -Eq 'Failed to build|error loading|could not perform the initial load|scrape timeout greater than scrape interval' "$evidence/container.log"; then
    echo 'FAIL Alloy component configuration failed' >&2; exit 1
  fi
  printf 'PASS actual Alloy v1.20.1 runtime readiness and component health (5s interval / 4s timeout)\n' | tee "$evidence/result.txt"
  exit 0
fi
for file in "$ROOT"/infra/monitoring/deployment/*.sh "$DIRECTORY"/test-*.sh; do bash -n "$file"; done
for file in "$DIRECTORY"/test-*.sh; do bash "$file"; done
