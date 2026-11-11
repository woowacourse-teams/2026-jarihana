#!/usr/bin/env bash
# Hosted observer only: no deployment SSH, journal writes, or server cleanup.
set -euo pipefail
set +x
q_now() { date +%s; }
q_request() {
  local method=$1 suffix=$2 expected=$3 file code
  file=$(mktemp); chmod 600 "$file"
  if ! code=$(printf 'header = "Authorization: Bearer %s"\n' "$GH_TOKEN" |
    curl -q --config - --silent --noproxy '*' --proto '=https' --max-redirs 0 \
      --connect-timeout 3 --max-time 10 --max-filesize 2097152 \
      --header 'Accept: application/vnd.github+json' --header 'X-GitHub-Api-Version: 2022-11-28' \
      --request "$method" --output "$file" --write-out '%{http_code}' \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID$suffix"); then
    rm -f "$file"; return 1
  fi
  if [[ "$code" != "$expected" ]] || (( $(wc -c < "$file") > 2097152 )); then
    rm -f "$file"; return 1
  fi
  if [[ "$method" == GET ]]; then
    jq -ces 'if length==1 and (.[0]|type)=="object" then .[0] else error("invalid response") end' "$file" || { rm -f "$file"; return 1; }
  fi
  rm -f "$file"
}
q_fail() {
  printf '::error::Queue guardian: %s; preserve both hosts and deployment intent.\n' "$1" >&2
  # One request only. A lost response does not prove whether cancellation was applied.
  if ! q_request POST /cancel 202; then
    printf '::error::Run cancellation is unconfirmed; do not retry or infer server cleanup.\n' >&2
  fi
  return 1
}
main() {
  [[ ${GITHUB_REPOSITORY:-} == woowacourse-teams/2026-jarihana && ${GITHUB_RUN_ID:-} =~ ^[1-9][0-9]*$ &&
     ${GITHUB_RUN_ATTEMPT:-} == 1 && ${GITHUB_SHA:-} =~ ^[a-f0-9]{40}$ &&
     ${GH_TOKEN:-} =~ ^[A-Za-z0-9_.-]+$ ]] || { echo 'Invalid guardian context' >&2; return 1; }
  local run jobs now started previous id label terminal_count identity_errors
  declare -A first_seen=() queued=()
  started=$(q_now); previous=$started
  while true; do
    now=$(q_now)
    if (( now<previous || now-started>=7200 )); then q_fail 'Clock changed or whole-run observation expired'; return 1; fi
    previous=$now
    run=$(q_request GET '' 200) || { q_fail 'Parent run query failed'; return 1; }
    identity_errors=$(jq -r --argjson id "$GITHUB_RUN_ID" --arg sha "$GITHUB_SHA" --arg repo "$GITHUB_REPOSITORY" '
      [if .id!=$id then "run_id" else empty end,
       if .head_sha!=$sha then "head_sha" else empty end,
       if .run_attempt!=1 then "run_attempt" else empty end,
       if .repository.id!=1321030074 or .repository.full_name!=$repo then "repository" else empty end,
       if .head_repository.id!=1321030074 or .head_repository.full_name!=$repo then "head_repository" else empty end] | join(",")' <<<"$run") || {
      q_fail 'Parent run identity is malformed'; return 1
    }
    if [[ -n $identity_errors ]]; then
      q_fail "Parent run identity differs: $identity_errors"; return 1
    fi
    # A parent may be queued/waiting between reusable jobs while this guardian runs.
    if ! jq -e 'has("conclusion") and (.status|IN("queued","in_progress","waiting","pending","requested","completed")) and
      (.status=="completed" or .conclusion==null)' <<<"$run" >/dev/null; then
      q_fail 'Parent run lifecycle is unknown or already concluded'; return 1
    fi
    if [[ $(jq -r '.status' <<<"$run") == completed ]]; then return 0; fi
    jobs=$(q_request GET '/attempts/1/jobs?per_page=100' 200) || { q_fail 'Jobs query failed'; return 1; }
    if ! jq -e --argjson run "$GITHUB_RUN_ID" --arg sha "$GITHUB_SHA" '
      (.total_count|type)=="number" and .total_count==(.total_count|floor) and .total_count>=0 and .total_count<=100 and
      (.jobs|type)=="array" and (.jobs|length)==.total_count and
      ([.jobs[].id]|unique|length)==.total_count and
      all(.jobs[]; (.id|type)=="number" and .id==(.id|floor) and .id>0 and .run_id==$run and
        .head_sha==$sha and (.name|type)=="string" and
        (.status=="queued" or .status=="in_progress" or .status=="completed" or .status=="waiting" or .status=="pending" or .status=="requested") and
        (.labels|type)=="array" and all(.labels[];type=="string"))' <<<"$jobs" >/dev/null; then
      q_fail 'Jobs response is incomplete or has foreign identity'; return 1
    fi
    terminal_count=$(jq '[.jobs[]|select(.name=="deployment-result" or (.name|endswith("/ deployment-result")))]|length' <<<"$jobs")
    if (( terminal_count>1 )); then q_fail 'Deployment result job is ambiguous'; return 1; fi
    if jq -e 'any(.jobs[]; (.name=="deployment-result" or (.name|endswith("/ deployment-result"))) and .status=="completed")' <<<"$jobs" >/dev/null; then return 0; fi
    queued=()
    while IFS=$'\t' read -r id label; do
      [[ -n "$id" ]] || continue
      queued[$id]=1
      if [[ ! -v first_seen[$id] ]]; then first_seen[$id]=$now; fi
      if (( now-first_seen[$id]>=300 )); then q_fail "Self-hosted job $id remained queued for 300 seconds"; return 1; fi
    done < <(jq -r '.jobs[]|select(.status=="queued" and any(.labels[];.=="self-hosted" or startswith("jarihana")))|[.id,"queued"]|@tsv' <<<"$jobs")
    for id in "${!first_seen[@]}"; do
      if [[ ! -v queued[$id] ]]; then unset 'first_seen[$id]'; fi
    done
    # Two API reads every 30 seconds leave room in the shared GITHUB_TOKEN budget.
    sleep 30
  done
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
