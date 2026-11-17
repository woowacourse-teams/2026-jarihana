#!/usr/bin/env bash
# File I/O runs in bounded batches. Only the calling coordinator writes its journal.
fe_checksum_base64() {
  [[ $1 =~ ^[a-f0-9]{64}$ ]] || bg_die 'Invalid frontend SHA-256'
  local bytes='' i
  for (( i=0; i<64; i+=2 )); do bytes+="\\x${1:i:2}"; done
  printf '%b' "$bytes" | base64 -w 0
}
fe_upload_file() {
  local key=$1 path=$2 expected=$3 type=${4:-application/octet-stream} checksum response
  local -a options=(--if-none-match '*')
  if [[ $FE_TRANSFER_MODE == publish ]]; then
    options=(--content-type "$type" --cache-control 'no-cache, max-age=0, must-revalidate')
  fi
  checksum=$(fe_checksum_base64 "$expected")
  response=$(fe_aws s3api put-object --bucket "$FE_BUCKET" --key "$key" --body "$FE_TRANSFER_DIRECTORY/$path" \
    --checksum-sha256 "$checksum" "${options[@]}") || bg_die 'Frontend checksum upload failed or uncertain'
  jq -e --arg checksum "$checksum" '.ChecksumSHA256==$checksum' <<<"$response" >/dev/null || bg_die 'Frontend upload checksum receipt differs'
}
fe_transfer_file() {
  local path expected size actual parent type=application/octet-stream
  IFS=$'\t' read -r path expected size <<<"$1"
  bg_file_guard
  case $FE_TRANSFER_MODE in
    archive)
      fe_upload_file "$FE_ARCHIVE/$FE_TRANSFER_RELEASE/files/$path" "$path" "$expected"
      ;;
    download)
      parent=$FE_TRANSFER_DIRECTORY
      [[ $path != */* ]] || parent+=/${path%/*}
      [[ -d $parent ]] || mkdir -p "$parent"
      fe_get "$FE_ARCHIVE/$FE_TRANSFER_RELEASE/files/$path" "$FE_TRANSFER_DIRECTORY/$path" >/dev/null || bg_die 'Archived frontend file missing'
      [[ $(stat -Lc %s "$FE_TRANSFER_DIRECTORY/$path") == "$size" ]] || bg_die 'Frontend file size differs'
      actual=$(sha256sum "$FE_TRANSFER_DIRECTORY/$path") || bg_die 'Cannot checksum frontend file'
      [[ ${actual%% *} == "$expected" ]] || bg_die 'Frontend checksum differs'
      ;;
    public)
      curl -q --fail --silent --show-error --proto '=https' --max-redirs 0 --connect-timeout 3 --max-time 30 --max-filesize 67108864 \
        --header 'Accept-Encoding: identity' --header 'Cache-Control: no-cache' \
        "$FE_PUBLIC/$path" --output "$FE_TEMP/public-file" || bg_die 'Frontend public HTTP check failed'
      actual=$(sha256sum "$FE_TEMP/public-file") || bg_die 'Cannot checksum public frontend file'
      [[ ${actual%% *} == "$expected" ]] || bg_die 'Frontend public content differs'
      ;;
    publish)
      case $path in *.html) type='text/html; charset=utf-8';; *.js) type='text/javascript; charset=utf-8';; *.css) type='text/css; charset=utf-8';; *.json) type=application/json;; *.webmanifest) type=application/manifest+json;; *.png) type=image/png;; *.svg) type=image/svg+xml;; *.ico) type=image/x-icon;; *.jpg|*.jpeg) type=image/jpeg;; *.webp) type=image/webp;; *.woff2) type=font/woff2;; *.txt) type='text/plain; charset=utf-8';; esac
      fe_owned_pointer
      fe_upload_file "$FE_LIVE/$path" "$path" "$expected" "$type"
      ;;
    *) bg_die 'Unknown frontend transfer operation';;
  esac
}

fe_transfer_workers() {
  # Each worker has its own process group and scratch files, including pointer reads.
  # Reap every worker before returning so failed uploads cannot race with recovery.
  trap - EXIT INT TERM
  set -euo pipefail
  set -m
  local row pid worker status=0 batch
  local -a pids=()
  batch=$(mktemp -d "$FE_TEMP/batch.XXXXXX") || bg_die 'Cannot create frontend batch directory'
  local FE_S3_CACHE="$batch/s3-auth.conf"
  trap '
    for pid in "${pids[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
    for pid in "${pids[@]}"; do kill -KILL -- "-$pid" 2>/dev/null || true; done
    for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
    rm -rf -- "$batch"
  ' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  for row in "$@"; do
    worker=$(mktemp -d "$batch/file.XXXXXX") || bg_die 'Cannot create frontend worker directory'
    ( trap - EXIT INT TERM; FE_TEMP=$worker; fe_transfer_file "$row" ) &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do
    wait "$pid" || status=$?
    (( status==0 )) || exit "$status"
  done
  if [[ -n ${FE_S3_EXCHANGE:-} && -s $FE_S3_CACHE ]]; then
    cat "$FE_S3_CACHE" >"$FE_S3_EXCHANGE" || bg_die 'Cannot retain frontend credentials'
  fi
  pids=()
  exit 0
}

fe_transfer_batch() {
  local batch_pid status=0 saved_traps FE_S3_EXCHANGE=''
  # Refresh an expired parent-run cache before the workers inherit it.
  bg_file_guard
  if [[ $FE_TRANSFER_MODE != public && ${FE_S3_TRANSPORT:-curl} == curl ]]; then
    FE_S3_EXCHANGE=$(mktemp "$FE_TEMP/s3-auth.XXXXXX") || bg_die 'Cannot create frontend credential handoff'
  fi
  saved_traps=$(trap -p INT TERM)
  # wait must be interruptible: stop and reap the worker group before the coordinator's EXIT recovery.
  trap 'trap "" INT TERM; kill -TERM "${batch_pid:-}" 2>/dev/null || true; wait "${batch_pid:-}" 2>/dev/null || true; rm -f -- "${FE_S3_EXCHANGE:-}"; exit 130' INT
  trap 'trap "" INT TERM; kill -TERM "${batch_pid:-}" 2>/dev/null || true; wait "${batch_pid:-}" 2>/dev/null || true; rm -f -- "${FE_S3_EXCHANGE:-}"; exit 143' TERM
  fe_transfer_workers "$@" &
  batch_pid=$!
  wait "$batch_pid" || status=$?
  if [[ -n $FE_S3_EXCHANGE ]]; then
    if (( status==0 )) && [[ -s $FE_S3_EXCHANGE ]]; then
      FE_S3_AUTH=$(cat "$FE_S3_EXCHANGE") || status=1
    fi
    rm -f -- "$FE_S3_EXCHANGE" || status=1
  fi
  trap - INT TERM
  eval "$saved_traps"
  return "$status"
}

fe_transfer_checkpoint() {
  # Cache only the parent-run lookup for reads; local leases and write checkpoints stay checked.
  case $FE_TRANSFER_MODE in
    download|public) bg_file_guard;;
    *) bg_guard;;
  esac
  bg_touch_local
}

fe_transfer() {
  local FE_TRANSFER_MODE=$1 manifest=$2 FE_TRANSFER_DIRECTORY=${3:-}
  local FE_TRANSFER_RELEASE row started count=0 FE_S3_AUTH=''
  local FE_S3_TRANSPORT=${FE_S3_TRANSPORT:-curl}
  [[ $FE_S3_TRANSPORT == awscli || $FE_S3_TRANSPORT == curl ]] || bg_die 'Invalid frontend S3 transport'
  local -a batch=()
  FE_TRANSFER_RELEASE=$(jq -r .release_id "$manifest")
  started=$(date +%s)
  bg_guard
  while IFS= read -r row; do
    batch+=("$row")
    # Keep the entrypoint in a separate last batch even when fewer than four assets remain.
    if (( ${#batch[@]}==4 )); then
      fe_transfer_batch "${batch[@]}" || bg_die 'Frontend transfer batch failed; preserve release intent'
      fe_transfer_checkpoint
      count=$((count+${#batch[@]})); batch=()
    fi
  done < <(jq -r --arg mode "$FE_TRANSFER_MODE" '.files[] | select($mode!="publish" or .path!="index.html") | [.path,.sha256,.size]|@tsv' "$manifest")
  if (( ${#batch[@]}>0 )); then
    fe_transfer_batch "${batch[@]}" || bg_die 'Frontend transfer batch failed; preserve release intent'
    fe_transfer_checkpoint
    count=$((count+${#batch[@]}))
  fi
  if [[ $FE_TRANSFER_MODE == publish ]]; then
    row=$(jq -er '.files[]|select(.path=="index.html")|[.path,.sha256,.size]|@tsv' "$manifest")
    fe_transfer_batch "$row" || bg_die 'Frontend transfer batch failed; preserve release intent'
    fe_transfer_checkpoint
    count=$((count+1))
  fi
  bg_guard
  printf 'frontend_transfer operation=%s files=%s concurrency=4 seconds=%s\n' "$FE_TRANSFER_MODE" "$count" "$(( $(date +%s)-started ))"
}
