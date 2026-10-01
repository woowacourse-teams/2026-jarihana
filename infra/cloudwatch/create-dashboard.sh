#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/application-context.sh"
. "${script_dir}/ec2-context.sh"
update_existing=false
if (( $# > 1 )) || [[ $# -eq 1 && "${1-}" != --update ]]; then
  echo 'Usage: create-dashboard.sh [--update]' >&2
  exit 1
fi
if [[ $# -eq 1 ]]; then
  update_existing=true
fi
if [[ "${instance_id}" != i-0a1245eb20f7998b8 || "${region}" != ap-northeast-2 ]]; then
  echo 'The dashboard JSON targets the inspected Seoul shared prod/dev EC2.' >&2
  exit 1
fi

dashboard_name="DASHBOARD-jarihana-${target_environment}"
dashboard_file="${script_dir}/dashboard-${target_environment}.json"
temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "${temporary_dir}"' EXIT

python3 -m json.tool "${dashboard_file}" > /dev/null
if aws cloudwatch get-dashboard --dashboard-name "${dashboard_name}" \
  --output json > "${temporary_dir}/existing.json" 2> "${temporary_dir}/error"; then
  if [[ "${update_existing}" != true ]]; then
    printf 'The %s dashboard already exists. Review it before updating; no changes made.\n' "${target_environment}" >&2
    exit 1
  fi
  backup_root=/var/lib/jarihana-cloudwatch/backups
  sudo install -d -m 700 "${backup_root}"
  backup_dir="$(sudo mktemp -d "${backup_root}/dashboard-$(date -u +%Y%m%dT%H%M%SZ).XXXXXXXX")"
  sudo install -m 600 "${temporary_dir}/existing.json" "${backup_dir}/existing.json"
  printf 'Previous dashboard backup: %s/existing.json\n' "${backup_dir}"
elif ! grep -q '(ResourceNotFound)' "${temporary_dir}/error"; then
  cat "${temporary_dir}/error" >&2
  exit 1
elif [[ "${update_existing}" == true ]]; then
  echo 'The dashboard does not exist; use creation mode without --update.' >&2
  exit 1
fi

aws cloudwatch put-dashboard --dashboard-name "${dashboard_name}" \
  --dashboard-body "file://${dashboard_file}" \
  --output json > "${temporary_dir}/result.json"
python3 - "${temporary_dir}/result.json" <<'PY'
import json
import sys

with open(sys.argv[1]) as result:
    messages = json.load(result).get("DashboardValidationMessages", [])
if messages:
    print(json.dumps(messages, ensure_ascii=False, indent=2), file=sys.stderr)
    raise SystemExit("Dashboard returned validation messages; inspect before declaring success")
PY
aws cloudwatch get-dashboard --dashboard-name "${dashboard_name}" \
  --output json > "${temporary_dir}/created.json"
python3 - "${dashboard_file}" "${temporary_dir}/created.json" "${dashboard_name}" <<'PY'
import json
import sys

with open(sys.argv[1]) as source, open(sys.argv[2]) as result:
    dashboard = json.load(source)
    if dashboard != json.loads(json.load(result)["DashboardBody"]):
        raise SystemExit("Saved dashboard differs from the reviewed JSON")
graphs = sum(widget["type"] == "metric" for widget in dashboard["widgets"])
print(f"Dashboard saved and read back: {sys.argv[3]} ({graphs} graphs)")
PY
printf 'https://%s.console.aws.amazon.com/cloudwatch/home?region=%s#dashboards/dashboard/%s\n' \
  "${region}" "${region}" "${dashboard_name}"
