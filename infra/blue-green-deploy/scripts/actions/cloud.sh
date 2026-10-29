#!/usr/bin/env bash
# Exact-instance AWS operations; uncertain mutation responses are never retried.
bg_host() { jq -cer --arg slot "$1" '.topology | if $slot == "A" then .a elif $slot == "B" then .b else error("slot") end' <<<"$CONFIG"; }
bg_aws() {
  local operation=$1 slot=$2 host region
  host=$(bg_host "$slot"); region=$(jq -r '.ec2.region' <<<"$CONFIG")
  [[ $region == ap-northeast-2 ]] || return 1
  if [[ $operation != describe-instances ]]; then bg_live; fi
  AWS_MAX_ATTEMPTS=1 AWS_PAGER='' AWS_CLI_AUTO_PROMPT=off timeout 12 aws ec2 "$operation" --instance-ids "$(jq -r '.instance_id' <<<"$host")" --region "$region" --endpoint-url "https://ec2.$region.amazonaws.com" --output json --no-cli-pager --cli-connect-timeout 3 --cli-read-timeout 5 "${@:3}"
}
bg_ec2_state() {
  local host raw
  host=$(bg_host "$1"); raw=$(bg_aws describe-instances "$1") || return 1
  jq -er --argjson config "$CONFIG" --argjson host "$host" '
    .Reservations | select(length==1) | .[0] | select(.OwnerId==$config.ec2.account_id) |
    .Instances | select(length==1) | .[0] |
    select(.InstanceId==$host.instance_id and .VpcId==$config.ec2.vpc_id and
      .PrivateIpAddress==($host.upstream|split(":")[0]) and .RootDeviceType=="ebs") |
    .State.Name | select(.=="running" or .=="pending" or .=="stopped" or .=="stopping")' <<<"$raw"
}
bg_ec2_change() {
  local operation=$1 slot=$2 status raw key before
  [[ $operation == start || $operation == stop ]] || return 1
  bg_guard; status=$(bg_ec2_state "$slot") || return 1
  if [[ $operation == start ]]; then
    jq -e --arg s "$slot" '.phase=="PREPARING" and .target==$s and .pending.operation=="prepare"' <<<"$STATE" >/dev/null || return 1
    [[ $status == running || $status == pending ]] && return 0
    [[ $status == stopped ]] || return 1
    key=StartingInstances; before=stopped
    bg_guard; raw=$(bg_aws start-instances "$slot") || return 1
  else
    jq -e --arg s "$slot" '.phase=="SEALED" and .sealed and .old==$s and .old_status.normal_exit==true and .old_status.running==false and .pending.operation=="stop"' <<<"$STATE" >/dev/null || return 1
    [[ $status == stopped || $status == stopping ]] && return 0
    [[ $status == running ]] || return 1
    key=StoppingInstances; before=running
    bg_guard; raw=$(bg_aws stop-instances "$slot" --no-force --no-hibernate) || return 1
  fi
  jq -e --arg key "$key" --arg before "$before" --arg id "$(bg_host "$slot" | jq -r '.instance_id')" '
    .[$key] | length==1 and .[0].InstanceId==$id and .[0].PreviousState.Name==$before and
    (.[0].CurrentState.Name | if $before=="stopped" then .=="pending" or .=="running" else .=="stopping" or .=="stopped" end)' <<<"$raw" >/dev/null || return 1
  bg_guard
}
bg_ec2_wait() {
  local slot=$1 expected=$2 deadline=$(( $(bg_now)+600 ))
  while (( $(bg_now)<deadline )); do
    bg_file_guard
    [[ $(bg_ec2_state "$slot") == "$expected" ]] && return 0
    bg_touch_local; sleep 5
  done
  return 1
}
