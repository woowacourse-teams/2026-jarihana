#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/../common/ec2-context.sh"
if [[ "${instance_id}" != i-0a1245eb20f7998b8 || "${region}" != ap-northeast-2 ]]; then
  echo 'Refusing to install outside the configured shared EC2.' >&2
  exit 1
fi
for command in aws curl docker jq timeout; do command -v "${command}" > /dev/null; done
target_dir=/opt/jarihana-service-health
if [[ -e "${target_dir}" || -e /etc/systemd/system/jarihana-service-health.service || \
  -e /etc/systemd/system/jarihana-service-health.timer ]]; then
  echo 'Health collector already exists; review and back it up before updating.' >&2
  exit 1
fi
install -d -m 755 "${target_dir}/service-health" "${target_dir}/common"
install -m 755 "${script_dir}/service-health.sh" "${target_dir}/service-health/service-health.sh"
install -m 644 "${script_dir}/../common/ec2-context.sh" "${target_dir}/common/ec2-context.sh"
install -m 644 "${script_dir}/jarihana-service-health.service" /etc/systemd/system/
install -m 644 "${script_dir}/jarihana-service-health.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl start jarihana-service-health.service
systemctl enable --now jarihana-service-health.timer
systemctl is-active jarihana-service-health.timer
