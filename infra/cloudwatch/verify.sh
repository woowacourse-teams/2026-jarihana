#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/ec2-context.sh"
root_filesystem="$(findmnt -n -o FSTYPE /)"
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8080/api/groups > /dev/null
python3 "${script_dir}/verify.py" --instance-id "${instance_id}" --root-filesystem "${root_filesystem}"
