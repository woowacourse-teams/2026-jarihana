#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/../common/ec2-context.sh"
if [[ "${region}" != ap-northeast-2 ]]; then
  echo 'Service health collection is configured for Seoul.' >&2
  exit 1
fi

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "${temporary_dir}"' EXIT
metric_data='[]'
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

container_running() {
  local container_id="$1"
  if [[ -z "${container_id}" ]]; then
    printf '0'
    return
  fi
  local running
  running="$(timeout 5 docker inspect --format '{{.State.Running}}' "${container_id}")"
  if [[ "${running}" == true ]]; then printf '1'; else printf '0'; fi
}

add_metric() {
  local name="$1" value="$2" component="${3-}"
  metric_data="$(jq --arg name "${name}" --argjson value "${value}" \
    --arg environment "${environment}" --arg instance "${instance_id}" \
    --arg component "${component}" --arg timestamp "${timestamp}" \
    '. + [{MetricName:$name, Value:$value, Unit:"Count", Timestamp:$timestamp,
      Dimensions:([{Name:"application",Value:"jarihana"},
        {Name:"environment",Value:$environment},{Name:"InstanceId",Value:$instance}]
        + if $component == "" then [] else [{Name:"component",Value:$component}] end)}]' \
    <<< "${metric_data}")"
}

for environment in prod dev; do
  case "${environment}" in
    prod) project=infra; management_port=8081 ;;
    dev) project=jarihana-dev; management_port=81 ;;
  esac
  backend_id="$(timeout 5 docker ps -aq \
    --filter "label=com.docker.compose.project=${project}" \
    --filter label=com.docker.compose.service=backend)"
  database_id="$(timeout 5 docker ps -aq \
    --filter "label=com.docker.compose.project=${project}" \
    --filter label=com.docker.compose.service=postgres)"
  if [[ "${backend_id}" == *$'\n'* || "${database_id}" == *$'\n'* ]]; then
    echo "Ambiguous ${environment} containers; refusing to publish a guessed state." >&2
    exit 1
  fi
  backend_running="$(container_running "${backend_id}")"
  database_running="$(container_running "${database_id}")"
  app_up=0
  if [[ "${backend_running}" == 1 ]] && \
    curl --noproxy '*' --fail --silent --show-error --connect-timeout 2 --max-time 5 \
      "http://127.0.0.1:${management_port}/actuator/prometheus" \
      --output "${temporary_dir}/prometheus" && \
    grep -q '^process_cpu_usage{' "${temporary_dir}/prometheus" && \
    grep -q "environment=\"${environment}\"" "${temporary_dir}/prometheus"; then
    app_up=1
  fi
  db_up=0
  if [[ "${database_running}" == 1 ]]; then
    if query_result="$(timeout 8 docker exec "${database_id}" sh -c \
      'PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT=3 PGOPTIONS="-c statement_timeout=3000" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -w -Atqc "SELECT 1"')" && \
      [[ "${query_result}" == 1 ]]; then
      db_up=1
    fi
  fi
  add_metric ContainerRunning "${backend_running}" backend
  add_metric ContainerRunning "${database_running}" postgres
  add_metric AppUp "${app_up}"
  add_metric DbUp "${db_up}"
  add_metric HealthCollectorHeartbeat 1
  printf '%s: backend=%s postgres=%s AppUp=%s DbUp=%s\n' \
    "${environment}" "${backend_running}" "${database_running}" "${app_up}" "${db_up}"
done

aws cloudwatch put-metric-data --namespace Jarihana --metric-data "${metric_data}" \
  --region "${region}" --cli-connect-timeout 5 --cli-read-timeout 10
echo 'Published 10 service health datapoints to Jarihana.'
