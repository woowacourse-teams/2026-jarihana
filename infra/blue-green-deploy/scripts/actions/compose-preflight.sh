#!/usr/bin/env bash
# Validate the release template without secrets, image pulls or a Docker daemon.
set -euo pipefail
[[ $# == 2 && -f $1 && ( $2 == prod || $2 == dev ) ]] || {
  echo 'Usage: compose-preflight.sh COMPOSE_FILE prod|dev' >&2; exit 2;
}
if ! config=$(docker compose --project-name jarihana-preflight --env-file /dev/null -f "$1" \
  config --no-interpolate --no-env-resolution --no-path-resolution --format json 2>/dev/null); then
  echo '::error::Release Compose syntax or model is invalid' >&2; exit 1
fi
if ! jq -e --arg environment "$2" '
  .services.backend as $b |
  ($b.environment | if type=="array" then map(split("=") | {key:.[0],value:(.[1:]|join("="))}) | from_entries else . end) as $e |
  $b.restart=="no" and $b.deploy.restart_policy==null and $b.network_mode==null and
  $b.image=="${BACKEND_IMAGE:?}@${BACKEND_DIGEST:?}" and $b.container_name=="${DEPLOY_CONTAINER:?}" and
  $e.APP_VERSION=="${BACKEND_DIGEST:?}" and
  $e.DB_URL=="jdbc:postgresql://${RDS_URL:?}:5432/${DEPLOY_DB_NAME:?}?sslmode=require" and
  $e.SPRING_PROFILES_ACTIVE=="${DEPLOY_ENVIRONMENT:?}" and
  $e.PUSH_WORKER_CONTROL_ENABLED=="true" and $e.PUSH_WORKER_START_PAUSED=="true" and
  $e.PUSH_WORKER_HOST_ID=="${DEPLOY_HOST_ID:?}" and $e.PUSH_WORKER_ENVIRONMENT=="${DEPLOY_ENVIRONMENT:?}" and
  $e.WORKER_CONTROL_TOKEN=="${WORKER_CONTROL_TOKEN:?}" and
  ($environment!="dev" or ($e.PUSH_ENABLED=="${PUSH_ENABLED:-false}" and $e.PUSH_WORKER_ENABLED=="${PUSH_WORKER_ENABLED:-true}")) and
  ($b.ports | sort)==(["${APP_BIND_ADDRESS:?}:${APP_PORT:?}:8080","127.0.0.1:${MANAGEMENT_PORT:?}:8081"] | sort)
' <<<"$config" >/dev/null 2>&1; then
  echo '::error::Release Compose image, ports or worker/database startup contract differs' >&2; exit 1
fi
echo 'Release Compose preflight passed'
