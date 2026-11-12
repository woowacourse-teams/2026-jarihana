#!/usr/bin/env bash
# Prepare offline copies only. Never installs files or contacts production hosts.
set -euo pipefail
umask 077
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/actions/coordinator.sh"

prepare_control_removal() {
  [[ $# == 2 ]] || bg_die 'Usage: prepare-control-removal.sh SNAPSHOT_DIRECTORY NEW_OUTPUT_DIRECTORY'
  local input=$1 output=$2 name original_topology repository old_digest new_digest
  [[ $(id -u) == 0 ]] || bg_die 'Use root-owned private snapshots on an isolated Linux host'
  [[ $input == /* && $output == /* && ! -e $output && ! -L $output ]] || bg_die 'Use absolute paths and a new output directory'
  bg_owned_directory "$input"
  bg_owned_directory "$(dirname "$output")"
  WORK=$(mktemp -d "$(dirname "$output")/.control-removal.XXXXXX")
  trap '[[ -z ${WORK:-} ]] || rm -rf -- "$WORK"' EXIT
  mkdir "$WORK/before" "$WORK/after"
  for name in coordinator.json app-A.json app-B.json state.json; do
    bg_root_file "$input/$name" 65536 true
    cp -- "$input/$name" "$WORK/before/$name"
    chmod 600 "$WORK/before/$name"
    jq -es 'length==1 and (.[0]|type=="object")' "$WORK/before/$name" >/dev/null || bg_die 'Snapshot must contain one JSON object'
  done
  bg_config "$WORK/before/coordinator.json"
  jq -e '(has("local_slot")|not) and (.topology.control.ref|test("^refs/tags/deployment-control-[A-Za-z0-9._-]+$")) and (.topology.control.sha|test("^[a-f0-9]{40}$"))' <<<"$CONFIG" >/dev/null || bg_die 'Expected a legacy coordinator configuration'
  original_topology=$(jq -c '.topology' <<<"$CONFIG")
  repository=$(jq -c '.repository' <<<"$CONFIG")
  ENVIRONMENT=$(jq -r '.topology.environment' <<<"$CONFIG")
  old_digest=$(bg_topology_digest)
  STATE_FILE="$WORK/before/state.json"
  bg_previous_journal
  jq -e --arg control "$(jq -r '.control.sha' <<<"$original_topology")" '
    (.sha|type=="string" and test("^[a-f0-9]{40}$")) and
    (.run_id|type=="number" and floor==. and .>0) and .attempt==1 and
    (.old|IN("A","B")) and (.target|IN("A","B")) and
    (.control_sha==null or .control_sha==$control)
  ' "$STATE_FILE" >/dev/null || bg_die 'Legacy journal identity differs'
  for name in app-A.json app-B.json; do
    bg_config "$WORK/before/$name"
    jq -e --arg slot "${name:4:1}" --argjson topology "$original_topology" --argjson repository "$repository" '
      .local_slot==$slot and .topology==$topology and .repository==$repository
    ' <<<"$CONFIG" >/dev/null || bg_die 'Application snapshot belongs to another topology or slot'
  done
  for name in coordinator.json app-A.json app-B.json; do
    jq 'del(.topology.control,.control_transition)' "$WORK/before/$name" >"$WORK/after/$name"
    bg_config "$WORK/after/$name"
  done
  bg_config "$WORK/after/coordinator.json"
  new_digest=$(bg_topology_digest)
  jq --arg digest "$new_digest" '.topology_digest=$digest' "$WORK/before/state.json" >"$WORK/after/state.json"
  STATE_FILE="$WORK/after/state.json"
  bg_previous_journal
  for name in coordinator.json app-A.json app-B.json state.json; do
    cmp -s "$input/$name" "$WORK/before/$name" || bg_die 'Snapshot changed during preparation; discard output and collect again'
  done
  (cd "$WORK/before" && sha256sum coordinator.json app-A.json app-B.json state.json >SHA256SUMS)
  (cd "$WORK/after" && sha256sum coordinator.json app-A.json app-B.json state.json >SHA256SUMS)
  printf 'old_topology_digest=%s\nnew_topology_digest=%s\n' "$old_digest" "$new_digest" >"$WORK/transition.txt"
  mv -T -- "$WORK" "$output"
  WORK=
  printf 'Prepared private before/after copies in %s. No source or server files were changed.\n' "$output"
}

prepare_control_removal "$@"
