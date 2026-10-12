#!/usr/bin/env bash
set -euo pipefail

: "${EXPECTED_INSTANCE_ID:?Set EXPECTED_INSTANCE_ID to the inspected target EC2 ID}"
metadata=http://169.254.169.254/latest
token="$(curl --noproxy '*' --fail --silent --show-error --max-time 3 \
  -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' "${metadata}/api/token")"
identity="$(curl --noproxy '*' --fail --silent --show-error --max-time 3 \
  -H "X-aws-ec2-metadata-token: ${token}" "${metadata}/dynamic/instance-identity/document")"
instance_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["instanceId"])' <<< "${identity}")"
region="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["region"])' <<< "${identity}")"
if [[ "${instance_id}" != "${EXPECTED_INSTANCE_ID}" ]]; then
  printf 'Refusing to operate on unexpected EC2: %s\n' "${instance_id}" >&2
  exit 1
fi
export AWS_REGION="${region}" AWS_DEFAULT_REGION="${region}" AWS_PAGER=""
printf 'Target EC2: %s; region: %s\n' "${instance_id}" "${region}"
