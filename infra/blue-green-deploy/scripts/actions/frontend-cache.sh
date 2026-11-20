#!/usr/bin/env bash
# The coordinator lock serializes this one-candidate cache beside the journal.
fe_cache_path() { printf '%s/frontend-candidate\n' "${STATE_FILE%/*}"; }
fe_cache_owned() {
  [[ -d $1 && ! -L $1 ]] && [[ $(stat -Lc '%u %a' "$1") == "$EUID 700" ]]
}
fe_cache_clear() {
  local directory
  directory=$(fe_cache_path)
  [[ -e $directory || -L $directory ]] || return 0
  # Never follow or remove an unexpected root, even on the best-effort cleanup path.
  fe_cache_owned "$directory" && rm -rf -- "$directory"
}
fe_cache_store() (
  local source=$1 manifest=$2 directory special
  directory=$(fe_cache_path)
  umask 077
  fe_cache_clear || return 1
  mkdir -m 700 -- "$directory" || return 1
  trap 'rm -rf -- "$directory"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mkdir -- "$directory/files" || return 1
  cp -R -- "$source/." "$directory/files/" || return 1
  special=$(find "$directory/files" ! -type f ! -type d -print -quit) || return 1
  [[ -z $special ]] || return 1
  fe_verify_files "$manifest" "$directory/files"
  # A complete marker is published only after all copied bytes match the archive.
  cp -- "$manifest" "$directory/manifest.tmp" || return 1
  mv -- "$directory/manifest.tmp" "$directory/release.json" || return 1
  trap - EXIT
)
fe_cache_verify() {
  local manifest=$1 directory special
  directory=$(fe_cache_path)
  fe_cache_owned "$directory" || return 1
  [[ -f $directory/release.json && ! -L $directory/release.json &&
     -d $directory/files && ! -L $directory/files ]] || return 1
  # The S3 completion manifest remains authoritative, including run/deployment identity.
  cmp -s -- "$manifest" "$directory/release.json" || return 1
  special=$(find "$directory/files" ! -type f ! -type d -print -quit) || return 1
  [[ -z $special ]] || return 1
  fe_transfer verify "$manifest" "$directory/files"
}
fe_prepare_candidate() {
  local release started
  release=$(jq -r .frontend.release_id <<<"$STATE")
  started=$(date +%s)
  bg_guard
  fe_read_release_manifest "$release"
  jq -e --argjson state "$STATE" '.backend_image==$state.image and .source_commit==$state.sha and .run_id==$state.run_id and .deployment_id==$state.deployment_id' "$FE_TEMP/download-manifest.json" >/dev/null || bg_die 'Candidate frontend manifest context differs'
  if fe_cache_verify "$FE_TEMP/download-manifest.json"; then
    FE_CANDIDATE_DIRECTORY="$(fe_cache_path)/files"
    printf 'frontend_candidate source=local seconds=%s\n' "$(( $(date +%s)-started ))"
  else
    FE_CANDIDATE_DIRECTORY="$FE_TEMP/candidate"
    mkdir -- "$FE_CANDIDATE_DIRECTORY"
    fe_transfer download "$FE_TEMP/download-manifest.json" "$FE_CANDIDATE_DIRECTORY"
    printf 'frontend_candidate source=s3 seconds=%s\n' "$(( $(date +%s)-started ))"
  fi
  bg_guard
}
