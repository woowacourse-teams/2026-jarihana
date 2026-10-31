#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/state"
export BG_OBSERVABILITY_STATE_DIR="$TMP/state" ENVIRONMENT=dev
export BG_OBSERVABILITY_NOW=1735689632 TRAFFIC_TEST_ROOT="$TMP"
export CONFIG='{"nginx":{"container":"edge-test"},"topology":{"a":{"slot":"A","host_id":"host-a","instance_id":"i-aaaaaaaa","upstream":"10.0.0.1:8080"},"b":{"slot":"B","host_id":"host-b","instance_id":"i-bbbbbbbb","upstream":"10.0.0.2:8080"}}}'
export PATH="$TMP/bin:$PATH"
printf '%064d\n' 1 > "$TMP/identity"
printf '0\n' > "$TMP/mode"
cat > "$TMP/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TRAFFIC_TEST_ROOT/commands"
case "$1" in
  inspect)
    [[ $(cat "$TRAFFIC_TEST_ROOT/mode") != inspect-failure ]] || exit 1
    cat "$TRAFFIC_TEST_ROOT/identity"
    ;;
  logs)
    [[ "$2" == --timestamps && "$3" == --since && "$5" == --until && "$7" == edge-test ]]
    [[ $(cat "$TRAFFIC_TEST_ROOT/mode") != logs-failure ]] || exit 1
    cat "$TRAFFIC_TEST_ROOT/logs"
    if [[ $(cat "$TRAFFIC_TEST_ROOT/mode") == replace-during-read ]]; then
      printf '%064d\n' 9 > "$TRAFFIC_TEST_ROOT/identity"
    fi
    ;;
  *) exit 90 ;;
esac
STUB
chmod +x "$TMP/bin/docker"
source "$ROOT/infra/monitoring/deployment/traffic.sh"

log_line() {
  printf '2025-01-01T00:00:%sZ 2025-01-01T00:00:00+00:00 GET %s 200 upstream=%s upstream_status=200 request_time=0.001 upstream_time=0.001\n' "$1" "$2" "$3"
}
assert_counter() {
  local slot=$1 expected=$2
  grep -Eq "^jarihana_nginx_requests_total\{.*slot=\"$slot\".*\} $expected$" "$TMP/metrics"
}
poll_count=0
poll() {
  collect_nginx_traffic > "$TMP/metrics"
  poll_count=$((poll_count + 1))
  if [[ -n ${TRAFFIC_TEST_ARTIFACT_DIR:-} ]]; then
    mkdir -p "$TRAFFIC_TEST_ARTIFACT_DIR"
    cp "$TMP/metrics" "$TRAFFIC_TEST_ARTIFACT_DIR/poll-$poll_count.prom"
    [[ ! -e "$TMP/state/nginx-traffic.json" ]] || cp "$TMP/state/nginx-traffic.json" "$TRAFFIC_TEST_ARTIFACT_DIR/state-$poll_count.json"
  fi
}
assert_success() { grep -q '^jarihana_nginx_traffic_collection_success{environment="dev"} 1$' "$TMP/metrics"; }
assert_failure() {
  grep -q '^jarihana_nginx_traffic_collection_success{environment="dev"} 0$' "$TMP/metrics"
  grep -q '^jarihana_nginx_traffic_observed_at_seconds{environment="dev"} 0$' "$TMP/metrics"
  ! grep -q '^jarihana_nginx_requests_total' "$TMP/metrics"
  cmp "$TMP/saved-state" "$TMP/state/nginx-traffic.json"
}

{
  log_line '00.000000000' /api/a 10.0.0.1:8080
  log_line '15.123456789' /api/b 10.0.0.2:8080
  log_line '20.000000000' /__deployment 10.0.0.1:8080
  log_line '21.000000000' /actuator -
  log_line '22.000000000' /unmatched 10.0.0.9:8080
  log_line '30.000000000' /api/boundary 10.0.0.1:8080
  printf '2025-01-01T00:00:25.000000000Z 2025/01/01 00:00:25 [notice] worker process started\n'
} > "$TMP/logs"
poll
assert_success; assert_counter A 1; assert_counter B 1
grep -q 'logs --timestamps --since 1735689600 --until 1735689630 edge-test' "$TMP/commands"
! grep -qE '/api|/__deployment|/unmatched' "$TMP/state/nginx-traffic.json" "$TMP/metrics"
printf 'PASS bounded bootstrap, exact A/B mapping, probe/unmatched exclusions, no URI persistence\n'

BG_OBSERVABILITY_NOW=1735689637
log_line '30.000000000' /api/second-at-same-time 10.0.0.1:8080 >> "$TMP/logs"
poll
assert_success; assert_counter A 3; assert_counter B 1
poll
assert_success; assert_counter A 3; assert_counter B 1
printf 'PASS half-open boundary, identical timestamps preserved, repeated and overlapping polls deduplicated\n'

printf '%064d\n' 2 > "$TMP/identity"
poll
assert_success; assert_counter A 2; assert_counter B 1
printf 'PASS container recreation resets counters and bootstraps only recent window\n'

CONFIG=$(jq -c '.topology.a.upstream = "10.0.0.3:8080"' <<< "$CONFIG")
poll
assert_success; assert_counter A 0; assert_counter B 1
printf 'PASS protected topology changes reset counters and match only new exact upstream\n'

cp "$TMP/state/nginx-traffic.json" "$TMP/saved-state"
for failure in logs-failure inspect-failure replace-during-read; do
  printf '%s\n' "$failure" > "$TMP/mode"
  poll; assert_failure
  printf 'PASS %s emits failure without cursor advance or stale counters\n' "$failure"
done
printf '%064d\n' 2 > "$TMP/identity"
printf '0\n' > "$TMP/mode"

printf 'broken-state\n' > "$TMP/state/nginx-traffic.json"
cp "$TMP/state/nginx-traffic.json" "$TMP/saved-state"
poll; assert_failure
printf 'PASS malformed state fails closed and remains intact\n'
rm "$TMP/state/nginx-traffic.json"
printf '' > "$TMP/logs"
poll; assert_success; assert_counter A 0; assert_counter B 0
cp "$TMP/state/nginx-traffic.json" "$TMP/saved-state"
printf 'PASS empty logs publish explicit zero A/B counters\n'

BG_OBSERVABILITY_NOW=1735689630
poll; assert_failure
printf 'PASS backwards clock preserves cursor\n'
BG_OBSERVABILITY_NOW=1735689640
printf '2025-01-01T00:00:36.000000000Z 2025-01-01T00:00:36+00:00 GET /api/private broken\n' > "$TMP/logs"
poll; assert_failure
printf 'PASS malformed access log fails without leaking path or advancing cursor\n'

awk 'BEGIN {for(i=0;i<20001;i++) print "non-access log"}' > "$TMP/logs"
poll; assert_failure
printf 'PASS line limit fails without cursor advance\n'
awk 'BEGIN {for(i=0;i<4194305;i++) printf "x"}' > "$TMP/logs"
poll; assert_failure
printf 'PASS byte limit fails without cursor advance\n'

! grep -Ev '^(inspect --format \{\{\.Id\}\} edge-test|logs --timestamps --since [0-9]+ --until [0-9]+ edge-test)$' "$TMP/commands"
[[ -z ${TRAFFIC_TEST_ARTIFACT_DIR:-} ]] || cp "$TMP/commands" "$TRAFFIC_TEST_ARTIFACT_DIR/docker-commands.txt"
printf 'PASS Docker invocations are inspect/logs only; no reload, restart or mutation\n'
