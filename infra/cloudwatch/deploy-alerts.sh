#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${EXPECTED_INSTANCE_ID:?Set EXPECTED_INSTANCE_ID to the inspected target EC2 ID}"
: "${DISCORD_WEBHOOK_URL:?Set DISCORD_WEBHOOK_URL as a GitHub Actions secret}"

enable_dev_alarms="${ENABLE_DEV_APPLICATION_ALARMS:-false}"
case "${enable_dev_alarms}" in
  true|false) ;;
  *) printf 'ENABLE_DEV_APPLICATION_ALARMS must be true or false\n' >&2; exit 1 ;;
esac

python3 - <<'PY'
import os
import re
from urllib.parse import urlsplit

url = os.environ["DISCORD_WEBHOOK_URL"]
parsed = urlsplit(url)
valid_path = re.fullmatch(r"/api/webhooks/[0-9]+/[A-Za-z0-9._-]+", parsed.path)
if parsed.scheme != "https" or parsed.hostname not in {"discord.com", "discordapp.com"}:
    raise SystemExit("Discord webhook must be an https://discord.com/api/webhooks/... URL")
if parsed.query or parsed.fragment or not valid_path:
    raise SystemExit("Discord webhook URL has an unexpected path or query string")
PY

. "${script_dir}/ec2-context.sh"
if [[ "${region}" != "ap-northeast-2" ]]; then
  printf 'Refusing to deploy alerts outside ap-northeast-2 (runner region: %s)\n' "${region}" >&2
  exit 1
fi

root_filesystem="$(findmnt -n -o FSTYPE /)"
if [[ -z "${root_filesystem}" ]]; then
  echo 'Could not determine the EC2 root filesystem type.' >&2
  exit 1
fi

for environment in prod dev; do
  if [[ "${environment}" == prod ]]; then
    env_upper=PROD
    env_title=Prod
  else
    env_upper=DEV
    env_title=Dev
  fi
  group_var="${env_upper}_BACKEND_LOG_GROUP_NAME"
  pattern_var="${env_upper}_HTTP_5XX_LOG_PATTERN"
  group="${!group_var:-}"
  pattern="${!pattern_var:-}"
  if [[ -n "${group}" && -z "${pattern}" ]] || [[ -z "${group}" && -n "${pattern}" ]]; then
    printf 'Set both %s and %s, or leave both empty.\n' "${group_var}" "${pattern_var}" >&2
    exit 1
  fi
done

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "${temporary_dir}"' EXIT
template_file="${temporary_dir}/jarihana-alerts.json"
python3 "${script_dir}/alerts.py" > "${template_file}"
python3 -m json.tool "${template_file}" > /dev/null
aws cloudformation validate-template \
  --region "${region}" \
  --template-body "file://${template_file}"

parameters=(
  "InstanceId=${instance_id}"
  "RootFilesystemType=${root_filesystem}"
  "DiscordWebhookUrl=${DISCORD_WEBHOOK_URL}"
  "EnableDevApplicationAlarms=${enable_dev_alarms}"
)
for environment in prod dev; do
  if [[ "${environment}" == prod ]]; then
    env_upper=PROD
    env_title=Prod
  else
    env_upper=DEV
    env_title=Dev
  fi
  group_var="${env_upper}_BACKEND_LOG_GROUP_NAME"
  pattern_var="${env_upper}_HTTP_5XX_LOG_PATTERN"
  group="${!group_var:-}"
  parameters+=(
    "${env_title}BackendLogGroupName=${group}"
    "${env_title}Http5xxLogPattern=${!pattern_var:-}"
  )
done

caller_account="$(aws sts get-caller-identity --query Account --output text)"
printf 'Deploying jarihana-alerts to account %s, region %s, EC2 %s; dev application alarms: %s\n' \
  "${caller_account}" "${region}" "${instance_id}" "${enable_dev_alarms}"
aws cloudformation deploy \
  --region "${region}" \
  --stack-name jarihana-alerts \
  --template-file "${template_file}" \
  --capabilities CAPABILITY_IAM \
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
