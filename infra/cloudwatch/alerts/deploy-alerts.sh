#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${EXPECTED_INSTANCE_ID:?Set EXPECTED_INSTANCE_ID to the inspected target EC2 ID}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL to the SNS notification recipient}"

enable_dev_alarms="${ENABLE_DEV_APPLICATION_ALARMS:-true}"
case "${enable_dev_alarms}" in
  true|false) ;;
  *) printf 'ENABLE_DEV_APPLICATION_ALARMS must be true or false\n' >&2; exit 1 ;;
esac

. "${script_dir}/../common/ec2-context.sh"
if [[ "${region}" != "ap-northeast-2" ]]; then
  printf 'Refusing to deploy alerts outside ap-northeast-2 (runner region: %s)\n' "${region}" >&2
  exit 1
fi

root_filesystem="$(findmnt -n -o FSTYPE /)"
if [[ -z "${root_filesystem}" ]]; then
  echo 'Could not determine the EC2 root filesystem type.' >&2
  exit 1
fi

require_log_group() {
  local log_group="$1"
  local existing

  existing="$(aws logs describe-log-groups \
    --region "${region}" \
    --log-group-name-prefix "${log_group}" \
    --query "logGroups[?logGroupName=='${log_group}'].logGroupName | [0]" \
    --output text)"
  if [[ "${existing}" != "${log_group}" ]]; then
    printf 'Required application log group is missing: %s\n' "${log_group}" >&2
    printf 'Run CloudWatch Manage > cloudwatch-prepare for this environment before deploying alerts.\n' >&2
    exit 1
  fi
}

require_log_group /jarihana/prod/application
if [[ "${enable_dev_alarms}" == true ]]; then
  require_log_group /jarihana/dev/application
fi

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "${temporary_dir}"' EXIT
template_file="${temporary_dir}/jarihana-alerts.json"
python3 "${script_dir}/alerts.py" > "${template_file}"
python3 -m json.tool "${template_file}" > /dev/null
aws cloudformation validate-template \
  --region "${region}" \
  --template-body "file://${template_file}"

parameters=(
  "AlertEmail=${ALERT_EMAIL}"
  "InstanceId=${instance_id}"
  "RootFilesystemType=${root_filesystem}"
  "EnableDevApplicationAlarms=${enable_dev_alarms}"
)

caller_account="$(aws sts get-caller-identity --query Account --output text)"
printf 'Deploying jarihana-alerts to account %s, region %s, EC2 %s; dev application alarms: %s\n' \
  "${caller_account}" "${region}" "${instance_id}" "${enable_dev_alarms}"

existing_stack_status="$(aws cloudformation describe-stacks \
  --region "${region}" \
  --stack-name jarihana-alerts \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || true)"
if [[ "${existing_stack_status}" == "ROLLBACK_COMPLETE" ]]; then
  echo 'Removing the previous ROLLBACK_COMPLETE alert stack before recreating it.'
  aws cloudformation delete-stack \
    --region "${region}" \
    --stack-name jarihana-alerts
  aws cloudformation wait stack-delete-complete \
    --region "${region}" \
    --stack-name jarihana-alerts
fi

aws cloudformation deploy \
  --region "${region}" \
  --stack-name jarihana-alerts \
  --template-file "${template_file}" \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${parameters[@]}"

aws cloudformation describe-stacks \
  --region "${region}" \
  --stack-name jarihana-alerts \
  --query 'Stacks[0].Outputs' \
  --output table
aws cloudwatch describe-alarms \
  --region "${region}" \
  --alarm-name-prefix '[' \
  --query 'MetricAlarms[].{Alarm:AlarmName,State:StateValue}' \
  --output table

aws cloudformation describe-stack-resource \
  --region "${region}" \
  --stack-name jarihana-alerts \
  --logical-resource-id AlertEmailSubscription \
  --query 'StackResourceDetail.{Resource:LogicalResourceId,Status:ResourceStatus}' \
  --output table
printf 'SNS email subscription resource created. Confirm the AWS subscription email before testing delivery.\n'
