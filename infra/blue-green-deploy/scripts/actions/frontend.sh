#!/usr/bin/env bash
# Sourced by the coordinator: every mutation requires its live journal lease.
set -euo pipefail
FE_RELEASE_CAPABILITY=1
FE_BUCKET=techcourse-project-2026
FE_LIVE=jarihana/frontend
FE_ARCHIVE=jarihana/frontend-releases
FE_PUBLIC=https://jarihana.com
FE_DISTRIBUTION=E1YDHL1SDC4C1C

fe_aws() { AWS_MAX_ATTEMPTS=1 aws --region ap-northeast-2 --cli-connect-timeout 3 --cli-read-timeout 30 --no-cli-pager "$@"; }
fe_enabled() { [[ ${ENVIRONMENT:-} == prod && ${BG_MODE:-} == deploy ]]; }
fe_id() { [[ $1 =~ ^(baseline-[1-9][0-9]*|[a-f0-9]{40}-[1-9][0-9]*)$ ]] || bg_die 'Invalid frontend release ID'; }
fe_path() {
  [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && $1 != */ && $1 != *//* && /$1/ != */../* && /$1/ != */./* ]] || bg_die 'Unsafe frontend path'
}
fe_temp() {
  FE_TEMP=$(mktemp -d "$(dirname "$STATE_FILE")/.frontend.XXXXXX")
  chmod 700 "$FE_TEMP"
}
fe_validate_manifest() {
  local manifest=$1
  jq -e '
    .schema_version==1 and (.release_id|type=="string") and
    (.source_commit==null or (.source_commit|type=="string" and test("^[a-f0-9]{40}$"))) and
    (.backend_image|type=="string" and test("^sha256:[a-f0-9]{64}$")) and
    (.files|type=="array" and length>0 and length<=1000) and
    ([.files[].path]|length== (unique|length)) and
    ([.files[]|(.path|type=="string") and (.sha256|type=="string" and test("^[a-f0-9]{64}$")) and
      (.size|type=="number" and floor==. and .>0 and .<=67108864)]|all) and
    ([.files[].size]|add<=536870912) and
    ([.files[].path]|index("index.html")!=null and index("sw.js")!=null and index("manifest.webmanifest")!=null) and
    ([.files[]|select(.path=="index.html" or .path=="sw.js" or .path=="manifest.webmanifest")|.size>0]|all) and
    ([.files[].path|select(startswith("assets/"))]|length>0)
  ' "$manifest" >/dev/null || bg_die 'Invalid or incomplete frontend manifest'
  fe_id "$(jq -r .release_id "$manifest")"
  local path
  while IFS= read -r path; do fe_path "$path"; done < <(jq -r '.files[].path' "$manifest")
}
fe_manifest() {
  local directory=$1 release=$2 backend=$3 source=$4 path size total=0 count=0
  [[ -d $directory && ! -L $directory ]] || bg_die 'Frontend build directory missing'
  [[ -z $(find "$directory" -type l -print -quit) ]] || bg_die 'Frontend symlinks are forbidden'
  [[ -z $(find "$directory" ! -type f ! -type d -print -quit) ]] || bg_die 'Frontend special files are forbidden'
  : > "$FE_TEMP/files.jsonl"
  while IFS= read -r -d '' path; do
    path=${path#"$directory/"}; fe_path "$path"
    size=$(stat -Lc %s "$directory/$path")
    total=$((total+size)); count=$((count+1))
    (( size>0 && size<=67108864 && total<=536870912 && count<=1000 )) || bg_die 'Frontend artifact exceeds transfer limits'
    jq -cn --arg path "$path" --arg sha "$(sha256sum "$directory/$path" | cut -d ' ' -f1)" --argjson size "$size" '{path:$path,sha256:$sha,size:$size}' >> "$FE_TEMP/files.jsonl"
  done < <(find "$directory" -type f -print0)
  jq -s --arg release "$release" --arg backend "$backend" --arg source "$source" --argjson run "$RUN_ID" \
    --arg dep "$(jq -r .deployment_id <<<"$STATE")" --arg control "$CONTROL_SHA" \
    '{schema_version:1,release_id:$release,source_commit:(if $source=="" then null else $source end),backend_image:$backend,run_id:$run,deployment_id:$dep,control_sha:$control,files:sort_by(.path)}' \
    "$FE_TEMP/files.jsonl" > "$FE_TEMP/release.json"
  fe_validate_manifest "$FE_TEMP/release.json"
  local reference references=0
  while IFS= read -r reference; do
    reference=${reference#*=\"}; reference=${reference%\"}; reference=${reference#/}
    case $reference in
      assets/*|icons/*|manifest.webmanifest)
        fe_path "$reference"
        [[ -s $directory/$reference && ! -L $directory/$reference ]] || bg_die 'Frontend entrypoint references a missing asset'
        [[ $reference != assets/*.js ]] || references=$((references+1))
        ;;
    esac
  done < <(grep -oE '(src|href)="[^"]+"' "$directory/index.html")
  (( references>0 )) || bg_die 'Frontend entrypoint has no local JavaScript asset'
}
fe_get() {
  local key=$1 destination=$2 limit=67108864 metadata
  case $key in */release.json|*/state.json) limit=1048576;; esac
  metadata=$(fe_aws s3api get-object --bucket "$FE_BUCKET" --key "$key" --range "bytes=0-$limit" "$destination") || return 1
  (( $(stat -Lc %s "$destination")<=limit )) || bg_die 'Frontend object exceeds download limit'
  printf '%s\n' "$metadata"
}
fe_pointer_read() {
  local metadata error="$FE_TEMP/pointer-error"
  if metadata=$(fe_get "$FE_ARCHIVE/state.json" "$FE_TEMP/state.json" 2>"$error"); then
    FE_ETAG=$(jq -er '.ETag|select(type=="string" and length>0)' <<<"$metadata")
    FE_POINTER=$(cat "$FE_TEMP/state.json")
    jq -e '.schema_version==1 and has("previous") and has("pending") and (.current|type=="string") and (.previous==null or (.previous|type=="string")) and (.pending==null or (.pending|type=="object"))' <<<"$FE_POINTER" >/dev/null || bg_die 'Malformed frontend pointer'
    fe_id "$(jq -r .current <<<"$FE_POINTER")"
    [[ $(jq -r .previous <<<"$FE_POINTER") == null ]] || fe_id "$(jq -r .previous <<<"$FE_POINTER")"
  elif grep -q 'An error occurred (NoSuchKey)' "$error"; then
    FE_ETAG=absent; FE_POINTER=null
  else
    bg_die 'Frontend pointer is unreadable, not proven absent'
  fi
}
fe_pointer_write() {
  local value=$1 metadata
  printf '%s\n' "$value" > "$FE_TEMP/next-state.json"
  bg_guard; bg_live
  if [[ $FE_ETAG == absent ]]; then
    metadata=$(fe_aws s3api put-object --bucket "$FE_BUCKET" --key "$FE_ARCHIVE/state.json" --body "$FE_TEMP/next-state.json" --content-type application/json --cache-control no-store --if-none-match '*') || bg_die 'Frontend pointer creation uncertain'
  else
    metadata=$(fe_aws s3api put-object --bucket "$FE_BUCKET" --key "$FE_ARCHIVE/state.json" --body "$FE_TEMP/next-state.json" --content-type application/json --cache-control no-store --if-match "$FE_ETAG") || bg_die 'Frontend pointer CAS failed or uncertain'
  fi
  FE_ETAG=$(jq -er '.ETag|select(type=="string" and length>0)' <<<"$metadata")
  FE_POINTER=$value
  bg_touch
}
fe_preflight() {
  local distribution policy
  command -v aws >/dev/null || bg_die 'AWS CLI v2 with conditional S3 put support is required'
  [[ $(fe_aws --version) == aws-cli/2.* ]] || bg_die 'AWS CLI v2 is required'
  (( $(df -Pk "$(dirname "$STATE_FILE")" | awk 'NR==2 {print $4}')>=2097152 )) || bg_die 'Frontend staging requires 2 GiB free disk'
  distribution=$(fe_aws cloudfront get-distribution-config --id "$FE_DISTRIBUTION") || bg_die 'Cannot verify frontend CDN configuration'
  jq -e --arg bucket "$FE_BUCKET" --arg prefix "/$FE_LIVE" '
    .DistributionConfig as $d | $d.Enabled==true and ($d.Aliases.Items|index("jarihana.com"))!=null and
    ($d.DefaultCacheBehavior.FunctionAssociations.Quantity // 0)==0 and
    ($d.DefaultCacheBehavior.LambdaFunctionAssociations.Quantity // 0)==0 and
    ([$d.CacheBehaviors.Items[]? | .PathPattern | IN("/api/*","api/*","/images/*","images/*")]|all) and
    ([$d.Origins.Items[]|select(.Id==$d.DefaultCacheBehavior.TargetOriginId and .OriginPath==$prefix and (.DomainName==($bucket+".s3.ap-northeast-2.amazonaws.com") or .DomainName==($bucket+".s3.amazonaws.com")))]|length==1)
  ' <<<"$distribution" >/dev/null || bg_die 'Frontend CDN origin or edge transformations differ'
  policy=$(fe_aws cloudfront get-cache-policy --id "$(jq -er .DistributionConfig.DefaultCacheBehavior.CachePolicyId <<<"$distribution")") || bg_die 'Cannot verify frontend cache policy'
  jq -e '.CachePolicy.CachePolicyConfig | .MinTTL==0 and .DefaultTTL==0 and .MaxTTL==0' <<<"$policy" >/dev/null || bg_die 'Frontend publication requires disabled CDN caching'
  fe_aws s3api head-bucket --bucket "$FE_BUCKET" >/dev/null || bg_die 'Frontend bucket is inaccessible'
}
fe_verify_files() {
  local manifest=$1 directory=$2 path expected size
  fe_validate_manifest "$manifest"
  while IFS=$'\t' read -r path expected size; do
    [[ -f $directory/$path && ! -L $directory/$path ]] || bg_die 'Frontend file is missing'
    [[ $(stat -Lc %s "$directory/$path") == "$size" ]] || bg_die 'Frontend file size differs'
    [[ $(sha256sum "$directory/$path" | cut -d ' ' -f1) == "$expected" ]] || bg_die 'Frontend checksum differs'
  done < <(jq -r '.files[]|[.path,.sha256,.size]|@tsv' "$manifest")
}
fe_public_check() {
  local manifest=$1 path expected
  while IFS=$'\t' read -r path expected; do
    bg_guard
    curl -q --fail --silent --show-error --proto '=https' --max-redirs 0 --connect-timeout 3 --max-time 30 --max-filesize 67108864 \
      --header 'Accept-Encoding: identity' --header 'Cache-Control: no-cache' \
      "$FE_PUBLIC/$path" --output "$FE_TEMP/public-file" || bg_die 'Frontend public HTTP check failed'
    [[ $(sha256sum "$FE_TEMP/public-file" | cut -d ' ' -f1) == "$expected" ]] || bg_die 'Frontend public content differs'
    bg_touch
  done < <(jq -r '.files[]|[.path,.sha256]|@tsv' "$manifest")
}
fe_archive() {
  local directory=$1 manifest=$2 release path
  release=$(jq -r .release_id "$manifest"); fe_id "$release"
  fe_verify_files "$manifest" "$directory"
  while IFS= read -r path; do
    bg_guard; bg_live
    fe_aws s3api put-object --bucket "$FE_BUCKET" --key "$FE_ARCHIVE/$release/files/$path" --body "$directory/$path" --if-none-match '*' >/dev/null || bg_die 'Immutable frontend file upload failed or uncertain'
    fe_get "$FE_ARCHIVE/$release/files/$path" "$FE_TEMP/verify-file" >/dev/null || bg_die 'Frontend archive readback failed'
    cmp -s "$directory/$path" "$FE_TEMP/verify-file" || bg_die 'Frontend archive readback differs'
    bg_touch
  done < <(jq -r '.files[].path' "$manifest")
  bg_guard; bg_live
  fe_aws s3api put-object --bucket "$FE_BUCKET" --key "$FE_ARCHIVE/$release/release.json" --body "$manifest" --content-type application/json --if-none-match '*' >/dev/null || bg_die 'Frontend completion manifest upload uncertain'
  bg_touch
}
fe_download_release() {
  local release=$1 directory=$2 path
  fe_id "$release"; mkdir -p "$directory"
  fe_get "$FE_ARCHIVE/$release/release.json" "$FE_TEMP/download-manifest.json" >/dev/null || bg_die 'Completed frontend archive missing'
  fe_validate_manifest "$FE_TEMP/download-manifest.json"
  [[ $(jq -r .release_id "$FE_TEMP/download-manifest.json") == "$release" ]] || bg_die 'Archive identity differs'
  while IFS= read -r path; do
    mkdir -p "$(dirname "$directory/$path")"
    fe_get "$FE_ARCHIVE/$release/files/$path" "$directory/$path" >/dev/null || bg_die 'Archived frontend file missing'
    bg_touch
  done < <(jq -r '.files[].path' "$FE_TEMP/download-manifest.json")
  fe_verify_files "$FE_TEMP/download-manifest.json" "$directory"
}
fe_capture_baseline() {
  local listing again path expected metadata baseline="baseline-$RUN_ID"
  listing=$(fe_aws s3api list-objects-v2 --bucket "$FE_BUCKET" --prefix "$FE_LIVE/" --no-paginate --max-keys 1000) || bg_die 'Cannot list current frontend'
  jq -e '.IsTruncated==false and (.Contents|length)>0 and ([.Contents[].Size]|add<=536870912) and ([.Contents[].Size<=67108864]|all)' <<<"$listing" >/dev/null || bg_die 'Current frontend is absent or exceeds capture limits'
  mkdir "$FE_TEMP/baseline"
  while IFS=$'\t' read -r path expected; do
    path=${path#"$FE_LIVE/"}; fe_path "$path"
    mkdir -p "$(dirname "$FE_TEMP/baseline/$path")"
    metadata=$(fe_get "$FE_LIVE/$path" "$FE_TEMP/baseline/$path") || bg_die 'Current frontend capture failed'
    [[ $(jq -r .ETag <<<"$metadata") == "$expected" ]] || bg_die 'Current frontend changed during capture'
    bg_touch
  done < <(jq -r '.Contents[]|[.Key,.ETag]|@tsv' <<<"$listing")
  again=$(fe_aws s3api list-objects-v2 --bucket "$FE_BUCKET" --prefix "$FE_LIVE/" --no-paginate --max-keys 1000) || bg_die 'Cannot recheck current frontend'
  [[ $(jq -Sc '[.Contents[]|{Key,ETag,Size}]|sort_by(.Key)' <<<"$listing") == "$(jq -Sc '[.Contents[]|{Key,ETag,Size}]|sort_by(.Key)' <<<"$again")" ]] || bg_die 'Current frontend changed during capture'
  fe_manifest "$FE_TEMP/baseline" "$baseline" "$(jq -r .previous_backend_image <<<"$STATE")" ''
  fe_public_check "$FE_TEMP/release.json"
  fe_archive "$FE_TEMP/baseline" "$FE_TEMP/release.json"
  fe_pointer_write "$(jq -cn --arg current "$baseline" '{schema_version:1,current:$current,previous:null,pending:null}')"
}
fe_stage() {
  local release="$GITHUB_SHA-$RUN_ID" previous
  fe_temp; fe_preflight; fe_pointer_read
  [[ $FE_POINTER != null ]] || fe_capture_baseline
  jq -e '.pending==null' <<<"$FE_POINTER" >/dev/null || bg_die 'Frontend transaction requires reconciliation'
  previous=$(jq -r .current <<<"$FE_POINTER")
  fe_download_release "$previous" "$FE_TEMP/previous"
  [[ $(jq -r .backend_image "$FE_TEMP/download-manifest.json") == "$(jq -r .previous_backend_image <<<"$STATE")" ]] || bg_die 'Current frontend/backend pair differs'
  fe_public_check "$FE_TEMP/download-manifest.json"
  fe_manifest "${BG_FRONTEND_DIST:?}" "$release" "$(jq -r .image <<<"$STATE")" "$GITHUB_SHA"
  fe_archive "$BG_FRONTEND_DIST" "$FE_TEMP/release.json"
  fe_pointer_write "$(jq -c --arg release "$release" --argjson state "$STATE" '.pending={release_id:$release,previous_release_id:.current,run_id:$state.run_id,source_commit:$state.sha,control_sha:$state.control_sha,deployment_id:$state.deployment_id,status:"staged"}' <<<"$FE_POINTER")"
  bg_save "$(jq -c --arg release "$release" --arg previous "$previous" --arg etag "$FE_ETAG" '.frontend={release_id:$release,previous_release_id:$previous,etag:$etag,published:false,recovered:false,finalized:false}' <<<"$STATE")"
  rm -rf -- "$FE_TEMP"
}
fe_owned_pointer() {
  fe_pointer_read
  jq -e --argjson state "$STATE" '.current==$state.frontend.previous_release_id and
    .pending.release_id==$state.frontend.release_id and .pending.previous_release_id==$state.frontend.previous_release_id and
    .pending.run_id==$state.run_id and .pending.source_commit==$state.sha and
    .pending.control_sha==$state.control_sha and .pending.deployment_id==$state.deployment_id' <<<"$FE_POINTER" >/dev/null || bg_die 'Frontend pointer belongs to another release'
  [[ $FE_ETAG == "$(jq -r .frontend.etag <<<"$STATE")" ]] || bg_die 'Frontend pointer ETag changed'
}
fe_publish_files() {
  local directory=$1 manifest=$2 path type
  # Keep all previous hashed assets. index.html is the last object overwritten.
  while IFS= read -r path; do
    type=application/octet-stream
    case $path in *.html) type='text/html; charset=utf-8';; *.js) type='text/javascript; charset=utf-8';; *.css) type='text/css; charset=utf-8';; *.json) type=application/json;; *.webmanifest) type=application/manifest+json;; *.png) type=image/png;; *.svg) type=image/svg+xml;; *.ico) type=image/x-icon;; *.jpg|*.jpeg) type=image/jpeg;; *.webp) type=image/webp;; *.woff2) type=font/woff2;; *.txt) type='text/plain; charset=utf-8';; esac
    bg_guard; bg_live; fe_owned_pointer
    fe_aws s3api put-object --bucket "$FE_BUCKET" --key "$FE_LIVE/$path" --body "$directory/$path" --content-type "$type" --cache-control 'no-cache, max-age=0, must-revalidate' >/dev/null || bg_die 'Frontend publication failed or uncertain'
    fe_get "$FE_LIVE/$path" "$FE_TEMP/verify-file" >/dev/null || bg_die 'Frontend live readback failed'
    cmp -s "$directory/$path" "$FE_TEMP/verify-file" || bg_die 'Frontend live readback differs'
    bg_touch
  done < <(jq -r '.files[].path|select(.!="index.html")' "$manifest"; printf '%s\n' index.html)
  fe_public_check "$manifest"
}
fe_publish() {
  fe_temp; fe_owned_pointer
  fe_download_release "$(jq -r .frontend.release_id <<<"$STATE")" "$FE_TEMP/candidate"
  jq -e --argjson state "$STATE" '.backend_image==$state.image and .source_commit==$state.sha and .run_id==$state.run_id and .deployment_id==$state.deployment_id and .control_sha==$state.control_sha' "$FE_TEMP/download-manifest.json" >/dev/null || bg_die 'Candidate frontend manifest context differs'
  fe_pointer_write "$(jq -c '.pending.status="publishing"' <<<"$FE_POINTER")"
  bg_save "$(jq -c --arg etag "$FE_ETAG" '.frontend.etag=$etag | .frontend.publication_started=true' <<<"$STATE")"
  fe_publish_files "$FE_TEMP/candidate" "$FE_TEMP/download-manifest.json"
  fe_pointer_write "$(jq -c '.pending.status="published"' <<<"$FE_POINTER")"
  bg_save "$(jq -c --arg etag "$FE_ETAG" --argjson now "$(bg_now)" '.frontend.etag=$etag | .frontend.published=true | .frontend.published_at=$now' <<<"$STATE")"
  rm -rf -- "$FE_TEMP"
}
fe_observe_prepare() {
  fe_temp; fe_owned_pointer
  fe_get "$FE_ARCHIVE/$(jq -r .frontend.release_id <<<"$STATE")/release.json" "$FE_TEMP/observe-manifest.json" >/dev/null || bg_die 'Frontend observation manifest missing'
  fe_validate_manifest "$FE_TEMP/observe-manifest.json"
  jq -e --argjson state "$STATE" '.release_id==$state.frontend.release_id and .backend_image==$state.image and .source_commit==$state.sha and .run_id==$state.run_id and .deployment_id==$state.deployment_id and .control_sha==$state.control_sha' "$FE_TEMP/observe-manifest.json" >/dev/null || bg_die 'Frontend observation context differs'
  jq '.files |= map(select(.path=="index.html" or .path=="sw.js" or .path=="manifest.webmanifest"))' "$FE_TEMP/observe-manifest.json" > "$FE_TEMP/critical-manifest.json"
}
fe_observe_check() {
  fe_owned_pointer
  fe_public_check "$FE_TEMP/critical-manifest.json"
}
fe_finalize() {
  fe_temp; fe_owned_pointer
  jq -e '.frontend.published==true and .frontend.recovered==false' <<<"$STATE" >/dev/null || bg_die 'Frontend was not verified'
  fe_download_release "$(jq -r .frontend.release_id <<<"$STATE")" "$FE_TEMP/final"
  fe_public_check "$FE_TEMP/download-manifest.json"
  fe_pointer_write "$(jq -c '.previous=.current | .current=.pending.release_id | .pending=null' <<<"$FE_POINTER")"
  bg_save "$(jq -c --arg etag "$FE_ETAG" '.frontend.etag=$etag | .frontend.finalized=true' <<<"$STATE")"
  rm -rf -- "$FE_TEMP"
}
fe_recover() {
  fe_temp; fe_owned_pointer
  fe_download_release "$(jq -r .frontend.previous_release_id <<<"$STATE")" "$FE_TEMP/previous"
  [[ $(jq -r .backend_image "$FE_TEMP/download-manifest.json") == "$(jq -r .previous_backend_image <<<"$STATE")" ]] || bg_die 'Rollback backend pair differs'
  fe_publish_files "$FE_TEMP/previous" "$FE_TEMP/download-manifest.json"
  fe_pointer_write "$(jq -c '.pending=null' <<<"$FE_POINTER")"
  bg_save "$(jq -c --arg etag "$FE_ETAG" '.frontend.etag=$etag | .frontend.recovered=true' <<<"$STATE")"
  rm -rf -- "$FE_TEMP"
}
