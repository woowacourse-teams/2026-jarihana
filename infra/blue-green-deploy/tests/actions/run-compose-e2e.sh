#!/usr/bin/env bash
# Local registry/TLS database fixtures; production prepare/profile/Compose execute unchanged.
# shellcheck disable=SC1091,SC2034,SC2317
set -Eeuo pipefail
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
: "${BG_COMPOSE_IMAGE:?Set BG_COMPOSE_IMAGE to an image built from the unchanged backend/Dockerfile}"
TOOLS_IMAGE=jarihana-actions-test:local
if [[ ${BG_COMPOSE_INNER:-false} != true ]]; then
  docker image inspect "$BG_COMPOSE_IMAGE" >/dev/null
  DIR=$(mktemp -d /private/tmp/jarihana-compose-e2e.XXXXXX)
  PREFIX=jarihana-compose-${DIR##*.}; PREFIX=$(printf '%s' "$PREFIX" | tr '[:upper:]' '[:lower:]')
  evidence="$ROOT/local-plans/blue-green-deployment/artifacts/$PREFIX"
  mkdir -p "$evidence"
  mkdir -p "$DIR/etc" "$DIR/app"
  cleanup_outer() {
    docker rm -fv "$PREFIX-daemon" >/dev/null 2>&1 || true
    docker volume rm "$PREFIX-socket" >/dev/null 2>&1 || true
    rm -f "$DIR/fixture-images.tar"
    cp -R "$DIR/." "$evidence/"
    printf 'Saved Compose evidence: %s\n' "$evidence"
  }
  trap cleanup_outer EXIT
  docker save "$BG_COMPOSE_IMAGE" postgres:17 registry:2 "$TOOLS_IMAGE" > "$DIR/fixture-images.tar"
  docker run -d --privileged --name "$PREFIX-daemon" --label "com.jarihana.compose-e2e=$PREFIX" \
    -v "$DIR:$DIR" -v "$PREFIX-socket:/socket" -e DOCKER_TLS_CERTDIR= docker:27-dind \
    dockerd --host=unix:///socket/docker.sock --tls=false > "$DIR/daemon-id"
  for ((i=0;i<60;i++)); do if docker exec "$PREFIX-daemon" docker -H unix:///socket/docker.sock info >/dev/null 2>&1; then break; fi; sleep 1; done
  docker run --rm --network "container:$PREFIX-daemon" --name "$PREFIX-runner" \
    -v "$ROOT:/repo:ro" -v "$DIR:$DIR" -v "$PREFIX-socket:/socket" -e DOCKER_HOST=unix:///socket/docker.sock \
    -v "$DIR/etc:/etc/jarihana-deploy/dev" -v "$DIR/app:/var/lib/jarihana-deploy/dev/app-B" \
    -e BG_COMPOSE_IMAGE -e BG_COMPOSE_INNER=true -e DIR="$DIR" -e PREFIX="$PREFIX" -e HOST_ROOT="$ROOT" \
    "$TOOLS_IMAGE" bash /repo/infra/blue-green-deploy/tests/actions/run-compose-e2e.sh 2>&1 | tee "$evidence/run.log"
  exit
fi
: "${DIR:?}" "${PREFIX:?}" "${HOST_ROOT:?}"
[[ $DIR == /private/tmp/jarihana-compose-e2e.* && $PREFIX == jarihana-compose-* ]] || exit 2
ROOT=/repo
PROJECT=$PREFIX; CONTAINER=$PREFIX-backend; NETWORK=${PROJECT}_default
mkdir -p "$DIR"/{build,logs,bin,etc,app}
chmod 700 "$DIR" "$DIR"/{build,logs,bin,etc,app}
cleanup() {
  local status=$? name
  trap - EXIT
  printf '%s\n' "$status" > "$DIR/exit-code"
  for name in "$CONTAINER" "$PREFIX-db" "$PREFIX-registry" "$PREFIX-ports"; do
    if docker inspect "$name" >/dev/null 2>&1; then
      docker logs "$name" > "$DIR/logs/$name.log" 2>&1 || true
      docker rm -f "$name" >/dev/null || true
    fi
  done
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  # Only this invocation's named local registry repository is eligible for image cleanup.
  if [[ -n ${IMAGE_REPOSITORY:-} ]]; then
    docker image rm "$IMAGE_REPOSITORY:fixture" >/dev/null 2>&1 || true
    [[ -z ${DIGEST:-} ]] || docker image rm "$IMAGE_REPOSITORY@$DIGEST" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT
docker load < "$DIR/fixture-images.tar" > "$DIR/logs/load.log"
rm "$DIR/fixture-images.tar"
label=(--label "com.jarihana.compose-e2e=$PREFIX")
docker network create "${label[@]}" --label "com.docker.compose.project=$PROJECT" --label com.docker.compose.network=default "$NETWORK" >/dev/null
docker run -d --name "$PREFIX-registry" "${label[@]}" -p 127.0.0.1::5000 registry:2 > "$DIR/registry-id"
REGISTRY_PORT=$(docker inspect "$PREFIX-registry" --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}')
IMAGE_REPOSITORY=127.0.0.1:$REGISTRY_PORT/$PREFIX/backend
for ((i=0;i<30;i++)); do if curl -fsS "http://127.0.0.1:$REGISTRY_PORT/v2/" >/dev/null 2>&1; then break; fi; sleep 1; done
docker image inspect "$BG_COMPOSE_IMAGE" --format '{{.Id}}' > "$DIR/source-image-id"
docker tag "$BG_COMPOSE_IMAGE" "$IMAGE_REPOSITORY:fixture"
docker push "$IMAGE_REPOSITORY:fixture" > "$DIR/logs/push.log" 2>&1
DIGEST=$(docker image inspect "$IMAGE_REPOSITORY:fixture" --format '{{index .RepoDigests 0}}'); DIGEST=${DIGEST##*@}
[[ $DIGEST =~ ^sha256:[a-f0-9]{64}$ ]]
printf '%s@%s\n' "$IMAGE_REPOSITORY" "$DIGEST" > "$DIR/immutable-image"
# Remove the imported source tag too, in this invocation's disposable daemon only.
docker image rm "$BG_COMPOSE_IMAGE" > "$DIR/logs/evict.log" 2>&1
docker image rm "$IMAGE_REPOSITORY:fixture" >> "$DIR/logs/evict.log" 2>&1
if docker image inspect "$IMAGE_REPOSITORY@$DIGEST" >/dev/null 2>&1; then
  docker image rm "$IMAGE_REPOSITORY@$DIGEST" >> "$DIR/logs/evict.log" 2>&1
fi
if docker image inspect "$(cat "$DIR/source-image-id")" >/dev/null 2>&1; then exit 1; fi
if docker image inspect "$IMAGE_REPOSITORY@$DIGEST" >/dev/null 2>&1; then exit 1; fi
printf 'PASS locally pushed fixture digest evicted before production pull\n'
# The official Postgres image contains openssl; private self-signed TLS serves sslmode=require.
docker run -d --name "$PREFIX-db" "${label[@]}" --network "$NETWORK" \
  -e POSTGRES_USER=fixture -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=jarihana_dev \
  --entrypoint bash postgres:17 -ec 'openssl req -new -x509 -nodes -days 1 -subj /CN=local-fixture -keyout /tmp/server.key -out /tmp/server.crt >/dev/null 2>&1; chown postgres:postgres /tmp/server.key /tmp/server.crt; chmod 600 /tmp/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key' > "$DIR/db-id"
for ((i=0;i<60;i++)); do if docker exec "$PREFIX-db" pg_isready -U fixture >/dev/null 2>&1; then break; fi; sleep 1; done
docker exec "$PREFIX-db" psql -U fixture -d jarihana_dev -Atc 'show ssl' | tee "$DIR/db-tls.txt" | grep -qx on
# Reserve two unused loopback ports, then release them immediately before Compose owns them.
docker run -d --name "$PREFIX-ports" "${label[@]}" -p 127.0.0.1::8080 -p 127.0.0.1::8081 --entrypoint sleep "$TOOLS_IMAGE" infinity >/dev/null
APP_PORT=$(docker inspect "$PREFIX-ports" --format '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}')
MANAGEMENT_PORT=$(docker inspect "$PREFIX-ports" --format '{{(index (index .NetworkSettings.Ports "8081/tcp") 0).HostPort}}')
docker rm -f "$PREFIX-ports" >/dev/null
cp "$ROOT/infra/blue-green-deploy/controller/app-compose.yml" "$DIR/etc/app-compose.yml"
printf 'local-compose-fixture-machine-token-0123456789abcdef\n' > "$DIR/etc/worker-token"
printf 'fixture\n' > "$DIR/etc/grant-key"; printf 'fixture\n' > "$DIR/etc/known-hosts"
chmod 600 "$DIR/etc/"*
cat > "$DIR/bin/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cat "$DIR/state.json"
EOF
chmod 700 "$DIR/bin/ssh"
jq --arg image "$IMAGE_REPOSITORY" --arg name "$CONTAINER" --arg project "$PROJECT" --argjson app "$APP_PORT" --argjson management "$MANAGEMENT_PORT" '
 .image_repository=$image|.container_name=$name|.project=$project|.app_port=$app|.management_port=$management|.topology.b.upstream=("127.0.0.1:"+($app|tostring))|.coordinator_address="127.0.0.1"' "$ROOT/infra/blue-green-deploy/controller/full-app-B.example.json" > "$DIR/config.json"
cat > "$DIR/command.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
source /repo/infra/blue-green-deploy/scripts/actions/app.sh
bg_init() {
 ENVIRONMENT=dev RUN_ID=101 ATTEMPT=1 BRANCH=develop
 GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa CONTROL_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
 REPO=woowacourse-teams/2026-jarihana WORKFLOW_ID=9
 CONFIG=$(cat "$DIR/config.json")
 bg_live
}
bg_github() {
 jq -cn '{id:101,run_attempt:1,head_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",head_branch:"develop",workflow_id:9,path:".github/workflows/backend-dev-deploy.yml",event:"workflow_dispatch",repository:{id:1321030074,full_name:"woowacourse-teams/2026-jarihana"},head_repository:{id:1321030074,full_name:"woowacourse-teams/2026-jarihana"},status:"in_progress",conclusion:null}'
}
main prepare
EOF
chmod 700 "$DIR/command.sh"
export DIR BG_ENVIRONMENT=dev BG_MODE=deploy BG_SLOT=B
export RDS_URL=$PREFIX-db BLUE_GREEN_RDS_URL=$PREFIX-db DB_USERNAME=fixture DB_PASSWORD=fixture
export INVITATION_TOKEN_KEY_PRIMARY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY= ACCESS_TOKEN_SECRET=local-fixture-jwt-secret-0123456789abcdef
export FRONTEND_ORIGIN=http://localhost GITHUB_OAUTH_CLIENT_ID=fixture GITHUB_OAUTH_CLIENT_SECRET=fixture GITHUB_OAUTH_REDIRECT_URI=http://localhost/oauth
export IMAGE_S3_BUCKET=fixture IMAGE_S3_REGION=ap-northeast-2 IMAGE_S3_KEY_PREFIX=fixture IMAGE_S3_PUBLIC_BASE_URL=http://localhost/fixture
export IMAGE_CDN_DELIVERY_BASE_URL=https://fixture.example.test/images IMAGE_CLOUDFRONT_KEY_PAIR_ID=local-fixture-key-id
export IMAGE_CLOUDFRONT_PRIVATE_KEY=$'-----BEGIN PRIVATE KEY-----\nlocal-compose-fixture\n-----END PRIVATE KEY-----'
write_grant() {
 local image=$1 now
 now=$(date +%s)
 jq -cn --arg image "$image" --arg topology "$(jq -Sc '.topology' "$DIR/config.json" | sha256sum | cut -d ' ' -f 1)" --argjson now "$now" '
 {schema_version:2,environment:"dev",run_id:101,attempt:1,sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",control_sha:"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",mode:"deploy",image:$image,topology_digest:$topology,old:"A",target:"B",phase:"PREPARING",expires_at:($now+1800),created_at:$now,heartbeat:$now,deployment_id:"11111111-1111-1111-1111-111111111111",pending:{id:"22222222-2222-2222-2222-222222222222",operation:"prepare",slot:"B",deadline:($now+1500)},switched:false,sealed:false}' > "$DIR/state.json"
}
runner() {
 local image=$1 name=$2
 BG_IMAGE_DIGEST="$image" GITHUB_OUTPUT="$DIR/$name.output" \
 PATH="$DIR/bin:$PATH" bash "$DIR/command.sh" > "$DIR/logs/$name.log" 2>&1
}

record() { printf 'PASS %s\n' "$1" | tee -a "$DIR/cases.log"; }
# A missing digest must fail during the real pull, before creating a candidate.
BAD_DIGEST=sha256:$(printf 'f%.0s' {1..64})
write_grant "$BAD_DIGEST"
cp "$DIR/state.json" "$DIR/state-before-failure.json"
if runner "$BAD_DIGEST" invalid-digest; then exit 1; fi
grep -q 'Image pull failed' "$DIR/logs/invalid-digest.log"
if docker inspect "$CONTAINER" >/dev/null 2>&1; then exit 1; fi
cmp "$DIR/state.json" "$DIR/state-before-failure.json"
record invalid-digest-preserves-old-slot-and-prevents-promotion
# Installation tampering must fail before contacting the registry or creating a candidate.
printf '\n# local tampering probe\n' >> "$DIR/etc/app-compose.yml"
write_grant "$DIGEST"
if runner "$DIGEST" modified-compose; then exit 1; fi
grep -q 'Installed Compose differs' "$DIR/logs/modified-compose.log"
if docker inspect "$CONTAINER" >/dev/null 2>&1; then exit 1; fi
cp "$ROOT/infra/blue-green-deploy/controller/app-compose.yml" "$DIR/etc/app-compose.yml"; chmod 600 "$DIR/etc/app-compose.yml"
record installed-compose-modification-rejected
write_grant "$DIGEST"
if ! runner "$DIGEST" prepare; then cat "$DIR/logs/prepare.log" >&2; exit 1; fi
record production-pull-prepare-profile-ready-paused
docker inspect "$CONTAINER" | jq -e '
  .[0].Config.Env | map(split("=") | {key:.[0], value:.[1:]|join("=")}) | from_entries |
  .IMAGE_CDN_DELIVERY_BASE_URL==env.IMAGE_CDN_DELIVERY_BASE_URL and
  .IMAGE_CLOUDFRONT_KEY_PAIR_ID==env.IMAGE_CLOUDFRONT_KEY_PAIR_ID and
  .IMAGE_CLOUDFRONT_PRIVATE_KEY==env.IMAGE_CLOUDFRONT_PRIVATE_KEY' >/dev/null
record image-cdn-and-multiline-signing-config-preserved
docker exec "$PREFIX-db" psql -U fixture -d jarihana_dev -Atc 'select count(*) from pg_stat_ssl where ssl and pid<>pg_backend_pid()' > "$DIR/db-tls-sessions.txt"
(( $(cat "$DIR/db-tls-sessions.txt") > 0 ))
# Save only sanitized metadata: environment includes fixture secrets and must not be persisted.
docker inspect "$CONTAINER" | jq '.[0]|{Id,Image,State,Config:{Image:.Config.Image,User:.Config.User,Entrypoint:.Config.Entrypoint,StopTimeout:.Config.StopTimeout,Graceful:(.Config.Env|map(select(startswith("SERVER_SHUTDOWN=") or startswith("SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE="))))},HostConfig:{RestartPolicy:.HostConfig.RestartPolicy,Memory:.HostConfig.Memory,PortBindings:.HostConfig.PortBindings}}' > "$DIR/container-profile.json"
jq -e '.State.Running and .HostConfig.Memory==939524096 and .HostConfig.RestartPolicy.Name=="no" and .Config.StopTimeout==120 and .Config.User=="app" and .Config.Entrypoint==["java","-jar","app.jar"] and (.Config.Graceful|sort)==["SERVER_SHUTDOWN=graceful","SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE=90s"]' "$DIR/container-profile.json" >/dev/null
awk '/^result<</{body=1;next} body&&/^bg-/{exit} body{print}' "$DIR/prepare.output" > "$DIR/prepare.json"
jq -e --arg digest "$DIGEST" '.healthy and .version==$digest and .worker.state=="PAUSED" and .worker.inFlight==0 and .worker.unresolved==0 and .activity.backgroundDrained and .authority.owner==null' "$DIR/prepare.json" >/dev/null
# A healthy but unassigned existing candidate cannot prove the other host owns shutdown authority.
id_before=$(docker inspect "$CONTAINER" --format '{{.Id}}')
if runner "$DIGEST" unsafe-standby; then exit 1; fi
grep -q 'Application state is unsafe' "$DIR/logs/unsafe-standby.log"
[[ $(docker inspect "$CONTAINER" --format '{{.Id}}') == "$id_before" ]]
[[ $(docker inspect "$CONTAINER" --format '{{.State.Running}}') == true ]]
record unsafe-existing-standby-replacement-blocked
# A normal SIGTERM confirms exact Compose graceful settings; this is fixture cleanup, not a deploy stop receipt.
docker stop --time 120 "$CONTAINER" > "$DIR/stop-result"
docker inspect "$CONTAINER" | jq '.[0]|{State,RestartCount}' > "$DIR/shutdown.json"
jq -e '(.State.Running|not) and (.State.OOMKilled|not) and (.State.ExitCode==0 or .State.ExitCode==143) and .RestartCount==0' "$DIR/shutdown.json" >/dev/null
record graceful-sigterm-normal-exit
sha256sum "$ROOT/infra/blue-green-deploy/controller/app-compose.yml" "$DIR/etc/app-compose.yml" > "$DIR/compose-sha256.txt"
jq -cn --arg image "$IMAGE_REPOSITORY@$DIGEST" '{success:true,image:$image,scenarios:["evicted-image-real-pull","invalid-digest-no-promotion","modified-compose-rejected","ready-paused-production-profile","image-signing-config-preserved","unsafe-standby-blocked","graceful-SIGTERM"],fixture_boundaries:["isolated privileged Linux Docker daemon with private Unix socket, no host ports","local registry instead of GHCR","Postgres with self-signed TLS instead of RDS","host identity/config bootstrap","GitHub read API","read-only SSH grant transport"],production_unchanged:["app_prepare","app_profile","app_snapshot","bg_grant","app-compose.yml"],remote_deployment:false}' > "$DIR/summary.json"
cat "$DIR/summary.json"
