#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/application-context.sh"

application_log_retention_days="${APPLICATION_LOG_RETENTION_DAYS:-14}"
case "${application_log_retention_days}" in
  7|14|30|60|90)
    ;;
  *)
    printf 'Unsupported APPLICATION_LOG_RETENTION_DAYS: %s (use 7, 14, 30, 60, or 90)\n' \
      "${application_log_retention_days}" >&2
    exit 1
    ;;
esac

metrics_log_group=/jarihana/current/prometheus
application_log_group="${CLOUDWATCH_LOG_GROUP:-/jarihana/${target_environment}/application}"
if (( ${#application_log_group} < 1 || ${#application_log_group} > 512 )) ||
  [[ ! "${application_log_group}" =~ ^[A-Za-z0-9._/#-]+$ ]] ||
  [[ "${application_log_group}" == aws/* ]]; then
  printf 'Unsupported CLOUDWATCH_LOG_GROUP: %s\n' "${application_log_group}" >&2
  exit 1
fi
if [[ "${application_log_group}" == "${metrics_log_group}" ]]; then
  printf 'Reserved CLOUDWATCH_LOG_GROUP: %s\n' "${application_log_group}" >&2
  exit 1
fi

. "${script_dir}/ec2-context.sh"

aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json

ensure_log_group() {
  local log_group="$1"
  local retention_days="$2"
  local existing

  existing="$(aws logs describe-log-groups --log-group-name-prefix "${log_group}" \
    --query "logGroups[?logGroupName=='${log_group}'].logGroupName" --output text)"
  if [[ -z "${existing}" ]]; then
    aws logs create-log-group --log-group-name "${log_group}"
  fi
  aws logs put-retention-policy --log-group-name "${log_group}" --retention-in-days "${retention_days}"
  aws logs describe-log-groups --log-group-name-prefix "${log_group}" \
    --query "logGroups[?logGroupName=='${log_group}'].{name:logGroupName,retentionDays:retentionInDays}" --output json
}

ensure_log_group "${metrics_log_group}" 7
ensure_log_group "${application_log_group}" "${application_log_retention_days}"
