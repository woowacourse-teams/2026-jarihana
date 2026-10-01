#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/application-context.sh"
. "${script_dir}/ec2-context.sh"

if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run this installation with sudo on the inspected EC2.' >&2
  exit 1
fi
. /etc/os-release
if [[ "${ID}" != ubuntu || "$(uname -m)" != aarch64 ]]; then
  echo 'This installer is for the inspected Ubuntu ARM64 host.' >&2
  exit 1
fi
command -v gpg
command -v dpkg
python3 "${script_dir}/validate.py"
curl --fail --silent --show-error --max-time 10 "${management_url}/actuator/health" > /dev/null
curl --fail --silent --show-error --max-time 10 "${management_url}/actuator/prometheus" > /dev/null

agent_dir=/opt/aws/amazon-cloudwatch-agent
config_dir="${agent_dir}/etc/jarihana"
agent_ctl="${agent_dir}/bin/amazon-cloudwatch-agent-ctl"
if [[ -x "${agent_ctl}" && ! -f "${config_dir}/agent.json" ]]; then
  echo 'Existing Agent found. Preserve its configuration and integrate manually.' >&2
  exit 1
fi
if [[ -d "${agent_dir}/etc/amazon-cloudwatch-agent.d" ]]; then
  while IFS= read -r config; do
    if [[ "$(basename -- "${config}")" != file_agent.json ]]; then
      echo 'A separate Agent configuration exists. Refusing to replace it.' >&2
      exit 1
    fi
  done < <(find "${agent_dir}/etc/amazon-cloudwatch-agent.d" -maxdepth 1 -type f)
fi

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "${temporary_dir}"' EXIT
if [[ ! -x "${agent_ctl}" ]]; then
  package_url=https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb
  curl --fail --silent --show-error --max-time 180 --retry 3 \
    "${package_url}" -o "${temporary_dir}/agent.deb"
  curl --fail --silent --show-error --max-time 30 --retry 3 \
    "${package_url}.sig" -o "${temporary_dir}/agent.deb.sig"
  curl --fail --silent --show-error --max-time 30 --retry 3 \
    https://amazoncloudwatch-agent.s3.amazonaws.com/assets/amazon-cloudwatch-agent.gpg \
    -o "${temporary_dir}/agent.gpg"
  install -d -m 700 "${temporary_dir}/keyring"
  gpg --batch --homedir "${temporary_dir}/keyring" --import "${temporary_dir}/agent.gpg"
  fingerprint="$(gpg --batch --homedir "${temporary_dir}/keyring" --with-colons \
    --fingerprint D58167303B789C72 | awk -F: '$1 == "fpr" {print $10; exit}')"
  test "${fingerprint}" = 937616F3450B7D806CBD9725D58167303B789C72
  gpg --batch --homedir "${temporary_dir}/keyring" --verify \
    "${temporary_dir}/agent.deb.sig" "${temporary_dir}/agent.deb"
  sha256sum "${temporary_dir}/agent.deb"
  dpkg -i "${temporary_dir}/agent.deb"
fi

backup_dir=""
if [[ -f "${config_dir}/agent.json" ]]; then
  backup_dir="/var/lib/jarihana-cloudwatch/backups/$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 700 "${backup_dir}"
  cp "${config_dir}/agent.json" "${config_dir}/prometheus.yaml" "${backup_dir}/"
  printf 'Previous configuration backup: %s\n' "${backup_dir}"
fi
install -d -m 755 "${config_dir}"
install -m 644 "${script_dir}/prometheus.yaml" "${config_dir}/prometheus.yaml"
install -m 644 "${script_dir}/agent.json" "${config_dir}/agent.json"
if ! "${agent_ctl}" -a fetch-config -m ec2 -s -c "file:${config_dir}/agent.json"; then
  if [[ -n "${backup_dir}" ]]; then
    cp "${backup_dir}/agent.json" "${backup_dir}/prometheus.yaml" "${config_dir}/"
    "${agent_ctl}" -a fetch-config -m ec2 -s -c "file:${config_dir}/agent.json"
  else
    "${agent_ctl}" -a stop
  fi
  exit 1
fi
systemctl enable amazon-cloudwatch-agent
systemctl is-active --quiet amazon-cloudwatch-agent
"${agent_ctl}" -a status
echo 'Agent started. Run verify.sh as the runner user to check actual CloudWatch data.'
