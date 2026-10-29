#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/coordinator.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
bg_init() { :; }
bg_live() { [[ ${REVOKED:-false} == false ]] || bg_die 'Parent run revoked'; }
bg_output() { :; }
bg_now() { cat "$CASE_DIR/clock"; }
bg_uptime() { bg_now; }
bg_uuid() { echo aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa; }
bg_route() { echo A; }
bg_target_ready() { return 0; }
bg_ec2_state() { echo running; }
bg_ec2_change() { echo 'Unexpected EC2 mutation' >&2; exit 91; }
bg_ec2_wait() { exit 92; }
bg_github() { echo '{"jobs":[{"name":"candidate-worker-observation","conclusion":"skipped"}]}'; }
sleep() { echo "$(( $(bg_now)+300 ))" >"$CASE_DIR/clock"; }
aws() { :; }
fe_aws() {
  local service=${1:-} operation=${2:-} key='' body='' condition='' expected='' output='' arg file etag
  [[ $service != --version ]] || { echo aws-cli/2.38.5; return; }
  shift 2
  while (( $# )); do
    arg=$1; shift
    case $arg in
      --key) key=$1; shift;; --body) body=$1; shift;;
      --if-match) condition=match; expected=$1; shift;;
      --if-none-match) condition=absent; expected=$1; shift;;
      --bucket|--content-type|--cache-control|--range|--prefix|--max-keys|--id) shift;;
      --no-paginate) :;; *) output=$arg;;
    esac
  done
  file="$CASE_DIR/s3/$key"
  case "$service/$operation" in
    cloudfront/get-distribution-config) echo '{"DistributionConfig":{"Enabled":true,"Aliases":{"Items":["jarihana.com"]},"DefaultCacheBehavior":{"TargetOriginId":"frontend","CachePolicyId":"disabled"},"Origins":{"Items":[{"Id":"frontend","OriginPath":"/jarihana/frontend","DomainName":"techcourse-project-2026.s3.ap-northeast-2.amazonaws.com"}]}}}';;
    cloudfront/get-cache-policy) jq -cn --argjson ttl "${CACHE_TTL:-0}" '{CachePolicy:{CachePolicyConfig:{MinTTL:$ttl,DefaultTTL:$ttl,MaxTTL:$ttl}}}';;
    s3api/head-bucket) :;;
    s3api/list-objects-v2)
      find "$CASE_DIR/s3/$FE_LIVE" -type f | sort | while IFS= read -r path; do
        jq -cn --arg key "${path#"$CASE_DIR/s3/"}" --arg etag "\"$(sha256sum "$path" | cut -d' ' -f1)\"" --argjson size "$(stat -Lc %s "$path")" '{Key:$key,ETag:$etag,Size:$size}'
      done | jq -s '{IsTruncated:false,Contents:.}';;
    s3api/get-object)
      if [[ ${POINTER_ERROR:-false} == true && $key == "$FE_ARCHIVE/state.json" ]]; then echo 'An error occurred (AccessDenied)' >&2; return 1; fi
      if [[ ! -f $file ]]; then echo 'An error occurred (NoSuchKey)' >&2; return 1; fi
      cp "$file" "$output"
      jq -cn --arg etag "\"$(sha256sum "$file" | cut -d' ' -f1)\"" '{ETag:$etag}';;
    s3api/put-object)
      if [[ ${FAIL_KEY:-} == "$key" ]]; then echo 'Simulated upload failure' >&2; return 1; fi
      if [[ $condition == absent && -e $file ]]; then echo 'PreconditionFailed' >&2; return 1; fi
      if [[ $condition == match ]]; then
        [[ -f $file ]] || return 1
        etag="\"$(sha256sum "$file" | cut -d' ' -f1)\""
        [[ $etag == "$expected" ]] || { echo 'PreconditionFailed' >&2; return 1; }
      fi
      if [[ $key == "$FE_ARCHIVE"/* && $key != "$FE_ARCHIVE/state.json" ]]; then [[ $condition == absent ]] || exit 93; fi
      if [[ $key == "$FE_ARCHIVE/state.json" ]]; then [[ -n $condition ]] || exit 94; fi
      printf '%s\n' "$key" >>"$CASE_DIR/writes"
      mkdir -p "$(dirname "$file")"; cp "$body" "$file"
      jq -cn --arg etag "\"$(sha256sum "$file" | cut -d' ' -f1)\"" '{ETag:$etag}';;
    *) echo "Unexpected AWS operation $service/$operation" >&2; return 1;;
  esac
}
curl() {
  local path='' output=''
  while (( $# )); do
    case $1 in
      "$FE_PUBLIC"/*) path=${1#"$FE_PUBLIC/"}; shift;;
      --output) output=$2; shift 2;;
      --proto|--max-redirs|--connect-timeout|--max-time|--max-filesize|--header) shift 2;;
      *) shift;;
    esac
  done
  if [[ ${BAD_PUBLIC:-} == "$path" ]]; then path=index.html; fi
  [[ -f "$CASE_DIR/s3/$FE_LIVE/$path" ]] || return 1
  cp "$CASE_DIR/s3/$FE_LIVE/$path" "$output"
}
fixture_files() {
  local dir=$1 marker=$2
  mkdir -p "$dir/assets" "$dir/icons"
  printf '<html>%s<script src="/assets/%s.js"></script></html>' "$marker" "$marker" >"$dir/index.html"
  echo "$marker worker" >"$dir/sw.js"
  echo '{"name":"app"}' >"$dir/manifest.webmanifest"
  echo "$marker javascript" >"$dir/assets/$marker.js"
  echo "$marker image" >"$dir/icons/pwa-192.png"
}
setup() {
  CASE_DIR="$TEST_DIR/$1"; mkdir -m700 "$CASE_DIR"
  mkdir -m700 "$CASE_DIR/state"
  STATE_FILE="$CASE_DIR/state/state.json"
  echo 1000 >"$CASE_DIR/clock"
  ENVIRONMENT=prod; BG_MODE=deploy; BG_FRONTEND_ONLY=false
  RUN_ID=123; GITHUB_SHA=$(printf '%040d' 2); CONTROL_SHA=$(printf '%040d' 3)
  BG_IMAGE_DIGEST="sha256:$(printf '%064d' 2)"; OLD_DIGEST="sha256:$(printf '%064d' 1)"
  CONFIG=$(cat "$ROOT/infra/blue-green-deploy/controller/full-coordinator.example.json")
  STATE=$(jq -cn --arg sha "$GITHUB_SHA" --arg control "$CONTROL_SHA" --arg image "$BG_IMAGE_DIGEST" --arg old "$OLD_DIGEST" --arg topology "$(bg_topology_digest)" '{schema_version:2,revision:0,environment:"prod",run_id:123,attempt:1,sha:$sha,control_sha:$control,topology_digest:$topology,deployment_id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",image:$image,previous_backend_image:$old,old:"A",target:"B",phase:"PREPARING",mode:"deploy",heartbeat:1000,expires_at:10000,pending:{operation:"frontend-stage",deadline:5000},sealed:false,switched:false,frontend_only:false,observation_failed:false}')
  bg_atomic "$STATE_FILE" "$STATE"
  fixture_files "$CASE_DIR/s3/$FE_LIVE" old
  BG_FRONTEND_DIST="$CASE_DIR/dist"; fixture_files "$BG_FRONTEND_DIST" new
  unset FAIL_KEY POINTER_ERROR BAD_PUBLIC REVOKED CACHE_TTL
}
rejects() {
  local status=0
  ( "$@" ) >"$CASE_DIR/rejection.log" 2>&1 || status=$?
  [[ $status != 0 ]] || { echo "Unexpected success: $*" >&2; return 1; }
  STATE=$(cat "$STATE_FILE")
}
write_count() { if [[ -f $CASE_DIR/writes ]]; then wc -l <"$CASE_DIR/writes"; else echo 0; fi; }
manifest_file() { echo "$CASE_DIR/s3/$FE_ARCHIVE/$GITHUB_SHA-$RUN_ID/release.json"; }
full_round_trip() {
  fe_stage
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
  jq -e --arg backend "$OLD_DIGEST" '.source_commit==null and .backend_image==$backend' "$CASE_DIR/s3/$FE_ARCHIVE/baseline-123/release.json" >/dev/null
  jq -e --arg sha "$GITHUB_SHA" --arg backend "$BG_IMAGE_DIGEST" '.source_commit==$sha and .backend_image==$backend' "$(manifest_file)" >/dev/null
  fe_publish
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *new* && -f $CASE_DIR/s3/$FE_LIVE/assets/old.js ]]
  [[ $(grep "^$FE_LIVE/" "$CASE_DIR/writes" | tail -1) == "$FE_LIVE/index.html" ]]
  fe_recover
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* && -f $CASE_DIR/s3/$FE_LIVE/assets/new.js ]]
  jq -e '.pending==null and .current=="baseline-123"' "$CASE_DIR/s3/$FE_ARCHIVE/state.json" >/dev/null
  jq -e '.frontend.recovered==true' "$STATE_FILE" >/dev/null
}
partial_publish() {
  fe_stage; FAIL_KEY="$FE_LIVE/sw.js"
  rejects fe_publish
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
  unset FAIL_KEY; fe_recover
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/sw.js") == 'old worker' ]]
}
public_fallback_detected() {
  fe_stage; BAD_PUBLIC=assets/new.js
  rejects fe_publish
  jq -e '.frontend.published==false and .frontend.publication_started==true' "$STATE_FILE" >/dev/null
  unset BAD_PUBLIC; fe_recover
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
}
missing_baseline() {
  rm "$CASE_DIR/s3/$FE_LIVE/sw.js"
  rejects fe_stage
  [[ $(write_count) == 0 ]]
}
pointer_permission_not_absent() { POINTER_ERROR=true; rejects fe_stage; [[ $(write_count) == 0 ]]; }
cache_preflight() { CACHE_TTL=1; rejects fe_stage; [[ $(write_count) == 0 ]]; }
symlink_artifact() {
  ln -s /etc/passwd "$BG_FRONTEND_DIST/secret"
  rejects fe_stage
  [[ ! -e $(manifest_file) ]]
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
}
traversal_manifest() {
  fe_stage
  jq '.files[0].path="../escape"' "$(manifest_file)" >"$CASE_DIR/bad.json"
  rejects fe_validate_manifest "$CASE_DIR/bad.json"
}
archive_checksum_mismatch() {
  fe_stage
  echo corrupted >"$CASE_DIR/s3/$FE_ARCHIVE/$GITHUB_SHA-$RUN_ID/files/sw.js"
  local before; before=$(write_count)
  rejects fe_publish
  [[ $(write_count) == "$before" ]]
}
wrong_manifest_release() {
  fe_stage
  jq '.release_id="baseline-999"' "$(manifest_file)" >"$CASE_DIR/mutated"
  cp "$CASE_DIR/mutated" "$(manifest_file)"
  rejects fe_publish
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
}
stale_recovery() {
  fe_stage; fe_publish
  jq '.pending.run_id=999' "$CASE_DIR/s3/$FE_ARCHIVE/state.json" >"$CASE_DIR/mutated"
  cp "$CASE_DIR/mutated" "$CASE_DIR/s3/$FE_ARCHIVE/state.json"
  local before; before=$(write_count)
  rejects main frontend-recover
  [[ $(write_count) == "$before" && $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *new* ]]
  jq -e '.phase=="NEEDS_ATTENTION" and .frontend.recovered==false' "$STATE_FILE" >/dev/null
}
cas_conflict() {
  fe_stage; fe_temp; fe_owned_pointer
  echo '{}' >"$CASE_DIR/s3/$FE_ARCHIVE/state.json"
  rejects fe_pointer_write "$FE_POINTER"
  [[ $(cat "$CASE_DIR/s3/$FE_ARCHIVE/state.json") == '{}' ]]
}
recovery_failure_preserves_intent() {
  fe_stage; fe_publish
  FAIL_KEY="$FE_LIVE/index.html"
  rejects main frontend-recover
  jq -e '.phase=="NEEDS_ATTENTION" and .frontend.recovered==false and .pending!=null' "$STATE_FILE" >/dev/null
  jq -e '.pending!=null' "$CASE_DIR/s3/$FE_ARCHIVE/state.json" >/dev/null
}
revocation_no_replay() {
  fe_stage; fe_publish; REVOKED=true
  local before; before=$(write_count)
  rejects main frontend-recover
  [[ $(write_count) == "$before" ]]
  jq -e '.phase=="NEEDS_ATTENTION" and .frontend.recovered==false' "$STATE_FILE" >/dev/null
}
independent_worker_recovery() {
  fe_stage; fe_publish
  STATE=$(jq '.phase="NEEDS_ATTENTION" | .http_recovered=true | .worker_recovered=false | .pending={operation:"rollback",slot:"B",deadline:5000,id:"unresolved-worker"}' <<<"$STATE")
  bg_atomic "$STATE_FILE" "$STATE"
  main frontend-recover
  jq -e '.frontend.recovered==true and .worker_recovered==false and .phase=="NEEDS_ATTENTION" and .pending.id=="unresolved-worker"' "$STATE_FILE" >/dev/null
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
}
frontend_only_full_observation() {
  local status
  status=$(jq -cn --arg image "$OLD_DIGEST" '{slot:"A",image:$image,running:true,healthy:true,identity:{hostId:"prod-a",bootId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},authority:{status:"ACTIVE",phase:"COMPLETE",owner:{hostId:"prod-a",bootId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}}')
  STATE=$(jq -c --argjson status "$status" '.phase="COMPLETE" | .old_status=$status' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  BG_FRONTEND_ONLY=true
  bg_ec2_state() { exit 95; }
  bg_plan
  jq -e --arg image "$OLD_DIGEST" '.image==$image and .old==.target and .frontend_only==true' "$STATE_FILE" >/dev/null
  main frontend-publish
  STATE=$(cat "$STATE_FILE")
  main observe
  STATE=$(cat "$STATE_FILE")
  jq -e '.http_observed_started_at>=.frontend.published_at and .http_observed_finished_at-.http_observed_started_at==900' "$STATE_FILE" >/dev/null
  main frontend-seal
  jq -e '.phase=="COMPLETE" and .frontend.finalized==true and .old_status.slot=="A"' "$STATE_FILE" >/dev/null
  jq -e --arg release "$GITHUB_SHA-$RUN_ID" '.current==$release and .previous=="baseline-123" and .pending==null' "$CASE_DIR/s3/$FE_ARCHIVE/state.json" >/dev/null
}
observation_before_publish_rejected() {
  fe_stage
  STATE=$(jq '.phase="OBSERVING"' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  rejects main observe
  jq -e '.http_observed_started_at==null' "$STATE_FILE" >/dev/null
}
archive_immutable() {
  fe_stage; fe_temp
  fe_manifest "$BG_FRONTEND_DIST" "$GITHUB_SHA-$RUN_ID" "$BG_IMAGE_DIGEST" "$GITHUB_SHA"
  rejects fe_archive "$BG_FRONTEND_DIST" "$FE_TEMP/release.json"
  [[ $(cat "$CASE_DIR/s3/$FE_ARCHIVE/$GITHUB_SHA-$RUN_ID/files/sw.js") == 'new worker' ]]
}
zero_length_file_rejected() {
  : >"$BG_FRONTEND_DIST/empty.txt"
  rejects fe_stage
  [[ ! -e $(manifest_file) ]]
}
missing_referenced_asset() {
  echo '<script src="/assets/missing.js"></script>' >"$CASE_DIR/s3/$FE_LIVE/index.html"
  rejects fe_stage
  [[ $(write_count) == 0 ]]
}
public_failure_during_observation() {
  fe_stage; fe_publish
  STATE=$(jq '.phase="OBSERVING" | .frontend_only=true | .pending.deadline=5000' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  sleep() { echo "$(( $(bg_now)+30 ))" >"$CASE_DIR/clock"; BAD_PUBLIC=sw.js; }
  rejects main observe
  jq -e '.phase=="NEEDS_ATTENTION" and .http_observed_finished_at==null' "$STATE_FILE" >/dev/null
  fe_recover
  [[ $(cat "$CASE_DIR/s3/$FE_LIVE/index.html") == *old* ]]
}
final_check_before_pointer_commit() {
  fe_stage; fe_publish
  BAD_PUBLIC=sw.js
  rejects fe_finalize
  jq -e '.pending.status=="published" and .current=="baseline-123"' "$CASE_DIR/s3/$FE_ARCHIVE/state.json" >/dev/null
  jq -e '.frontend.finalized==false' "$STATE_FILE" >/dev/null
}
frontend_only_recovery_refreshes_lease() {
  fe_stage; fe_publish
  STATE=$(jq '.frontend_only=true | .target=.old | .pending={operation:"frontend-observe",deadline:1100}' <<<"$STATE"); bg_atomic "$STATE_FILE" "$STATE"
  fe_recover() {
    jq -e '.pending.operation=="frontend-recover" and .pending.deadline==2800' <<<"$STATE" >/dev/null
    echo 2000 >"$CASE_DIR/clock"
    bg_save "$(jq '.frontend.recovered=true' <<<"$STATE")"
  }
  main frontend-recover
  jq -e '.phase=="ROLLED_BACK" and .frontend.recovered==true' "$STATE_FILE" >/dev/null
}
for test in full_round_trip partial_publish public_fallback_detected missing_baseline pointer_permission_not_absent cache_preflight symlink_artifact traversal_manifest archive_checksum_mismatch wrong_manifest_release stale_recovery cas_conflict recovery_failure_preserves_intent revocation_no_replay independent_worker_recovery frontend_only_full_observation observation_before_publish_rejected archive_immutable zero_length_file_rejected missing_referenced_asset public_failure_during_observation final_check_before_pointer_commit frontend_only_recovery_refreshes_lease; do
  ( setup "$test"; "$test" )
  printf 'PASS frontend %s\n' "$test"
done
