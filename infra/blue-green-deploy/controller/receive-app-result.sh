#!/usr/bin/env bash
# authorized_keys의 고정 명령이 슬롯을 지정한다. 앱 키에는 배포 명령 실행 권한이 없다.
set -euo pipefail
umask 077

receive() {
  local slot=$1 root=$2 verb run sha operation extra state directory path pending
  [[ $slot == A || $slot == B ]] || return 1
  read -r verb run sha operation extra <<< "${SSH_ORIGINAL_COMMAND:-}"
  [[ $run =~ ^[1-9][0-9]{0,18}$ && $sha =~ ^[a-f0-9]{40}$ && -z $extra ]] || return 1
  [[ $SSH_ORIGINAL_COMMAND == "$verb $run $sha $operation" ]] || return 1
  case "$verb:$operation" in
    poll:prepare|poll:handoff|poll:activate|poll:observe|poll:complete|poll:stop|send:prepare|send:handoff|send:activate|send:observe|send:complete|send:stop|fail:lane) ;;
    *) return 1 ;;
  esac
  directory="$root/results-$run-$sha"
  state=$(jq -ces --arg run "$run" --arg sha "$sha" '
    select(length==1) | .[0] | select(.environment=="prod" and .mode=="deploy" and .attempt==1 and
      (.run_id|tostring)==$run and .sha==$sha and .old!=.target and .frontend_only!=true)' "$root/state.json") || return 1
  # 결과 폴더는 해당 실행의 Nginx 잡만 열 수 있다.
  if [[ ! -d $directory ]]; then [[ $verb == poll ]] && echo wait; return; fi
  [[ ! -L $directory && -O $directory ]] || return 1
  if [[ $verb == fail ]]; then
    : > "$directory/$slot.failed"
    return
  fi
  local role=target
  case $operation in handoff|stop) role=old;; esac
  jq -e --arg slot "$slot" --arg role "$role" '.[$role]==$slot' <<< "$state" >/dev/null || return 1
  if [[ $verb == poll ]]; then
    if [[ -f $directory/closed ]] || jq -e '.cleanup_deferred==true or (.phase|IN("NEEDS_ATTENTION","ROLLING_BACK","ROLLED_BACK","COMPLETE"))' <<< "$state" >/dev/null; then echo closed
    elif jq -e --arg slot "$slot" --arg op "$operation" '.pending.slot==$slot and .pending.operation==$op and .pending.deadline>now' <<< "$state" >/dev/null; then echo ready
    else echo wait; fi
    return
  fi
  [[ ! -e $directory/closed ]] || return 1
  pending=$(jq -er --arg slot "$slot" --arg op "$operation" '
    select(.pending.slot==$slot and .pending.operation==$op and .pending.deadline>now) | .pending.id' <<< "$state") || return 1
  # 바이트 제한은 줄바꿈이 없는 입력에도 적용한다. 결과는 같은 파일시스템에서 한 번만 게시한다.
  tmp=$(mktemp "$directory/.incoming.XXXXXX")
  trap 'rm -f -- "$tmp"' EXIT
  head -c 65537 > "$tmp"
  (( $(wc -c < "$tmp") <= 65536 )) || return 1
  jq -es --arg op "$operation" --arg slot "$slot" --arg run "$run" --arg grant "$pending" --arg dep "$(jq -r .deployment_id <<< "$state")" '
    length==1 and (.[0] | type=="object" and .operation==$op and .slot==$slot and (.run_id|tostring)==$run and
    .grant_id==$grant and .pending_id==$grant and .deployment_id==$dep)' "$tmp" >/dev/null || return 1
  path="$directory/$slot.$operation.json"
  if ! ln "$tmp" "$path" 2>/dev/null; then cmp -s "$tmp" "$path" || return 1; fi
  rm -f -- "$tmp"
  trap - EXIT
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  [[ $# == 1 && $(id -un) == jarihana-coordinator ]]
  (receive "$1" /var/lib/jarihana-deploy/prod)
fi
