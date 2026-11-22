#!/usr/bin/env bash
set -euo pipefail

directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
catalog="$directory/../../../backend/src/main/resources/contracts/clubhouse/blueprints"
mode=${1:-}
if [[ $mode != digest && $mode != check && $mode != contract ]]; then
  echo 'Usage: migrate.sh digest | check [psql connection options] | contract dev|prod TOPOLOGY_RECEIPT [psql connection options]' >&2
  exit 2
fi
shift

index=$(jq -esr '
  if length == 1 then .[0] else error("Expected one blueprint index") end |
  if type == "array" and length > 0 and length == (unique | length) and
     all(.[]; type == "string" and test("\\A[a-z][a-z0-9_-]*/v[1-9][0-9]*[.]json\\z"))
  then .[]
  else error("Invalid blueprint index")
  end
' "$catalog/index.json")
paths=()
files=()
while IFS= read -r path; do
  paths+=("$path")
  files+=("$catalog/$path")
done <<< "$index"

if [[ $mode == digest || $mode == contract ]]; then
  checksum=$(cd "$catalog" && sha256sum index.json "${paths[@]}" | sha256sum)
  checksum=${checksum%% *}
fi
if [[ $mode == digest ]]; then
  printf '%s\n' "$checksum"
  exit 0
fi
if [[ $mode == contract ]]; then
  environment=${1:-}
  receipt=${2:-}
  if [[ $environment != dev && $environment != prod ]] || [[ ! -f $receipt ]]; then
    echo 'Usage: migrate.sh contract dev|prod TOPOLOGY_RECEIPT [psql connection options]' >&2
    exit 2
  fi
  shift 2
  if ! jq -es --arg manifest "$checksum" '
    def digests:
      type == "object" and keys == ["devApi", "prodApi", "realtime"] and
      all(.[]; type == "string" and test("\\Asha256:[a-f0-9]{64}\\z"));
    length == 1 and (.[0] |
      .blueprintsSha256 == $manifest and .legacyReadersStopped == true and
      .deploymentsPaused == true and (.active | digests) and (.rollback | digests) and
      ((now - (.observedAt | fromdateiso8601)) | . >= 0 and . <= 900))
  ' "$receipt" >/dev/null; then
    echo 'A current topology receipt for all three active and rollback images is required.' >&2
    exit 1
  fi
fi

# Read from STDIN to avoid shell-argument limits and quoting JSON as a SQL literal.
# Only session-local objects are created by the check path.
{
  printf '%s\n' 'CREATE TEMP TABLE clubhouse_blueprint_snapshot (payload jsonb NOT NULL);'
  printf '%s\n' '\copy clubhouse_blueprint_snapshot (payload) FROM STDIN WITH (FORMAT csv)'
  jq -ncr '
    [inputs | if type == "object" and
       input_filename == "\($catalog)/\(.templateKey)/v\(.blueprintVersion).json"
     then . else error("Blueprint does not match its indexed path") end]
    | if length == $count then [tojson] | @csv else error("Blueprint count differs from index") end
  ' --arg catalog "$catalog" --argjson count "${#paths[@]}" "${files[@]}"
  printf '%s\n' '\.'
  cat "$directory/manifest.sql"
  if [[ $mode == check ]]; then
    printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'
  else
    cat "$directory/contract-lock.sql"
  fi
  cat "$directory/check.sql"
  if [[ $mode == contract ]]; then
    cat "$directory/contract.sql"
  fi
  printf '%s\n' 'COMMIT;'
} | psql "$@" -X --set=ON_ERROR_STOP=1 --set=contract_database="jarihana_${environment:-}" --file=-
