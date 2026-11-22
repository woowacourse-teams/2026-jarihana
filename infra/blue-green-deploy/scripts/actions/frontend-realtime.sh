#!/usr/bin/env bash

verify_frontend_realtime_for_checkout() {
  local source_dir=${1:?release source directory}
  shift
  # The new frontend and its portable catalog migration are released together.
  if [[ -f "$source_dir/backend/src/main/resources/db/migration/V49__space_portable_item_catalog.sql" ]]; then
    verify_frontend_realtime "$@"
  fi
}

verify_frontend_realtime() (
  set -euo pipefail
  local origin=$1 websocket_url=${2:-} host status output
  if [[ ! $origin =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]; then
    echo '::error::FRONTEND_ORIGIN must be a public HTTPS origin.' >&2
    return 1
  fi
  host=$origin
  if [[ -n $websocket_url ]]; then
    if [[ ! $websocket_url =~ ^wss://([a-zA-Z0-9.-]+(:[0-9]+)?)(/.*)?$ ]]; then
      echo '::error::REALTIME_WEBSOCKET_URL must be a public WSS URL.' >&2
      return 1
    fi
    host="https://${BASH_REMATCH[1]}"
  fi
  output=$(mktemp -d)
  trap 'rm -rf -- "$output"' EXIT
  local -a request=(--disable --silent --show-error --proto '=https' --connect-timeout 5 --max-time 10 --max-filesize 1048576)
  if ! status=$(curl "${request[@]}" \
    --header "Origin: $origin" --dump-header "$output/headers" --output "$output/body" --write-out '%{http_code}' \
    "$host/ws/realtime") || [[ $status != 200 ]]; then
    echo "::error::Public realtime contract is unavailable (HTTP ${status:-unavailable})." >&2
    return 1
  fi
  if ! awk -v origin="$origin" '
    /^HTTP\// { cors = 0 }
    tolower($1) == "access-control-allow-origin:" {
      sub(/\r$/, "", $2)
      cors = ($2 == "*" || $2 == origin)
    }
    END { exit !cors }
  ' "$output/headers" || ! jq -e '
    .success == true and .data == {catalogContractVersion: 2}
  ' "$output/body" >/dev/null 2>&1; then
    echo '::error::Public realtime contract has invalid JSON or CORS for the frontend origin.' >&2
    return 1
  fi
  if ! status=$(curl "${request[@]}" --output "$output/catalog" --write-out '%{http_code}' \
    "$origin/api/group-spaces/furniture-catalog") || [[ $status != 200 ]]; then
    echo "::error::Public furniture catalog is unavailable (HTTP ${status:-unavailable})." >&2
    return 1
  fi
  if ! jq -e '
    def positive_integer: type == "number" and . > 0 and floor == .;
    .success == true and .data.interactionCatalogVersion == 1 and .data.portableCatalogVersion == 1 and
    (.data.portableItems | type == "object" and length > 0 and all(.[];
      (.portable | type == "boolean") and (.throwable | type == "boolean") and (.consumable | type == "boolean"))) and
    (.data.items | type == "array" and length > 0 and all(.[];
      (.kind | type == "string" and length > 0) and
      ((.interaction // {capabilities: []}) |
        (.capabilities | type == "array") and
        (if (.capabilities | index("seatable")) then (.seatCount | positive_integer) else true end) and
        (if (.capabilities | index("surface")) then (.surface.slots | positive_integer) else true end) and
        (if (.capabilities | index("storage")) then (.storage.capacity | positive_integer) else true end))))
  ' "$output/catalog" >/dev/null 2>&1; then
    echo '::error::Public furniture catalog is missing the furniture or portable item contract.' >&2
    return 1
  fi
)
