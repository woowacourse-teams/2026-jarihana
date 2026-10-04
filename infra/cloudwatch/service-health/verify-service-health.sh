#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/../common/ec2-context.sh"
queries='[]'
for environment in prod dev; do
  for target in ContainerRunning:backend ContainerRunning:postgres AppUp DbUp HealthCollectorHeartbeat; do
    name="${target%%:*}"
    component=''
    if [[ "${target}" == *:* ]]; then component="${target#*:}"; fi
    id="${environment}$(jq length <<< "${queries}")"
    queries="$(jq --arg id "${id}" --arg name "${name}" --arg env "${environment}" \
      --arg instance "${instance_id}" --arg component "${component}" \
      '. + [{Id:$id,Label:($env+" "+$name+" "+$component),ReturnData:true,
        MetricStat:{Period:60,Stat:"Minimum",Metric:{Namespace:"Jarihana",MetricName:$name,
          Dimensions:([{Name:"application",Value:"jarihana"},
            {Name:"environment",Value:$env},{Name:"InstanceId",Value:$instance}]
            + if $component == "" then [] else [{Name:"component",Value:$component}] end)}}}]' \
      <<< "${queries}")"
  done
done
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
start="$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
result="$(aws cloudwatch get-metric-data --metric-data-queries "${queries}" \
  --start-time "${start}" --end-time "${now}" --scan-by TimestampDescending --output json)"
jq -r '.MetricDataResults[] | "\(.Label): value=\(.Values[0]) time=\(.Timestamps[0]) status=\(.StatusCode)"' <<< "${result}"
jq -e --argjson now "$(date -u +%s)" \
  '(.MetricDataResults | length) == 10 and all(.MetricDataResults[];
    .StatusCode == "Complete" and (.Values | length) > 0 and .Values[0] == 1 and
    ($now - (.Timestamps[0] | sub("\\+00:00$"; "Z") | fromdateiso8601)) < 180)' \
  <<< "${result}" > /dev/null
echo 'Verified 10 recent healthy service datapoints (within 3 minutes).'
