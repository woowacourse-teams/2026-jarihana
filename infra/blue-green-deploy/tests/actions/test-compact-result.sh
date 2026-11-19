#!/usr/bin/env bash
# 두 앱이 한 실행 안에서 결과를 전달할 때 지켜야 하는 슬롯과 허가 경계.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
receiver="$here/../../controller/receive-app-result.sh"
dir=$(mktemp -d); trap 'rm -rf -- "$dir"' EXIT
sha=1111111111111111111111111111111111111111
run=23
results="$dir/results-$run-$sha"
request() {
  SSH_ORIGINAL_COMMAND="$2 $run $sha $3" bash -euc 'source "$1"; receive "$2" "$3"' _ "$receiver" "$1" "$dir"
}
reject() {
  if "$@" >/dev/null 2>&1; then echo "거부해야 할 요청이 성공했습니다: $*" >&2; exit 1; fi
}
state() {
  jq -n --arg sha "$sha" --arg slot "$1" --arg operation "$2" --arg phase "$3" '
    {environment:"prod",mode:"deploy",attempt:1,run_id:23,sha:$sha,old:"A",target:"B",deployment_id:"release-23",
     phase:$phase,pending:{slot:$slot,operation:$operation,id:"grant-1",deadline:(now+600)}}' > "$dir/state.json"
}
state B prepare PREPARING
[[ $(request B poll prepare) == wait ]]
mkdir -m 700 "$results"
[[ $(request B poll prepare) == ready && $(request A poll handoff) == wait ]]
reject request A poll prepare
reject request B poll handoff
reject request B send prepare <<< '{}'
value='{"slot":"B","operation":"prepare","run_id":23,"deployment_id":"release-23","pending_id":"grant-1","grant_id":"grant-1"}'
request B send prepare <<< "$value"
request B send prepare <<< "$value"
reject request B send prepare <<< "$(jq -c '.changed=true' <<< "$value")"
reject request A send prepare <<< "$value"
reject request B send prepare <<< "$(jq -c '.grant_id="previous"' <<< "$value")"
reject request B send prepare <<< "$(jq -c '.run_id=1' <<< "$value")"
reject request B send prepare <<< "$(jq -c '.deployment_id="another"' <<< "$value")"
reject request B send prepare < <(head -c 70000 /dev/zero)
[[ $(cat "$results/B.prepare.json") == "$value" ]]
state A handoff HANDOFF
[[ $(request A poll handoff) == ready ]]
touch "$results/closed"
[[ $(request A poll handoff) == closed ]]
reject request B send prepare <<< "$value"
request A fail lane
[[ -f $results/A.failed ]]
rm -- "$results/closed"
state B observe NEEDS_ATTENTION
[[ $(request B poll observe) == closed ]]
state B observe OBSERVING
jq '.cleanup_deferred=true' "$dir/state.json" > "$dir/change"; mv "$dir/change" "$dir/state.json"
[[ $(request B poll complete) == closed ]]
sha=2222222222222222222222222222222222222222
reject request B poll prepare
echo 'PASS compact-result 정상 수신, 슬롯과 실행 격리, 중복과 위변조, 운영 중단 및 종료 보류'
