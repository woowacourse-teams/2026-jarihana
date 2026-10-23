#!/usr/bin/env bash
set -euo pipefail

export AWS_REGION=ap-northeast-2 AWS_DEFAULT_REGION=ap-northeast-2
export AWS_PAGER='' AWS_CLI_AUTO_PROMPT=off AWS_MAX_ATTEMPTS=1
export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE
unset AWS_ROLE_ARN AWS_WEB_IDENTITY_TOKEN_FILE AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
unset AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_ENDPOINT_URL AWS_ENDPOINT_URL_EC2 AWS_ENDPOINT_URL_STS
export AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true AWS_EC2_METADATA_DISABLED=false

fail() {
  printf 'COORDINATOR_CHECK_FAILED %s\n' "$1" >&2
  exit 1
}

[[ $# == 0 ]] || fail 'arguments are not accepted'
[[ $(id -un) == jarihana-coordinator ]] || fail 'unexpected service user'
for command in aws curl docker jq; do
  command -v "$command" >/dev/null || fail "missing command: $command"
done

token="$(curl --noproxy '*' --fail --silent --show-error --max-time 3 -X PUT \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)"
instance="$(curl --noproxy '*' --fail --silent --show-error --max-time 3 \
  -H "X-aws-ec2-metadata-token: ${token}" http://169.254.169.254/latest/meta-data/instance-id)"
unset token
[[ "$instance" == i-01449d708ceef309b ]] || fail 'unexpected coordinator instance'

aws=(aws --cli-connect-timeout 5 --cli-read-timeout 10)
identity="$("${aws[@]}" sts get-caller-identity --output json)"
jq -e --arg arn "arn:aws:sts::843255971531:assumed-role/ec2-project/${instance}" \
  '.Account == "843255971531" and .Arn == $arn' <<< "$identity" >/dev/null \
  || fail 'unexpected AWS role'
printf 'COORDINATOR_IDENTITY_OK %s\n' "$instance"

for target in i-0a43bb4e0154e0f1f i-0514c6d8a5ce04737 i-0430ff91d1af2fb37; do
  for operation in start-instances stop-instances; do
    if result="$("${aws[@]}" ec2 "$operation" --instance-ids "$target" --dry-run 2>&1)"; then
      fail 'dry-run unexpectedly returned success'
    fi
    case "$result" in
      *'(DryRunOperation)'*) printf 'EC2_DRY_RUN_ALLOWED %s %s\n' "$target" "$operation" ;;
      *'(UnauthorizedOperation)'*) fail "EC2 permission denied: $target $operation" ;;
      *) fail "EC2 permission unverified: $target $operation" ;;
    esac
  done
done

running="$(docker inspect --format '{{.State.Running}}' jarihana-nginx-rehearsal-nginx-1)"
[[ "$running" == true ]] || fail 'rehearsal Nginx is not running'
body="$(curl --noproxy '*' --fail --silent --show-error --connect-timeout 3 --max-time 10 \
  'http://10.0.3.51:18080/api/groups?size=1')"
jq -e '.success == true' <<< "$body" >/dev/null || fail 'unexpected API response'
printf 'NGINX_DEV_API_OK\nCOORDINATOR_CHECK_PASSED\n'
