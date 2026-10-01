#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${EXPECTED_INSTANCE_ID:?Set EXPECTED_INSTANCE_ID to the inspected target EC2 ID}"
: "${GITHUB_RUN_ID:?Run this permission check from GitHub Actions}"
: "${GITHUB_RUN_ATTEMPT:?GitHub Actions run attempt is required}"

. "${script_dir}/ec2-context.sh"
if [[ "${region}" != "ap-northeast-2" ]]; then
  printf 'Refusing to check SNS outside ap-northeast-2 (runner region: %s)\n' "${region}" >&2
  exit 1
fi

stack_name="jarihana-sns-permission-check-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
temporary_dir="$(mktemp -d)"
template_file="${temporary_dir}/sns-permission-check.json"
stack_created=false

# The runner's AWS CLI v1 SNS commands currently fail during argument parsing on
# Python 3.14. CloudFormation exercises the same topic permissions server-side.

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "${stack_created}" == true ]] || aws cloudformation describe-stacks \
       --region "${region}" --stack-name "${stack_name}" > /dev/null 2>&1; then
    if aws cloudformation delete-stack --region "${region}" --stack-name "${stack_name}" && \
       aws cloudformation wait stack-delete-complete --region "${region}" --stack-name "${stack_name}"; then
      printf 'Removed temporary SNS permission-check stack: %s\n' "${stack_name}"
    else
      printf 'Failed to remove SNS permission-check stack: %s\n' "${stack_name}" >&2
      status=1
    fi
  fi
  rm -rf -- "${temporary_dir}"
  exit "${status}"
}
trap cleanup EXIT

python3 - <<'PY' > "${template_file}"
import json

print(json.dumps({
    "AWSTemplateFormatVersion": "2010-09-09",
    "Description": "Temporary Jarihana SNS permission check.",
    "Resources": {
        "PermissionCheckTopic": {
            "Type": "AWS::SNS::Topic",
        },
    },
}))
PY

if ! aws cloudformation deploy \
     --region "${region}" \
     --stack-name "${stack_name}" \
     --template-file "${template_file}" \
     --no-fail-on-empty-changeset; then
  aws cloudformation describe-stack-events \
    --region "${region}" \
    --stack-name "${stack_name}" \
    --query 'StackEvents[?contains(ResourceStatus, `FAILED`)].[Timestamp,LogicalResourceId,ResourceStatusReason]' \
    --output table || true
  exit 1
fi
stack_created=true

topic_status="$(aws cloudformation describe-stack-resource \
  --region "${region}" \
  --stack-name "${stack_name}" \
  --logical-resource-id PermissionCheckTopic \
  --query 'StackResourceDetail.ResourceStatus' \
  --output text)"
[[ "${topic_status}" == CREATE_COMPLETE ]]

aws cloudformation delete-stack --region "${region}" --stack-name "${stack_name}"
aws cloudformation wait stack-delete-complete --region "${region}" --stack-name "${stack_name}"
stack_created=false
printf 'CloudFormation created and deleted an SNS topic in %s; SNS topic permissions verified.\n' "${region}"
