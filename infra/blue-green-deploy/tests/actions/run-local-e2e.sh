#!/usr/bin/env bash
# Explicit local-only Spring/Postgres/Nginx/Alloy/Prometheus integration; no remote credentials.
set -Eeuo pipefail
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
JAVA_IMAGE=sha256:e64879618e035e98f435ae1dd0eae3b72baf917b45326083a519221293d6d8c0
TOOLS_IMAGE=jarihana-actions-test:local
if [[ ${BG_E2E_INNER:-false} != true ]]; then
  [[ -f $ROOT/backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar ]] || { printf 'Build the backend JAR first.\n' >&2; exit 2; }
  for image in "$JAVA_IMAGE" "$TOOLS_IMAGE" postgres:17 nginx:1.30.5-alpine prom/prometheus:v3.15.0 grafana/alloy:v1.20.1; do docker image inspect "$image" >/dev/null; done
  BG_E2E_DIR=$(mktemp -d /private/tmp/jarihana-actions-e2e.XXXXXX)
  BG_E2E_PREFIX=jarihana-actions-e2e-${BG_E2E_DIR##*.}
  evidence="$ROOT/local-plans/blue-green-deployment/artifacts/$BG_E2E_PREFIX"
  mkdir -p "$evidence"
  trap 'cp -R "$BG_E2E_DIR/." "$evidence/"; printf "Saved integration evidence: %s\n" "$evidence"' EXIT
  printf 'Local integration artifacts: %s\n' "$BG_E2E_DIR"
  printf 'Starts two isolated real JVMs, Postgres, Nginx, Alloy and Prometheus; observation duration is virtual.\n'
  docker run --rm --name "$BG_E2E_PREFIX-runner" \
    -v "$ROOT:/repo:ro" -v "$BG_E2E_DIR:$BG_E2E_DIR" -v /var/run/docker.sock:/var/run/docker.sock \
    -e BG_E2E_INNER=true -e BG_E2E_DIR="$BG_E2E_DIR" -e BG_E2E_PREFIX="$BG_E2E_PREFIX" -e BG_E2E_HOST_ROOT="$ROOT" \
    "$TOOLS_IMAGE" bash /repo/infra/blue-green-deploy/tests/actions/run-local-e2e.sh 2>&1 | tee "$evidence/run.log"
  exit
fi

: "${BG_E2E_DIR:?}" "${BG_E2E_PREFIX:?}" "${BG_E2E_HOST_ROOT:?}"
[[ $BG_E2E_DIR == /private/tmp/jarihana-actions-e2e.* && $BG_E2E_PREFIX == jarihana-actions-e2e-* ]] || exit 2
DIR=$BG_E2E_DIR PREFIX=$BG_E2E_PREFIX NETWORK=$BG_E2E_PREFIX-network
TOKEN=local-e2e-machine-token-fixture-0123456789abcdef
IMAGE_A=sha256:$(printf 'a%.0s' {1..64})
IMAGE_B=sha256:$(printf 'b%.0s' {1..64})
IMAGE_C=sha256:$(printf 'c%.0s' {1..64})
IMAGE_D=sha256:$(printf 'd%.0s' {1..64})
IMAGE_E=sha256:$(printf 'e%.0s' {1..64})
RUN=100 MODE=bootstrap DIGEST=$IMAGE_A SAMPLER=
mkdir -p "$DIR"/{state,nginx/generations,etc,bin,app-A,app-B,receipts,logs}
chmod 700 "$DIR" "$DIR"/{state,nginx,nginx/generations,etc,bin,app-A,app-B,receipts,logs}
printf '0\n' > "$DIR/clock"; printf '%s\n' "$TOKEN" > "$DIR/etc/worker-token"
printf 'fixture\n' > "$DIR/etc/grant-key"; printf 'fixture\n' > "$DIR/etc/known-hosts"
chmod 600 "$DIR/etc/"*
printf 'setup\n' > "$DIR/scenario"
cleanup() {
  local status=$? container
  trap - EXIT
  [[ -z $SAMPLER ]] || { kill "$SAMPLER" 2>/dev/null || true; wait "$SAMPLER" 2>/dev/null || true; }
  printf '%s\n' "$status" > "$DIR/exit-code"
  # Only resources with this invocation's unique label are eligible for cleanup.
  while read -r container; do
    [[ -n $container ]] || continue
    docker logs "$container" > "$DIR/logs/$container.log" 2>&1 || true
    docker rm --force "$container" >/dev/null 2>&1 || true
  done < <(docker ps -aq --filter "label=com.jarihana.actions-e2e=$PREFIX")
  docker network disconnect "$NETWORK" "$HOSTNAME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  printf 'Artifacts retained: %s (exit %s)\n' "$DIR" "$status"
  exit "$status"
}
trap cleanup EXIT
label=(--label "com.jarihana.actions-e2e=$PREFIX")
docker network create "${label[@]}" "$NETWORK" > "$DIR/network-id"
docker network connect "$NETWORK" "$HOSTNAME"
docker run -d --name "$PREFIX-postgres" "${label[@]}" --network "$NETWORK" \
  -e POSTGRES_USER=fixture -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=bluegreen_fixture postgres:17 > "$DIR/postgres-id"
for ((attempt=0;attempt<60;attempt++)); do
  if docker exec "$PREFIX-postgres" pg_isready -h 127.0.0.1 -U fixture -d bluegreen_fixture >/dev/null 2>&1; then break; fi
  sleep 0.5
done
docker exec "$PREFIX-postgres" pg_isready -h 127.0.0.1 -U fixture -d bluegreen_fixture >/dev/null

# These two executable doubles are the complete external process boundary.
cat > "$DIR/bin/ssh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cat "$BG_E2E_DIR/state/state.json"
SH
cat > "$DIR/bin/aws" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == ec2 ]]
op=$2; shift 2
while (($#)); do if [[ $1 == --instance-ids ]]; then instance=$2; shift 2; else shift; fi; done
case $instance in i-aaaaaaaaaaaaaaaaa) slot=A;; i-bbbbbbbbbbbbbbbbb) slot=B;; *) exit 2;; esac
state_file=$BG_E2E_DIR/ec2-$slot
state=$(cat "$state_file")
ip=$(jq -r --arg slot "$slot" '.topology[($slot|ascii_downcase)].upstream|split(":")[0]' "$BG_E2E_DIR/config.json")
case $op in
 describe-instances) jq -cn --arg id "$instance" --arg ip "$ip" --arg state "$state" '{Reservations:[{OwnerId:"000000000000",Instances:[{InstanceId:$id,VpcId:"vpc-00000000000000000",PrivateIpAddress:$ip,RootDeviceType:"ebs",State:{Name:$state}}]}]}' ;;
 start-instances) [[ $state == stopped ]]; printf 'running\n' > "$state_file"; jq -cn --arg id "$instance" '{StartingInstances:[{InstanceId:$id,PreviousState:{Name:"stopped"},CurrentState:{Name:"running"}}]}' ;;
 stop-instances) [[ $state == running ]]; printf 'stopped\n' > "$state_file"; jq -cn --arg id "$instance" '{StoppingInstances:[{InstanceId:$id,PreviousState:{Name:"running"},CurrentState:{Name:"stopped"}}]}' ;;
 *) exit 2;;
esac
printf '%s %s\n' "$op" "$slot" >> "$BG_E2E_DIR/aws-calls.log"
SH
chmod 700 "$DIR/bin/ssh" "$DIR/bin/aws"
printf 'running\n' > "$DIR/ec2-A"; printf 'stopped\n' > "$DIR/ec2-B"

start_app() {
  local slot=$1 digest=$2 name=$PREFIX-$1
  if [[ $slot == B ]] && docker inspect "$PREFIX-reserve-B" >/dev/null 2>&1; then
    docker rm --force "$PREFIX-reserve-B" >/dev/null
  fi
  if docker inspect "$name" >/dev/null 2>&1; then
    docker inspect --format '{{json .}}' "$name" | jq -e '(.State.Running|not) and (.State.OOMKilled|not) and (.State.ExitCode==0 or .State.ExitCode==143)' >/dev/null
    docker logs "$name" > "$DIR/logs/$name-before-replace-$(date +%s).log" 2>&1
    docker rm "$name" >/dev/null
  fi
  docker run -d --name "$name" "${label[@]}" --network "$NETWORK" --restart no --stop-signal SIGTERM \
    --memory 512m -v "$BG_E2E_HOST_ROOT/backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar:/tmp/fixture-backend.jar:ro" \
    -e "DB_URL=jdbc:postgresql://$PREFIX-postgres:5432/bluegreen_fixture" -e DB_USERNAME=fixture -e DB_PASSWORD=fixture \
    -e "APP_VERSION=$digest" -e PUSH_ENABLED=false -e PUSH_WORKER_ENABLED=false -e PUSH_WORKER_START_PAUSED=true \
    -e PUSH_WORKER_CONTROL_ENABLED=true -e "PUSH_WORKER_HOST_ID=dev-${slot,,}" -e PUSH_WORKER_ENVIRONMENT=dev \
    -e "WORKER_CONTROL_TOKEN=$TOKEN" -e ACCESS_TOKEN_SECRET=local-fixture-jwt-secret-0123456789abcdef \
    -e INVITATION_TOKEN_KEY_PRIMARY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY= \
    -e GITHUB_OAUTH_CLIENT_ID=fixture -e GITHUB_OAUTH_CLIENT_SECRET=fixture -e AWS_EC2_METADATA_DISABLED=true \
    -e SERVER_SHUTDOWN=graceful -e SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE=90s -e OTEL_SDK_DISABLED=true \
    --entrypoint java "$JAVA_IMAGE" -Xmx256m -jar /tmp/fixture-backend.jar --spring.profiles.active=dev > "$DIR/$slot-id"
  for ((attempt=0;attempt<180;attempt++)); do
    if docker run --rm --network "container:$name" "$TOOLS_IMAGE" curl -fsS --max-time 2 http://127.0.0.1:8081/actuator/health/readiness > "$DIR/$slot-readiness.json" 2>/dev/null; then break; fi
    [[ $(docker inspect --format '{{.State.Running}}' "$name") == true ]] || { docker logs "$name" >&2; return 1; }
    sleep 0.5
  done
  jq -e '.status=="UP"' "$DIR/$slot-readiness.json" >/dev/null
  printf 'Started real Spring %s (PAUSED startup configured)\n' "$slot"
}
start_app A "$IMAGE_A"
A_IP=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PREFIX-A")
# Reserve B's address with a harmless fixture placeholder until the first candidate starts.
docker run -d --name "$PREFIX-reserve-B" "${label[@]}" --network "$NETWORK" --entrypoint sleep "$TOOLS_IMAGE" infinity > /dev/null
B_IP=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PREFIX-reserve-B")
sed -e "s/@UPSTREAM@/$A_IP:8080/g" -e 's/@SLOT@/A/g' "$ROOT/infra/blue-green-deploy/nginx/nginx.conf.template" > "$DIR/nginx/current.conf"
chmod 600 "$DIR/nginx/current.conf"
docker run -d --name "$PREFIX-nginx" "${label[@]}" --network "$NETWORK" \
  -v "$DIR/nginx:/etc/nginx/deploy:ro" nginx:1.30.5-alpine nginx -c /etc/nginx/deploy/current.conf -g 'daemon off;' > "$DIR/nginx-id"
NGINX_IP=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PREFIX-nginx")
cat > "$DIR/prometheus.yml" <<EOF
global:
  scrape_interval: 1s
  evaluation_interval: 1s
scrape_configs: []
EOF
chmod 644 "$DIR/prometheus.yml"
docker run -d --name "$PREFIX-prometheus" "${label[@]}" --network "$NETWORK" \
  -v "$DIR/prometheus.yml:/etc/prometheus/prometheus.yml:ro" prom/prometheus:v3.15.0 \
  --config.file=/etc/prometheus/prometheus.yml --web.enable-remote-write-receiver > "$DIR/prometheus-id"
PROM_IP=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PREFIX-prometheus")
# Use the actual production collection blocks, including labels, without copying a fixture schema.
# Unrelated host/DB/log exporters are outside this isolated app-metrics test.
awk '/^prometheus.remote_write "monitoring" \{/ || /^prometheus.scrape "app" \{/ {keep=1}
  keep {print} keep && /^}$/ {keep=0}' "$ROOT/infra/monitoring/alloy/config.alloy" > "$DIR/app-metrics.alloy"
[[ $(grep -c '^prometheus.scrape "app"' "$DIR/app-metrics.alloy") == 1 &&
   $(grep -c '^prometheus.remote_write "monitoring"' "$DIR/app-metrics.alloy") == 1 ]]
chmod 644 "$DIR/app-metrics.alloy"
for slot in A B; do
  address=$A_IP; [[ $slot != B ]] || address=$B_IP
  docker run -d --name "$PREFIX-alloy-$slot" "${label[@]}" --network "$NETWORK" \
    -v "$DIR/app-metrics.alloy:/etc/alloy/config.alloy:ro" \
    -e SPRING_PROFILES_ACTIVE=dev -e "HOST_ID=dev-${slot,,}" -e "APP_METRICS_TARGET=$address:8081" \
    -e "PROMETHEUS_REMOTE_WRITE_URL=http://$PROM_IP:9090/api/v1/write" grafana/alloy:v1.20.1 \
    run --storage.path=/tmp/alloy-data /etc/alloy/config.alloy > "$DIR/alloy-$slot-id"
done
jq --arg a "$A_IP:8080" --arg b "$B_IP:8080" --arg prefix "$PREFIX" --arg dir "$DIR" --arg prom "http://$PROM_IP:9090" '
  .topology.a.upstream=$a|.topology.b.upstream=$b|
  .nginx={directory:($dir+"/nginx"),container:($prefix+"-nginx"),probe_port:8082}|
  .telemetry.url=$prom|.fixture_prefix=$prefix|
  .worker_token_file="/etc/jarihana-deploy/dev/worker-token"|
  .journal_key="/etc/jarihana-deploy/dev/grant-key"|.known_hosts="/etc/jarihana-deploy/dev/known-hosts"|
  .coordinator_address="127.0.0.1"|.management_port=8081|
  .image_repository="ghcr.io/local-fixture/backend"' "$ROOT/infra/blue-green-deploy/controller/full-coordinator.example.json" > "$DIR/config.json"
chmod 600 "$DIR/config.json"

runner() {
  local role=$1 command=$2 slot=${3:-} output=$4 network container app_mount=()
  container=$PREFIX-nginx; [[ $role != app ]] || container=$PREFIX-$slot
  network=container:$container
  [[ $role != app ]] || app_mount=(-v "$DIR/app-$slot:/var/lib/jarihana-deploy/dev/app-$slot")
  docker run --rm "${label[@]}" --network "$network" \
    -v "$BG_E2E_HOST_ROOT:/repo:ro" -v "$DIR:$DIR" -v "$DIR/etc:/etc/jarihana-deploy/dev:ro" \
    -v "$DIR/bin:/fixture-bin:ro" -v /var/run/docker.sock:/var/run/docker.sock "${app_mount[@]}" \
    -e PATH=/fixture-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -e BG_E2E_DIR="$DIR" -e BG_E2E_PREFIX="$PREFIX" -e BG_E2E_RUN="$RUN" \
    -e BG_ENVIRONMENT=dev -e BG_MODE="$MODE" -e BG_SLOT="$slot" -e BG_IMAGE_DIGEST="$DIGEST" \
    -e BG_E2E_VIRTUAL_OBSERVATION="${VIRTUAL:-false}" -e BG_E2E_PREPARE_STOP_ONLY="${STOP_ONLY:-false}" \
    -e GITHUB_OUTPUT="$DIR/receipts/$output.output" -e APP_RESULT="${APP_RESULT:-}" -e TARGET_RESULT="${TARGET_RESULT:-}" \
    "$TOOLS_IMAGE" bash /repo/infra/blue-green-deploy/tests/actions/local-e2e-command.sh "$role" "$command" > "$DIR/logs/$output.log" 2>&1 || {
      cat "$DIR/logs/$output.log" >&2; return 1;
    }
  awk 'begin{body=0} /^result<</{body=1;next} body&&/^bg-/{exit} body{print}' "$DIR/receipts/$output.output" > "$DIR/receipts/$output.json"
  jq -e . "$DIR/receipts/$output.json" >/dev/null
}
coor() { runner coordinator "$1" '' "$2"; }
app() { runner app "$1" "$2" "$3"; }
receipt() { cat "$DIR/receipts/$1.json"; }
phase() { [[ $(jq -r '.phase' "$DIR/state/state.json") == "$1" ]]; }
slot() { jq -r ".$1" "$DIR/state/state.json"; }
record() { cp "$DIR/state/state.json" "$DIR/receipts/$1-state.json"; printf 'PASS %s\n' "$1"; }

for ((attempt=0;attempt<60;attempt++)); do
  if curl -fsS --max-time 2 "http://$NGINX_IP:8080/api/groups?size=1" | jq -e '.success' >/dev/null; then break; fi
  sleep 0.2
done
sample() {
  local body code okay scenario
  body=$DIR/sample-body
  while :; do
    scenario=$(cat "$DIR/scenario")
    code=$(curl -sS --max-time 2 -o "$body" -w '%{http_code}' "http://$NGINX_IP:8080/api/groups?size=1") || code=000
    okay=false; if [[ $code == 200 ]] && jq -e '.success==true' "$body" >/dev/null 2>&1; then okay=true; fi
    printf '%s %s %s %s\n' "$(date +%s)" "$scenario" "$code" "$okay" >> "$DIR/http-samples.log"
    sleep 0.1
  done
}
sample & SAMPLER=$!
printf 'bootstrap\n' > "$DIR/scenario"
coor plan bootstrap-plan
app bootstrap A bootstrap-app
APP_RESULT=$(receipt bootstrap-app); coor finish-bootstrap bootstrap-finish
phase COMPLETE; record bootstrap

prepare_switch() {
  local name=$1 old target actual_ip expected_ip
  RUN=$((RUN+1)); MODE=deploy
  printf '%s\n' "$name" > "$DIR/scenario"
  APP_RESULT='' TARGET_RESULT=''
  coor plan "$name-plan"
  old=$(slot old); target=$(slot target)
  if docker inspect "$PREFIX-$target" >/dev/null 2>&1 && [[ $(docker inspect --format '{{.State.Running}}' "$PREFIX-$target") == true ]]; then
    STOP_ONLY=true app prepare "$target" "$name-standby-stop"
  fi
  start_app "$target" "$DIGEST"
  actual_ip=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PREFIX-$target")
  expected_ip=$(jq -r --arg slot "$target" '.topology[($slot|ascii_downcase)].upstream|split(":")[0]' "$DIR/config.json")
  [[ $actual_ip == "$expected_ip" ]] || { printf 'Fixture address changed: %s != %s\n' "$actual_ip" "$expected_ip" >&2; return 1; }
  app prepare "$target" "$name-prepare"
  APP_RESULT=$(receipt "$name-prepare"); coor grant-handoff "$name-grant-handoff"
  app handoff "$old" "$name-handoff"
  APP_RESULT=$(receipt "$name-handoff"); coor switch "$name-switch"
  app activate "$target" "$name-activate"
  APP_RESULT=$(receipt "$name-activate"); coor grant-observe "$name-grant-observe"
}
finish_deploy() {
  local name=$1 old target app_pid coor_pid
  old=$(slot old); target=$(slot target)
  VIRTUAL=true app observe "$target" "$name-observe-app" & app_pid=$!
  VIRTUAL=true coor observe "$name-observe-http" & coor_pid=$!
  wait "$app_pid"; wait "$coor_pid"
  TARGET_RESULT=$(receipt "$name-observe-app"); coor seal "$name-seal"; TARGET_RESULT=
  app complete "$target" "$name-complete"
  APP_RESULT=$(receipt "$name-complete"); coor grant-stop "$name-grant-stop"
  app stop "$old" "$name-stop-app"
  APP_RESULT=$(receipt "$name-stop-app"); coor stop "$name-stop-ec2"
  phase COMPLETE
  [[ $(cat "$DIR/ec2-$old") == stopped && $(cat "$DIR/ec2-$target") == running ]]
  jq -e '.normal_exit and .shutdown_evidence.signal=="SIGTERM" and .shutdown_evidence.oom_killed==false' "$DIR/receipts/$name-stop-app.json" >/dev/null
  record "$name"
}
DIGEST=$IMAGE_B; prepare_switch A-to-B; finish_deploy A-to-B
DIGEST=$IMAGE_C; prepare_switch B-to-A; finish_deploy B-to-A
DIGEST=$IMAGE_D; prepare_switch normal-rollback
coor rollback-http normal-rollback-http
app rollback B normal-rollback-target
APP_RESULT=$(receipt normal-rollback-target); coor grant-rollback-old normal-rollback-grant-old
app rollback A normal-rollback-old
APP_RESULT=$(receipt normal-rollback-old); coor finish-rollback normal-rollback-finish
phase ROLLED_BACK; record normal-rollback

DIGEST=$IMAGE_E; prepare_switch killed-target
before_revision=$(jq -r '.authority.authorityRevision' "$DIR/receipts/killed-target-activate.json")
printf 'kill-window\n' > "$DIR/scenario"
docker kill --signal KILL "$PREFIX-B" > "$DIR/kill-result"
coor rollback-http killed-target-http
if app rollback B killed-target-rollback; then printf 'A dead target unexpectedly released its worker authority\n' >&2; exit 1; fi
coor interrupt killed-target-interrupt
phase NEEDS_ATTENTION
printf 'http-only-recovered\n' > "$DIR/scenario"
sleep 2
docker run --rm --network "container:$PREFIX-A" "$TOOLS_IMAGE" \
  curl -fsS --max-time 3 -H "X-Jarihana-Worker-Control-Token: $TOKEN" \
  http://127.0.0.1:8081/actuator/workercontrol > "$DIR/receipts/http-only-old-snapshot.json"
jq -e --argjson revision "$before_revision" '.worker.state=="PAUSED" and .authority.owner.hostId=="dev-b" and .authority.authorityRevision==$revision and .authority.status=="ACTIVE"' "$DIR/receipts/http-only-old-snapshot.json" >/dev/null
jq -e '.http_recovered and (.worker_recovered|not) and .pending.operation=="rollback" and .pending.slot=="B"' "$DIR/state/state.json" >/dev/null
[[ $(cat "$DIR/ec2-A") == running && $(cat "$DIR/ec2-B") == running ]]
[[ $(docker inspect --format '{{.State.Running}}' "$PREFIX-A") == true ]]
[[ $(docker inspect --format '{{.State.Running}}' "$PREFIX-B") == false ]]
record killed-target-http-only-attention
kill "$SAMPLER"; wait "$SAMPLER" 2>/dev/null || true; SAMPLER=
awk '$2!="kill-window" && $4!="true" {bad++} END {exit bad>0}' "$DIR/http-samples.log"
samples=$(wc -l < "$DIR/http-samples.log")
(( samples>=20 ))
jq -cn --argjson samples "$samples" '{success:true,scenarios:["bootstrap","A-to-B","B-to-A","normal-rollback","killed-target-http-only-attention"],http_samples:$samples,observation_duration:"virtual 900 seconds per observer",actual_components:["two Spring JVMs","Postgres","Nginx","Prometheus"],fixture_boundaries:["GitHub run API","EC2 API","host identity/bootstrap","readonly SSH transport","manual local JAR candidate preparation"],coverage_gap:"Does not verify immutable Compose pull/profile or a real 15-minute soak; production worker CAS, normal SIGTERM stop, journal/grants, Nginx generation switch/drain and Prometheus queries execute unchanged."}' > "$DIR/summary.json"
cat "$DIR/summary.json"
