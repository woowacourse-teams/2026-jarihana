#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/test-frontend.sh" --fixtures-only

pool_fixture() {
  local i
  for i in {1..8}; do echo "$i" >"$BG_FRONTEND_DIST/assets/pool-$i.js"; done
  fe_temp
  fe_manifest "$BG_FRONTEND_DIST" "$GITHUB_SHA-$RUN_ID" "$BG_IMAGE_DIGEST" "$GITHUB_SHA"
  POOL_MANIFEST="$FE_TEMP/release.json"
}
await_lines() {
  local path=$1 expected=$2 i
  for i in {1..500}; do
    [[ ! -f $path ]] || (( $(wc -l <"$path")<expected )) || return 0
    command sleep 0.01
  done
  echo "Timed out awaiting $expected lines in $path" >&2
  return 1
}
bounded_parallelism_and_index_last() {
  pool_fixture
  echo '0 0' >"$CASE_DIR/active"
  fe_transfer_file() {
    local path active peak
    IFS=$'\t' read -r path _ <<<"$1"
    (
      flock 8
      read -r active peak <"$CASE_DIR/active"
      active=$((active+1)); (( peak>=active )) || peak=$active
      printf '%s %s\n' "$active" "$peak" >"$CASE_DIR/active"
      printf '%s\n' "$path" >>"$CASE_DIR/started"
    ) 8>"$CASE_DIR/pool.lock"
    if [[ $path == index.html ]]; then
      [[ $(wc -l <"$CASE_DIR/completed") == 12 ]] || return 51
    else
      await_lines "$CASE_DIR/started" 4
      command sleep 0.1
    fi
    (
      flock 8
      read -r active peak <"$CASE_DIR/active"
      printf '%s %s\n' "$((active-1))" "$peak" >"$CASE_DIR/active"
      printf '%s\n' "$path" >>"$CASE_DIR/completed"
    ) 8>"$CASE_DIR/pool.lock"
  }
  fe_transfer publish "$POOL_MANIFEST" "$BG_FRONTEND_DIST"
  [[ $(cat "$CASE_DIR/active") == '0 4' ]]
  [[ $(wc -l <"$CASE_DIR/completed") == 13 && $(tail -1 "$CASE_DIR/completed") == index.html ]]
  [[ -z $(find "$FE_TEMP" -maxdepth 1 -name 'batch.*' -print -quit) ]]
}
failure_reaps_siblings_before_return() {
  pool_fixture
  fe_transfer_file() {
    printf '%s\n' "$BASHPID" >>"$CASE_DIR/worker-pids"
    await_lines "$CASE_DIR/worker-pids" 4
    if [[ $1 == assets/new.js$'\t'* ]]; then await_lines "$CASE_DIR/descendant-pids" 3; return 52; fi
    bash -c 'trap "" TERM; printf "%s\n" "$BASHPID" >>"$1/descendant-pids"; sleep 30; echo unsafe >>"$1/late-writes"' _ "$CASE_DIR"
  }
  rejects fe_transfer publish "$POOL_MANIFEST" "$BG_FRONTEND_DIST"
  [[ $(wc -l <"$CASE_DIR/worker-pids") == 4 && ! -e $CASE_DIR/late-writes ]]
  local pid
  while read -r pid; do if kill -0 "$pid" 2>/dev/null; then return 1; fi; done <"$CASE_DIR/worker-pids"
  # A descendant may briefly be a zombie, but must never be running after cleanup.
  if [[ -f $CASE_DIR/descendant-pids ]]; then
    while read -r pid; do [[ ! -e /proc/$pid/stat ]] || [[ $(cut -d ' ' -f3 "/proc/$pid/stat") == Z ]]; done <"$CASE_DIR/descendant-pids"
  fi
}
term_reaps_workers_before_coordinator_recovery() {
  pool_fixture
  fe_transfer_file() {
    printf '%s\n' "$BASHPID" >>"$CASE_DIR/worker-pids"
    command sleep 30
    echo unsafe >>"$CASE_DIR/late-writes"
  }
  (
    trap 'printf "recovered\n" >"$CASE_DIR/recovered"' EXIT
    fe_transfer publish "$POOL_MANIFEST" "$BG_FRONTEND_DIST"
  ) &
  local coordinator=$! status=0 pid
  await_lines "$CASE_DIR/worker-pids" 4
  kill -TERM "$coordinator"
  wait "$coordinator" || status=$?
  [[ $status == 143 && -f $CASE_DIR/recovered && ! -e $CASE_DIR/late-writes ]]
  while read -r pid; do if kill -0 "$pid" 2>/dev/null; then return 1; fi; done <"$CASE_DIR/worker-pids"
  [[ $(wc -l <"$CASE_DIR/worker-pids") == 4 ]]
}
checksum_receipt_required() {
  pool_fixture
  BAD_CHECKSUM_RECEIPT=incorrect
  rejects fe_archive "$BG_FRONTEND_DIST" "$POOL_MANIFEST"
  [[ ! -f $(manifest_file) ]]
  grep -q 'checksum receipt differs' "$CASE_DIR/rejection.log"
}
missing_checksum_receipt_rejected() {
  pool_fixture
  OMIT_CHECKSUM_RECEIPT=true
  rejects fe_archive "$BG_FRONTEND_DIST" "$POOL_MANIFEST"
  [[ ! -f $(manifest_file) ]]
  grep -q 'checksum receipt differs' "$CASE_DIR/rejection.log"
}
checksum_encoding_matches_known_vectors() {
  [[ $(fe_checksum_base64 ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad) == ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0= ]]
  [[ $(fe_checksum_base64 "$(printf '%064d' 0)") == AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ]]
}
upload_rejects_changed_bytes() {
  pool_fixture
  echo damaged >"$BG_FRONTEND_DIST/assets/new.js"
  rejects fe_transfer archive "$POOL_MANIFEST" "$BG_FRONTEND_DIST"
  [[ ! -f $CASE_DIR/s3/$FE_ARCHIVE/$GITHUB_SHA-$RUN_ID/files/assets/new.js && ! -f $(manifest_file) ]]
  grep -q BadDigest "$CASE_DIR/rejection.log"
}
request_reduction_preserves_full_checks() {
  fe_stage
  local release="$GITHUB_SHA-$RUN_ID" count
  count=$(jq '.files|length' "$(manifest_file)")
  # Archive uploads receive S3 SHA-256 receipts instead of downloading each object again.
  [[ $(awk -F '\t' -v prefix="$FE_ARCHIVE/$release/files/" '$1=="s3api/get-object" && index($2,prefix)==1 {n++} END{print n+0}' "$CASE_DIR/requests") == 0 ]]
  : >"$CASE_DIR/requests"
  fe_publish
  [[ $(awk -F '\t' -v prefix="$FE_ARCHIVE/$release/files/" '$1=="s3api/get-object" && index($2,prefix)==1 {n++} END{print n+0}' "$CASE_DIR/requests") == "$count" ]]
  [[ $(awk -F '\t' -v prefix="$FE_LIVE/" '$1=="s3api/get-object" && index($2,prefix)==1 {n++} END{print n+0}' "$CASE_DIR/requests") == 0 ]]
  [[ $(awk -F '\t' '$1=="public" {n++} END{print n+0}' "$CASE_DIR/requests") == "$count" ]]
  : >"$CASE_DIR/requests"
  fe_finalize
  [[ $(awk -F '\t' -v prefix="$FE_ARCHIVE/$release/files/" '$1=="s3api/get-object" && index($2,prefix)==1 {n++} END{print n+0}' "$CASE_DIR/requests") == 0 ]]
  [[ $(awk -F '\t' '$1=="public" {n++} END{print n+0}' "$CASE_DIR/requests") == "$count" ]]
  jq -e '.frontend.finalized==true' "$STATE_FILE" >/dev/null
}
final_manifest_context_checked() {
  fe_stage; fe_publish
  local manifest
  manifest=$(manifest_file)
  jq '.run_id+=1' "$manifest" >"$CASE_DIR/wrong-manifest"
  cp "$CASE_DIR/wrong-manifest" "$manifest"
  rejects fe_finalize
  grep -q 'Final frontend manifest context differs' "$CASE_DIR/rejection.log"
  jq -e '.frontend.finalized==false' "$STATE_FILE" >/dev/null
  jq -e '.pending.status=="published" and .current=="baseline-123"' "$CASE_DIR/s3/$FE_ARCHIVE/state.json" >/dev/null
}
for test in bounded_parallelism_and_index_last failure_reaps_siblings_before_return term_reaps_workers_before_coordinator_recovery checksum_receipt_required missing_checksum_receipt_rejected checksum_encoding_matches_known_vectors upload_rejects_changed_bytes request_reduction_preserves_full_checks final_manifest_context_checked; do
  ( setup "$test"; "$test" )
  printf 'PASS frontend-transfer %s\n' "$test"
done
