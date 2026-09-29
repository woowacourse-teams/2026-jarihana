#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
. "${script_dir}/ec2-context.sh"
if [[ "${instance_id}" != i-0a1245eb20f7998b8 || "${region}" != ap-northeast-2 ]]; then
  echo 'The dashboard JSON targets the inspected Seoul production EC2.' >&2
  exit 1
fi

dashboard_name=DASHBOARD-jarihana-prod
temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "${temporary_dir}"' EXIT

python3 -m json.tool "${script_dir}/dashboard-prod.json" > /dev/null
if aws cloudwatch get-dashboard --dashboard-name "${dashboard_name}" \
  --output json > "${temporary_dir}/existing.json" 2> "${temporary_dir}/error"; then
  echo 'The production dashboard already exists. Review it before updating; no changes made.' >&2
  exit 1
fi
if ! grep -q '(ResourceNotFound)' "${temporary_dir}/error"; then
  cat "${temporary_dir}/error" >&2
  exit 1
fi

aws cloudwatch put-dashboard --dashboard-name "${dashboard_name}" \
  --dashboard-body "file://${script_dir}/dashboard-prod.json" \
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
python3 - "${script_dir}/dashboard-prod.json" "${temporary_dir}/created.json" <<'PY'
import json
import sys

with open(sys.argv[1]) as source, open(sys.argv[2]) as result:
    if json.load(source) != json.loads(json.load(result)["DashboardBody"]):
        raise SystemExit("Saved dashboard differs from the reviewed JSON")
print("Dashboard saved and read back: DASHBOARD-jarihana-prod (12 graphs)")
PY
printf 'https://%s.console.aws.amazon.com/cloudwatch/home?region=%s#dashboards/dashboard/%s\n' \
  "${region}" "${region}" "${dashboard_name}"
