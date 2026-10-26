#!/usr/bin/env bash
# Real isolated Nginx ACL test. No AWS credentials or production endpoints.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
DIR=$(mktemp -d /private/tmp/jarihana-actions-acl.XXXXXX)
PREFIX=jarihana-actions-acl-${DIR##*.}
IMAGE=nginx:1.30.5-alpine
cleanup() {
  local status=$?
  trap - EXIT
  docker rm --force "$PREFIX-proxy" "$PREFIX-upstream" >/dev/null 2>&1 || true
  docker network rm "$PREFIX" >/dev/null 2>&1 || true
  mkdir -p "$ROOT/local-plans/blue-green-deployment/artifacts/$PREFIX"
  cp "$DIR/"* "$ROOT/local-plans/blue-green-deployment/artifacts/$PREFIX/" 2>/dev/null || true
  printf 'ACL artifacts: %s (exit %s)\n' "$DIR" "$status"
  exit "$status"
}
trap cleanup EXIT
docker image inspect "$IMAGE" >/dev/null
docker network create --label "com.jarihana.actions-acl=$PREFIX" "$PREFIX" >/dev/null
subnet=$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}' "$PREFIX")
[[ ${subnet##*/} -le 24 ]] || { printf 'Fixture needs at least a /24 network.\n' >&2; exit 1; }
docker network rm "$PREFIX" >/dev/null
docker network create --label "com.jarihana.actions-acl=$PREFIX" --subnet "$subnet" "$PREFIX" >/dev/null
base=$(printf '%s' "$subnet" | awk -F '[./]' '{print $1 "." $2 "." $3 "."}')
allowed=${base}20; denied=${base}21; proxy=${base}22
[[ $(grep -c 'allow 10.0.3.51;' "$ROOT/infra/monitoring/nginx/default.conf") == 1 ]]
sed "s/allow 10.0.3.51;/allow $allowed;/" "$ROOT/infra/monitoring/nginx/default.conf" > "$DIR/proxy.conf"
printf 'events {}\nhttp { server { listen 9090; return 200 "ok"; } server { listen 3000; return 200 "ok"; } server { listen 3100; return 200 "ok"; } }\n' > "$DIR/stub.conf"
docker run -d --name "$PREFIX-upstream" --network "$PREFIX" \
  --network-alias prometheus --network-alias grafana --network-alias loki \
  -v "$DIR/stub.conf:/etc/nginx/nginx.conf:ro" "$IMAGE" >/dev/null
docker run -d --name "$PREFIX-proxy" --network "$PREFIX" --ip "$proxy" \
  -v "$DIR/proxy.conf:/etc/nginx/conf.d/default.conf:ro" "$IMAGE" >/dev/null
docker exec "$PREFIX-proxy" nginx -t >/dev/null 2>&1
check() {
  local source=$1 method=$2 port=$3 path=$4 expected=$5 actual
  actual=$(docker run --rm --network "$PREFIX" --ip "$source" --entrypoint curl "$IMAGE" \
    --silent --show-error --max-time 3 -o /dev/null -w '%{http_code}' -X "$method" \
    -H "X-Forwarded-For: $allowed" "http://$proxy:$port$path")
  printf '%s %s %s %s expected=%s actual=%s\n' "$source" "$method" "$port" "$path" "$expected" "$actual" >> "$DIR/cases.log"
  [[ "$actual" == "$expected" ]] || { printf 'Unexpected ACL result: %s\n' "$actual" >&2; exit 1; }
}
check "$allowed" GET 8080 '/prometheus/api/v1/query?query=up' 200
check "$denied" GET 8080 '/prometheus/api/v1/query?query=up' 403
check "$allowed" POST 8080 /prometheus/api/v1/query 403
check "$allowed" GET 8080 /prometheus/api/v1/query_range 404
check "$allowed" GET 8080 /prometheus/api/v1/admin/tsdb/delete_series 404
check "$allowed" GET 80 '/prometheus/api/v1/query?query=up' 404
printf '{"cases":6,"allowed_coordinator_get":true,"other_sources_and_writes_denied":true,"public_and_admin_paths_closed":true,"actual_aws_tested":false}\n' | tee "$DIR/result.json"
