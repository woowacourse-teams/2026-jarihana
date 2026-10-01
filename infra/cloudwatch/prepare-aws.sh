#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/ec2-context.sh"

aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
log_group=/jarihana/current/prometheus
existing="$(aws logs describe-log-groups --log-group-name-prefix "${log_group}" \
  --query "logGroups[?logGroupName=='${log_group}'].logGroupName" --output text)"
if [[ -z "${existing}" ]]; then
  aws logs create-log-group --log-group-name "${log_group}"
fi
aws logs put-retention-policy --log-group-name "${log_group}" --retention-in-days 7
aws logs describe-log-groups --log-group-name-prefix "${log_group}" \
  --query "logGroups[?logGroupName=='${log_group}'].{name:logGroupName,retentionDays:retentionInDays}" --output json
