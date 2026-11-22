#!/usr/bin/env bash
set -euo pipefail
umask 077

handoff_dir="$REALTIME_HANDOFF_ROOT/$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
origins=()
load_settings() {
  local target=$1 prefix=$2 key value masked origin
  if [[ ! -r "$handoff_dir/$target" ]]; then
    echo "Missing $target realtime settings on this runner. Start a develop dispatch with resume_digest=${REALTIME_IMAGE##*@}." >&2
    return 1
  fi
  {
    for key in TOKEN_KEY DB_JDBC_URL DB_USERNAME DB_PASSWORD; do
      IFS= read -r -d '' value || return 1
      case "$key" in
        TOKEN_KEY|DB_PASSWORD)
          masked=${value//%/%25}
          masked=${masked//$'\r'/%0D}
          masked=${masked//$'\n'/%0A}
          printf '::add-mask::%s\n' "$masked"
          ;;
      esac
      export "${prefix}_${key}=$value"
    done
    IFS= read -r -d '' origin || return 1
  } < "$handoff_dir/$target"
  origins+=("$origin")
}
load_settings dev REALTIME_DEV
load_settings prod REALTIME_PROD
export REALTIME_ALLOWED_ORIGINS="${origins[0]},${origins[1]}"
: "${MONITORING_BIND_ADDRESS:?Set the existing repository monitoring address variable}"
export PROMETHEUS_REMOTE_WRITE_URL="http://$MONITORING_BIND_ADDRESS:8080/prometheus/api/v1/write"
export LOKI_PUSH_URL="http://$MONITORING_BIND_ADDRESS:8080/loki/api/v1/push"

docker_plugins="${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins"
DOCKER_CONFIG=$(mktemp -d "$RUNNER_TEMP/realtime-docker.XXXXXX")
export DOCKER_CONFIG
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
if [[ -d "$docker_plugins" ]]; then
  ln -s "$(cd -- "$docker_plugins" && pwd)" "$DOCKER_CONFIG/cli-plugins"
fi
docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin <<< "$GHCR_TOKEN"
repo_read_token=$GHCR_TOKEN
unset GHCR_TOKEN

: "${REALTIME_IMAGE:?Set the GHCR image digest}"
if [[ ! "$REALTIME_IMAGE" =~ ^ghcr\.io/woowacourse-teams/jarihana-realtime@sha256:[a-f0-9]{64}$ ]]; then
  echo 'Expected a pinned jarihana-realtime image from GHCR.' >&2
  exit 1
fi

source_dir=${1:?Compose source directory}
state_dir=${2:?realtime state directory}
: "${CANDIDATE_REVISION:?Set the candidate source revision}"
read -r latest_revision latest_digest < "$state_dir/latest-candidate"
if [[ "$latest_revision" != "$CANDIDATE_REVISION" || "$latest_digest" != "${REALTIME_IMAGE##*@}" ]]; then
  echo 'The original candidate has been superseded. Keeping the current deployment.' >&2
  exit 1
fi

# Keep the Compose file and the Alloy bind mount together for rollback.
config_hash=$(cd "$source_dir" && sha256sum compose.yaml config.alloy | sha256sum)
config_dir="$state_dir/config/${config_hash%% *}"
mkdir -p -- "$config_dir"
for config_file in compose.yaml config.alloy; do
  if ! cmp -s -- "$source_dir/$config_file" "$config_dir/$config_file"; then
    install -m 600 -- "$source_dir/$config_file" "$config_dir/$config_file"
  fi
done

last_success="$state_dir/last-success"

compose() {
  local config_path=$1 image=$2
  shift 2
  REALTIME_IMAGE="$image" docker compose --project-name jarihana-realtime \
    --env-file /dev/null --file "$config_path/compose.yaml" "$@"
}

wait_for_health() {
  local config_path=$1 attempt endpoint=/actuator/health
  # The first release with Alloy moved the public-port health path.
  if [[ -f "$config_path/config.alloy" ]]; then
    endpoint=/healthz
  fi
  for ((attempt = 1; attempt <= 18; attempt++)); do
    if curl --fail --silent --show-error --max-time 3 --noproxy '*' \
      --output /dev/null "http://127.0.0.1:8080$endpoint"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

compose "$config_dir" "$REALTIME_IMAGE" config --quiet
compose "$config_dir" "$REALTIME_IMAGE" pull
# The digest is pulled locally before reading its source-revision label.
image_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$REALTIME_IMAGE")
if [[ "$image_revision" != "$CANDIDATE_REVISION" ]]; then
  echo 'Image revision differs from the selected configuration revision.' >&2
  exit 1
fi
# Compose run does not publish service ports or replace the running services.
if ! compose "$config_dir" "$REALTIME_IMAGE" run --rm --no-deps -T realtime --check-runtime --server.port=0; then
  echo "Runtime data unreadable in dev or prod. Keeping the current deployment. Resume on develop with resume_digest=${REALTIME_IMAGE##*@}." >&2
  exit 1
fi

# A newer develop push can arrive during setting preparation or while querying both databases.
# Pass the read-only token through process environment only; git writes no credentials to disk.
authorization=$(printf 'x-access-token:%s' "$repo_read_token" | base64 | tr -d '\n')
unset repo_read_token
GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=2 \
  GIT_CONFIG_KEY_0="http.$GITHUB_SERVER_URL/.extraheader" GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $authorization" \
  GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1= \
  git fetch --quiet --no-tags --no-recurse-submodules "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY.git" refs/heads/develop
unset authorization
bash infra/realtime/check-candidate-revision.sh "$CANDIDATE_REVISION" FETCH_HEAD

if compose "$config_dir" "$REALTIME_IMAGE" up -d --no-build --pull never --remove-orphans &&
  wait_for_health "$config_dir"; then
  pending_state=$(mktemp "$state_dir/last-success.XXXXXX")
  printf '%s\n%s\n' "$config_dir" "$REALTIME_IMAGE" > "$pending_state"
  mv -- "$pending_state" "$last_success"
  echo 'Realtime deploy is healthy.'
  if ! curl --fail --silent --show-error --max-time 3 --noproxy '*' \
    --retry 3 --retry-all-errors --retry-delay 2 --output /dev/null http://127.0.0.1:12345/-/ready; then
    echo '::warning::Realtime Alloy is not ready. Check the collector on the realtime EC2.'
  fi
  exit 0
fi

echo 'Realtime deploy failed.' >&2
if [[ -f "$last_success" ]]; then
  if { IFS= read -r previous_config && IFS= read -r previous_image; } < "$last_success" &&
    compose "$previous_config" "$previous_image" up -d --no-build --pull missing --remove-orphans &&
    wait_for_health "$previous_config"; then
    echo 'Restored the last successful realtime deployment.' >&2
  else
    echo 'The last successful realtime deployment could not be restored.' >&2
  fi
else
  echo 'No last successful deployment is recorded on this runner.' >&2
fi
exit 1
