#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/common.sh"
source "$ROOT/infra/blue-green-deploy/scripts/actions/cloud.sh"
source "$ROOT/infra/blue-green-deploy/scripts/actions/nginx.sh"

temporary=$(mktemp -d)
prefix="jarihana-probe-header-$(date +%s)-$$"
backend="$prefix-backend"
nginx="$prefix-nginx"
cleanup() {
  local result=$?
  trap - EXIT
  if [[ $result != 0 ]]; then
    docker logs "$nginx" 2>&1 || true
    docker logs "$backend" 2>&1 || true
  fi
  docker rm --force "$nginx" "$backend" >/dev/null 2>&1 || true
  docker network rm "$prefix" >/dev/null 2>&1 || true
  rm -rf "$temporary"
  exit "$result"
}
trap cleanup EXIT

cat > "$temporary/backend.mjs" <<'JS'
import http from 'node:http';
http.createServer((request, response) => {
  const marker = request.headers['x-jarihana-deployment-probe'] ?? '';
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ success: marker === 'true', marker, path: request.url }));
}).listen(8080, '0.0.0.0');
JS
docker network create "$prefix" >/dev/null
docker run --detach --pull=never --name "$backend" --network "$prefix" \
  -v "$temporary/backend.mjs:/backend.mjs:ro" node:24-alpine node /backend.mjs >/dev/null
upstream=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$backend"):8080
sed -e "s/@UPSTREAM@/$upstream/g" -e 's/@SLOT@/A/g' \
  "$ROOT/infra/blue-green-deploy/nginx/nginx.conf.template" > "$temporary/nginx.conf"
docker run --detach --pull=never --name "$nginx" --network "$prefix" \
  -p 127.0.0.1::8080 -p 127.0.0.1::8082 \
  -v "$temporary/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.30.5-alpine >/dev/null
public=$(docker port "$nginx" 8080/tcp)
probe=$(docker port "$nginx" 8082/tcp)
[[ $public == 127.0.0.1:* && $probe == 127.0.0.1:* ]]
ready=false
for attempt in {1..30}; do
  if curl --noproxy '*' -fsS --max-time 2 "http://$public/api/groups?size=1" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.2
done
[[ $ready == true ]]
for agent in browser k6/1.0; do
  curl --noproxy '*' -fsS --max-time 2 -H "User-Agent: $agent" \
    "http://$public/api/groups?size=1" | jq -e '.marker=="" and .path=="/api/groups?size=1"' >/dev/null
done
curl --noproxy '*' -fsS --max-time 2 -H 'X-Jarihana-Deployment-Probe: true' \
  "http://$public/api/groups?size=1" | jq -e '.marker==""' >/dev/null
curl --noproxy '*' -fsS --max-time 2 -H 'X-Jarihana-Deployment-Probe: other' \
  "http://$probe/__deployment" | jq -e '.marker=="true" and .path=="/api/groups?size=1"' >/dev/null
CONFIG=$(jq -cn --arg container "$nginx" --argjson port "${probe##*:}" --arg upstream "$upstream" \
  '{nginx:{container:$container,probe_port:$port},topology:{a:{upstream:$upstream}}}')
[[ $(bg_route) == A ]]
bg_direct A
printf 'PASS real Nginx: user/load traffic retained, spoofed header removed, route/direct probes marked\n'
