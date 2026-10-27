#!/usr/bin/env bash
# One-time, manually dispatched candidate preparation. Does not switch traffic or worker authority.
set -Eeuo pipefail
set +x
umask 077

[[ ${GITHUB_REPOSITORY:-} == woowacourse-teams/2026-jarihana ]]
[[ ${GITHUB_EVENT_NAME:-} == workflow_dispatch && ${GITHUB_RUN_ATTEMPT:-} == 1 ]]
[[ ${GITHUB_REF:-} == refs/heads/chore/prod-candidate-preparation-20261027 ]]
[[ ${CANDIDATE_CONFIRM:-} == prepare-candidate ]]
[[ $(id -un) == jarihana-runner ]]
[[ $(git -C "$GITHUB_WORKSPACE" rev-parse HEAD:backend) == 98cc37dbc6c32da88dd4fb7723e86d77f1bd993e ]]
[[ ${BG_CONTROL_REF:-} == refs/tags/deployment-control-prod-20261027-01 ]]
[[ ${BG_PROD_ENABLED:-false} == false && ${BG_DEV_ENABLED:-false} == false ]]
[[ ${RDS_URL:-} == jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com ]]
[[ ${DB_USERNAME:-} == jarihana_prod ]]
[[ ${BLUE_GREEN_RDS_URL:-$RDS_URL} == "$RDS_URL" ]]

source "$GITHUB_WORKSPACE/control/infra/scripts/deploy/actions/common.sh"
bg_config /etc/jarihana-deploy/prod/app-A.json
[[ $(jq -r '.topology.control.ref' <<<"$CONFIG") == "$BG_CONTROL_REF" ]]
[[ $(git -C "$GITHUB_WORKSPACE/control" rev-parse HEAD) == $(jq -r '.topology.control.sha' <<<"$CONFIG") ]]
[[ $(jq -r '.local_slot' <<<"$CONFIG") == A && $(jq -r '.topology.environment' <<<"$CONFIG") == prod ]]
bg_machine i-0430ff91d1af2fb37
[[ $(jq -r '.topology.a.instance_id' <<<"$CONFIG") == i-0430ff91d1af2fb37 ]]
[[ $(jq -r '.topology.a.host_id' <<<"$CONFIG") == jarihana-prod2-ec2 ]]

compose=$(jq -r '.compose_file' <<<"$CONFIG")
bg_root_file "$compose"
cmp -s "$compose" "$GITHUB_WORKSPACE/control/infra/deploy/controller/app-compose.yml"
token_file=$(jq -r '.worker_token_file' <<<"$CONFIG")
bg_root_file "$token_file" 65536 true
WORKER_CONTROL_TOKEN=$(cat "$token_file")
[[ ${#WORKER_CONTROL_TOKEN} -ge 32 && "$WORKER_CONTROL_TOKEN" =~ ^[a-zA-Z0-9._~+/=-]+$ ]]
printf '::add-mask::%s\n' "$WORKER_CONTROL_TOKEN"
export WORKER_CONTROL_TOKEN

APP_DIR=/var/lib/jarihana-deploy/prod/app-A
[[ -d "$APP_DIR" && ! -L "$APP_DIR" && -O "$APP_DIR" ]]
cd "$APP_DIR"
exec 9>"$APP_DIR/lock"
flock -n 9 || bg_die 'An app operation is already running.'
for intent in "$APP_DIR/worker-intent.json" "$APP_DIR/stop-intent.json"; do
  [[ ! -e $intent ]] || bg_die 'Previous deployment intent exists; preserve state.'
done
grant_key=$(jq -r '.journal_key' <<<"$CONFIG")
known_hosts=$(jq -r '.known_hosts' <<<"$CONFIG")
bg_root_file "$grant_key" 16384 true
bg_root_file "$known_hosts"
grant_status=0
grant_output=$(timeout 10 ssh -nT -i "$grant_key" -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$known_hosts" -o ConnectTimeout=3 -o ConnectionAttempts=1 \
  jarihana-grant@10.0.3.51 2>/dev/null) || grant_status=$?
[[ $grant_status == 1 && -z $grant_output ]] || bg_die 'Initial coordinator journal is not confirmed absent.'
container=$(jq -r '.container_name' <<<"$CONFIG")
project=$(jq -r '.project' <<<"$CONFIG")
[[ $container == jarihana-bluegreen-prod-backend-a && $project == jarihana-bluegreen-prod-a ]]
[[ -z $(docker ps -aq --no-trunc --filter "name=^/$container$") ]] || bg_die 'Candidate container already exists; do not replace it.'
[[ -z $(ss -H -ltn | awk '$4 ~ /:(8080|8081)$/ {print}') ]] || bg_die 'Candidate port is already in use.'
available_kib=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
(( available_kib >= 1048576 )) || bg_die 'Less than 1 GiB RAM available; do not start candidate.'

export BACKEND_IMAGE=ghcr.io/woowacourse-teams/jarihana-backend
export BACKEND_DIGEST=sha256:a35efadd43277149f29641b2cbb26b2999411da84fa3bbb29eb311ce93461e32
export DEPLOY_ENVIRONMENT=prod DEPLOY_HOST_ID=jarihana-prod2-ec2
export APP_BIND_ADDRESS=127.0.0.1 APP_PORT=8080 MANAGEMENT_PORT=8081
export DEPLOY_CONTAINER="$container" DEPLOY_DB_NAME=jarihana_prod
[[ ${PUSH_ENABLED:-} == true && ${PUSH_WORKER_ENABLED:-} == true ]]
args=(docker compose --project-name "$project" --env-file /dev/null -f "$compose")
"${args[@]}" config --quiet >/dev/null 2>&1 || bg_die 'Compose configuration is invalid.'
timeout 150 "${args[@]}" pull backend >/dev/null || bg_die 'Image pull failed.'
timeout 150 "${args[@]}" up -d --no-build --pull never backend >/dev/null || bg_die 'Candidate startup uncertain; preserve the container.'

inspect_safe() {
  docker inspect "$container" | jq -e --arg digest "$BACKEND_DIGEST" --arg image "$BACKEND_IMAGE" --arg host "$DEPLOY_HOST_ID" --arg db "jdbc:postgresql://${RDS_URL}:5432/jarihana_prod?sslmode=require" '
    .[0] as $c | [$c.Config.Env[] | capture("^(?<key>[^=]+)=(?<value>.*)$")] as $p | ($p|from_entries) as $e |
    ($p|map(.key)|length)==($p|map(.key)|unique|length)
    and $c.State.Running and $c.HostConfig.RestartPolicy.Name=="no"
    and $c.Config.Image==($image+"@"+$digest) and $e.APP_VERSION==$digest
    and $e.DB_URL==$db and $e.DB_USERNAME=="jarihana_prod" and $e.SPRING_PROFILES_ACTIVE=="prod"
    and $e.PUSH_WORKER_CONTROL_ENABLED=="true" and $e.PUSH_WORKER_START_PAUSED=="true"
    and $e.PUSH_WORKER_HOST_ID==$host and $e.PUSH_WORKER_ENVIRONMENT=="prod"
    and $e.WORKER_CONTROL_TOKEN==env.WORKER_CONTROL_TOKEN
    and ($c.HostConfig.PortBindings["8080/tcp"]==[{HostIp:"127.0.0.1",HostPort:"8080"}])
    and ($c.HostConfig.PortBindings["8081/tcp"]==[{HostIp:"127.0.0.1",HostPort:"8081"}])' >/dev/null
}
inspect_safe || bg_die 'Candidate identity or loopback binding differs; preserve the container.'

worker_status() {
  printf 'header = "X-Jarihana-Worker-Control-Token: %s"\n' "$WORKER_CONTROL_TOKEN" |
    curl -q --config - --silent --show-error --fail --noproxy '*' --max-redirs 0 --connect-timeout 2 --max-time 5 --max-filesize 65536 http://127.0.0.1:8081/actuator/workercontrol
}
deadline=$((SECONDS+600))
while (( SECONDS < deadline )); do
  [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]] || bg_die 'Candidate stopped during startup; preserve it for investigation.'
  if health=$(curl --silent --fail --noproxy '*' --connect-timeout 2 --max-time 3 http://127.0.0.1:8081/actuator/health/readiness) && \
     worker=$(worker_status 2>/dev/null) && \
     jq -e '.status=="UP"' <<<"$health" >/dev/null && \
     jq -e --arg host "$DEPLOY_HOST_ID" --arg digest "$BACKEND_DIGEST" '
       .environment=="prod" and .identity.hostId==$host and .version==$digest and
       .worker.state=="PAUSED" and .worker.inFlight==0 and .worker.unresolved==0 and
       (.authority==null or (.authority.owner==null and .authority.status=="UNASSIGNED"))' <<<"$worker" >/dev/null; then
    inspect_safe
    printf '%s\n' "$worker" | jq '{environment,identity,version,worker,authority}'
    printf 'PROD_CANDIDATE_READY_PAUSED_LOOPBACK_ONLY\n'
    exit 0
  fi
  sleep 5
done
bg_die 'Candidate readiness or paused worker could not be verified; preserve it for investigation.'
