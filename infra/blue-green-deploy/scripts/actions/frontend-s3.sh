#!/usr/bin/env bash
# Reuse credentials within one transfer; keep each guarded S3 request independent.
fe_s3_auth() (
  set -euo pipefail
  umask 077
  local now marker transport refresh version credentials expiration config
  exec 7>"$FE_S3_CACHE.lock"
  flock -w 30 7 || bg_die 'Frontend credential lock timed out'
  if [[ -f $FE_S3_CACHE ]]; then cat "$FE_S3_CACHE"; return; fi
  now=$(bg_now)
  if [[ -n ${FE_S3_AUTH:-} ]]; then
    read -r marker transport refresh <<<"$FE_S3_AUTH"
    if [[ $marker == '#frontend-s3' && $refresh =~ ^[0-9]+$ ]] &&
       { [[ $transport == awscli ]] || [[ $transport == curl && $refresh -gt $now ]]; }; then
      printf '%s\n' "$FE_S3_AUTH" >"$FE_S3_CACHE"
      cat "$FE_S3_CACHE"
      return
    fi
  fi
  version=$(curl -q --version) || bg_die 'Cannot inspect frontend curl'
  # curl 8.4 also bounds responses without a known Content-Length.
  if [[ ! $version =~ ^curl\ ([0-9]+)\.([0-9]+)\. ]] ||
     (( BASH_REMATCH[1]<8 || (BASH_REMATCH[1]==8 && BASH_REMATCH[2]<4) )) ||
     [[ -n ${AWS_ENDPOINT_URL_S3:-${AWS_ENDPOINT_URL:-}} ]]; then
    printf '#frontend-s3 awscli 0\n' >"$FE_S3_CACHE"
    cat "$FE_S3_CACHE"
    return
  fi
  credentials=$(fe_aws_cli configure export-credentials --format process) || bg_die 'Cannot resolve frontend credentials'
  jq -e '
    .Version==1 and
    (.AccessKeyId|type=="string" and test("^[A-Za-z0-9]+$")) and
    (.SecretAccessKey|type=="string" and length>0 and (test("[\r\n]")|not)) and
    ((.SessionToken // "")|type=="string" and (test("[\r\n]")|not)) and
    (.Expiration==null or (.Expiration|type=="string" and length>0))
  ' <<<"$credentials" >/dev/null || bg_die 'Invalid frontend credentials'
  expiration=$(jq -r '.Expiration // empty' <<<"$credentials")
  refresh=$((now+300))
  if [[ -n $expiration ]]; then
    expiration=$(date -d "$expiration" +%s) || bg_die 'Invalid frontend credential expiration'
    (( expiration>now )) || bg_die 'Frontend credentials expired'
    if (( expiration-60<refresh )); then refresh=$((expiration-60)); fi
    if (( refresh<now )); then refresh=$now; fi
  fi
  config=$(jq -r '
    "user = " + ((.AccessKeyId + ":" + .SecretAccessKey)|@json),
    (if (.SessionToken // "")!="" then "header = " + (("x-amz-security-token: " + .SessionToken)|@json) else empty end)
  ' <<<"$credentials") || bg_die 'Cannot prepare frontend authentication'
  # The parent retains this in memory; each batch removes its private disk copy.
  printf '#frontend-s3 curl %s\n%s\n' "$refresh" "$config" >"$FE_S3_CACHE"
  cat "$FE_S3_CACHE"
)

fe_s3_request() {
  local key=$6 auth transport code etag checksum digest limit
  local -a options=() tls=()
  auth=$(fe_s3_auth) || return 1
  read -r _ transport _ <<<"$auth"
  if [[ $transport == awscli ]]; then fe_aws_cli "$@"; return; fi
  [[ $transport == curl ]] || return 1
  [[ -z ${AWS_CA_BUNDLE:-} ]] || tls=(--cacert "$AWS_CA_BUNDLE")
  if [[ $2 == get-object ]]; then
    limit=${8#bytes=0-}
    options=(--range "0-$limit" --max-filesize "$((limit+1))" --header 'Accept-Encoding: identity' --output "$9")
  else
    checksum=${10}
    digest=$(printf '%s' "$checksum" | base64 -d | od -An -tx1 | tr -d ' \n') || return 1
    [[ $digest =~ ^[a-f0-9]{64}$ ]] || return 1
    options=(--upload-file "$8" --header 'Expect:' --header "x-amz-content-sha256: $digest"
      --header "x-amz-checksum-sha256: $checksum" --max-filesize 1048576 --output "$FE_TEMP/s3-response")
    if [[ ${11} == --if-none-match ]]; then
      options+=(--header 'If-None-Match: *')
    else
      options+=(--header "Content-Type: ${12}" --header "Cache-Control: ${14}")
    fi
  fi
  # No retries or redirects. Credentials enter curl through stdin, never argv.
  code=$(curl -q --config - --silent --show-error --proto '=https' --max-redirs 0 \
    --aws-sigv4 'aws:amz:ap-northeast-2:s3' --connect-timeout 3 --speed-limit 1 --speed-time 30 \
    "${tls[@]}" "${options[@]}" --dump-header "$FE_TEMP/s3-headers" --write-out '%{http_code}' \
    "https://$FE_BUCKET.s3.ap-northeast-2.amazonaws.com/$key" <<<"$auth") || return 1
  if [[ $2 == get-object ]]; then
    [[ $code == 200 || $code == 206 ]] || return 1
    etag=$(bg_rate_header "$FE_TEMP/s3-headers" etag)
    [[ -n $etag && $etag != *$'\n'* ]] || return 1
    jq -cn --arg etag "$etag" '{ETag:$etag}'
  else
    [[ $code == 200 ]] || return 1
    digest=$(bg_rate_header "$FE_TEMP/s3-headers" x-amz-checksum-sha256)
    [[ $digest == "$checksum" ]] || return 1
    jq -cn --arg checksum "$digest" '{ChecksumSHA256:$checksum}'
  fi
}
