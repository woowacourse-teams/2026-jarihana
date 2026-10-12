#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/application-context.sh"

printf 'OS: '
. /etc/os-release
printf '%s; architecture: %s\n' "${PRETTY_NAME}" "$(uname -m)"
printf 'Runner user: %s\n' "$(whoami)"
if sudo -n true 2>/dev/null; then
  echo 'Non-interactive sudo: available'
else
  echo 'Non-interactive sudo: unavailable'
fi
command -v python3
command -v aws || true
free -m
df -h /

agent_ctl=/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl
if [[ -x "${agent_ctl}" ]]; then
  "${agent_ctl}" -a status || true
else
  echo 'CloudWatch Agent: not installed'
fi

metadata=http://169.254.169.254/latest
token="$(curl --noproxy '*' --fail --silent --show-error --max-time 3 \
  -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' "${metadata}/api/token" || true)"
if [[ -n "${token}" ]]; then
  curl --noproxy '*' --fail --silent --show-error --max-time 3 \
    -H "X-aws-ec2-metadata-token: ${token}" "${metadata}/dynamic/instance-identity/document" |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ("instanceId","region","instanceType","accountId")}))'
  role="$(curl --noproxy '*' --fail --silent --show-error --max-time 3 \
    -H "X-aws-ec2-metadata-token: ${token}" "${metadata}/meta-data/iam/security-credentials/" || true)"
  printf 'EC2 instance role: %s\n' "${role:-not attached or not readable}"
else
  echo 'EC2 IMDSv2: unavailable'
fi

if command -v aws > /dev/null; then
  aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json || true
fi

curl --fail --silent --show-error --max-time 10 "${management_url}/actuator/health"
printf '\nManagement binding: '
if [[ "${target_environment}" == prod ]]; then
  docker port jarihana-backend 8081/tcp
else
  container_id="$(docker ps -q \
    --filter label=com.docker.compose.project=jarihana-dev \
    --filter label=com.docker.compose.service=backend)"
  if [[ -z "${container_id}" || "${container_id}" == *$'\n'* ]]; then
    echo 'Expected one running jarihana-dev backend container.' >&2
    exit 1
  fi
  docker port "${container_id}" 8081/tcp
fi
curl --fail --silent --show-error --max-time 10 "${management_url}/actuator/prometheus" |
  python3 -c '
import collections,sys
types={}
counts=collections.Counter()
for line in sys.stdin:
    if line.startswith("# TYPE "):
        _,_,name,kind=line.split()
        if name.startswith(("http_server_requests", "jvm_", "hikaricp_", "process_", "system_cpu")):
            types[name]=kind
    elif line and not line.startswith("#") and line.strip():
        name=line.split("{",1)[0].split()[0]
        if name.startswith(("http_server_requests", "jvm_", "hikaricp_", "process_", "system_cpu")):
            counts[name]+=1
print("Metric types (no label values or request data):")
for name,kind in sorted(types.items()): print(name,kind)
print("Series counts:")
for name,count in sorted(counts.items()): print(name,count)
'
