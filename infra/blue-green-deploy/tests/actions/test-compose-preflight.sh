#!/usr/bin/env bash
# Docker Compose parses locally; these tests do not start containers or contact a registry.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
HELPER=$ROOT/infra/blue-green-deploy/scripts/actions/compose-preflight.sh
SOURCE=$ROOT/infra/blue-green-deploy/controller/app-compose.yml
TEST_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEST_DIR"' EXIT
docker compose --project-name jarihana-preflight --env-file /dev/null -f "$SOURCE" \
  config --no-interpolate --no-env-resolution --no-path-resolution --format json >"$TEST_DIR/base.json"
check() { bash "$HELPER" "$1" "${2:-prod}" >"$TEST_DIR/result" 2>&1; }
rejects() {
  if check "$1" "${2:-prod}"; then echo "Unexpected Compose acceptance: $name" >&2; exit 1; fi
  grep -q '::error::' "$TEST_DIR/result"
}
name=production_template
check "$SOURCE"
echo "PASS compose-preflight $name"
name=development_template
check "$SOURCE" dev
echo "PASS compose-preflight $name"
name=invalid_yaml
printf 'services: [\n' >"$TEST_DIR/invalid.yml"
rejects "$TEST_DIR/invalid.yml"
echo "PASS compose-preflight $name"
while IFS='|' read -r name change; do
  jq "$change" "$TEST_DIR/base.json" >"$TEST_DIR/changed.json"
  rejects "$TEST_DIR/changed.json"
  echo "PASS compose-preflight $name"
done <<'CASES'
restart_policy|.services.backend.restart="always"
missing_restart|del(.services.backend.restart)
deployment_restart_override|.services.backend.deploy.restart_policy.condition="any"
host_network|del(.services.backend.networks) | .services.backend.network_mode="host"
image|.services.backend.image="unrelated:latest"
container_name|.services.backend.container_name="other"
version|.services.backend.environment.APP_VERSION="latest"
database|.services.backend.environment.DB_URL="jdbc:postgresql://other:5432/other"
profile|.services.backend.environment.SPRING_PROFILES_ACTIVE="dev"
worker_control|.services.backend.environment.PUSH_WORKER_CONTROL_ENABLED="false"
worker_start_paused|.services.backend.environment.PUSH_WORKER_START_PAUSED="false"
worker_start_paused_list_value|.services.backend.environment.PUSH_WORKER_START_PAUSED="true\n" | .services.backend.environment |= (to_entries | map(.key+"="+.value))
worker_host|.services.backend.environment.PUSH_WORKER_HOST_ID="other"
worker_environment|.services.backend.environment.PUSH_WORKER_ENVIRONMENT="dev"
worker_token|.services.backend.environment.WORKER_CONTROL_TOKEN="literal"
public_management_port|.services.backend.ports[1]="0.0.0.0:${MANAGEMENT_PORT:?}:8081"
wrong_management_port|.services.backend.ports[1]="127.0.0.1:9091:8081"
wrong_app_port|.services.backend.ports[0]="${APP_BIND_ADDRESS:?}:${APP_PORT:?}:9090"
extra_management_binding|.services.backend.ports += ["0.0.0.0:9091:8081"]
unrelated_service_cannot_satisfy_contract|.services.decoy=.services.backend | .services.decoy.container_name="decoy" | .services.backend.restart="always"
CASES
name=comment_cannot_satisfy_contract
sed 's/restart: "no"/restart: "always" # restart: "no"/' "$SOURCE" >"$TEST_DIR/comment.yml"
rejects "$TEST_DIR/comment.yml"
echo "PASS compose-preflight $name"
name=memory_and_application_settings_allowed
jq '.services.backend.mem_limit="1024m" | .services.backend.environment.GOMOKU_CHAT_ENABLED="true" | .services.backend.environment.EXTRA_APPLICATION_OPTION="enabled"' "$TEST_DIR/base.json" >"$TEST_DIR/changed.json"
check "$TEST_DIR/changed.json"
echo "PASS compose-preflight $name"
name=port_order_allowed
jq '.services.backend.ports |= reverse' "$TEST_DIR/base.json" >"$TEST_DIR/changed.json"
check "$TEST_DIR/changed.json"
echo "PASS compose-preflight $name"
name=environment_list_syntax_allowed
jq '.services.backend.environment |= (to_entries | map(.key+"="+.value))' "$TEST_DIR/base.json" >"$TEST_DIR/changed.json"
check "$TEST_DIR/changed.json"
echo "PASS compose-preflight $name"
for setting in PUSH_ENABLED PUSH_WORKER_ENABLED; do
  name=dev_$setting
  jq --arg setting "$setting" '.services.backend.environment[$setting]="false"' "$TEST_DIR/base.json" >"$TEST_DIR/changed.json"
  rejects "$TEST_DIR/changed.json" dev
  check "$TEST_DIR/changed.json" prod
  echo "PASS compose-preflight $name"
done
name=no_environment_interpolation
BACKEND_DIGEST=must-not-be-rendered WORKER_CONTROL_TOKEN=must-not-be-rendered check "$SOURCE"
! grep -q must-not-be-rendered "$TEST_DIR/result"
echo "PASS compose-preflight $name"
