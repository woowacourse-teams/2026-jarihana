#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/application-context.sh"
. "${script_dir}/ec2-context.sh"
root_filesystem="$(findmnt -n -o FSTYPE /)"
curl --fail --silent --show-error --max-time 10 "${management_url}/actuator/health" > /dev/null
curl --fail --silent --show-error --max-time 10 "${management_url}/actuator/prometheus" > /dev/null
curl --fail --silent --show-error --max-time 10 "${api_url}/api/groups" > /dev/null
python3 "${script_dir}/verify.py" --instance-id "${instance_id}" \
  --root-filesystem "${root_filesystem}" --environment "${target_environment}"
