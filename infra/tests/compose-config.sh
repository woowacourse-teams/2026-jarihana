#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo_root}"
result_dir="$(mktemp -d)"
trap 'rm -rf "${result_dir}"' EXIT

# Infra must resolve without application secrets or an application image tag.
env -i PATH="${PATH}" POSTGRES_PASSWORD=validation \
  docker compose --env-file /dev/null -p infra -f infra/docker-compose.yml \
  config --format json > "${result_dir}/infra.json"
jq -e '
  (.services | keys) == ["postgres"] and
  .volumes["postgres-data"].name == "infra_postgres-data" and
  .networks.default.name == "infra_default" and
  .services.postgres.ports[0].host_ip == "127.0.0.1" and
  .services.postgres.ports[0].published == "5432" and
  .services.postgres.ports[0].target == 5432
' "${result_dir}/infra.json" > /dev/null

env -i PATH="${PATH}" BACKEND_TAG=validation POSTGRES_PASSWORD=validation \
  FRONTEND_ORIGIN=https://example.invalid ACCESS_TOKEN_SECRET=validation \
  GITHUB_OAUTH_CLIENT_ID=validation GITHUB_OAUTH_CLIENT_SECRET=validation \
  GITHUB_OAUTH_REDIRECT_URI=https://example.invalid/callback \
  IMAGE_S3_BUCKET=validation IMAGE_S3_REGION=ap-northeast-2 \
  IMAGE_S3_KEY_PREFIX=validation IMAGE_S3_PUBLIC_BASE_URL=https://example.invalid/images \
  docker compose --env-file /dev/null -p jarihana-backend -f backend/docker-compose-prod.yaml \
  config --format json > "${result_dir}/backend.json"
jq -e '
  (.services | keys) == ["backend"] and
  (.services.backend | has("depends_on") | not) and
  (.volumes // {} | length) == 0 and
  .networks.default.name == "infra_default" and
  .networks.default.external == true and
  .services.backend.environment.DB_URL == "jdbc:postgresql://postgres:5432/jarihana"
' "${result_dir}/backend.json" > /dev/null

echo 'PASS: separate Compose services, existing DB volume, shared network, and loopback DB port'
