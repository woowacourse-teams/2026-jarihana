#!/usr/bin/env bash
# 허가가 도착하면 기존 app.sh를 실행한다. 같은 앱 작업을 자동 재시도하지 않는다.
set -euo pipefail
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../actions" && pwd)
source "$script_dir/common.sh"

exchange() {
  local address hosts key
  address=$(jq -er '.coordinator_address | select(test("^[0-9.]+$"))' <<< "$CONFIG")
  hosts=$(jq -er '.known_hosts' <<< "$CONFIG"); key="/etc/jarihana-deploy/prod/result-key"
  bg_root_file "$key" 16384 true; bg_root_file "$hosts"
  timeout 12 ssh -T -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
    -o "UserKnownHostsFile=$hosts" -i "$key" -o ConnectTimeout=3 \
    "jarihana-coordinator@$address" "$1 $RUN_ID $GITHUB_SHA $2"
}

lane() {
  local operation=$1 decision deadline output limit next_check=0 jobs
  bg_init app
  if [[ $operation == failed ]]; then exchange fail lane </dev/null; return; fi
  deadline=$((SECONDS+7200))
  while (( SECONDS<deadline )); do
    decision=$(exchange poll "$operation" </dev/null)
    case $decision in
      ready) break;;
      closed) echo '상태 기록에 따라 후속 앱 작업을 종료합니다.'; return 0;;
      wait)
        if (( SECONDS >= next_check )); then
          jobs=$(bg_github "/repos/$REPO/actions/runs/$RUN_ID/attempts/1/jobs?per_page=100")
          jq -e 'all(.jobs[]|select((.name|split(" / ")|last)=="전환과 관측"); .conclusion==null or .conclusion=="success")' <<< "$jobs" >/dev/null || bg_die '배포 제어 잡이 중단됐습니다.'
          next_check=$((SECONDS+30))
        fi
        sleep 3;;
      *) bg_die '코디네이터의 응답을 확인할 수 없습니다.';;
    esac
  done
  [[ $decision == ready ]] || bg_die '앱 작업 허가 대기 시간이 만료됐습니다.'
  result_file=$(mktemp); trap 'rm -f -- "$result_file"' EXIT
  case $operation in prepare) limit=22m;; observe) limit=20m;; *) limit=8m;; esac
  # app.sh가 실행 신원, 호스트, 허가 기한과 소유권을 다시 확인한다.
  GITHUB_OUTPUT="$result_file" timeout --kill-after=15s "$limit" bash "$script_dir/app.sh" "$operation"
  [[ $(wc -l < "$result_file") -eq 3 && $(head -n 1 "$result_file") == "result<<$(tail -n 1 "$result_file")" ]] || bg_die '앱 완료 결과 형식이 올바르지 않습니다.'
  output=$(sed -n '2p' "$result_file" | jq -ce --arg op "$operation" 'select(.operation==$op)')
  exchange send "$operation" <<< "$output"
  rm -f -- "$result_file"; trap - EXIT
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then (lane "$1"); fi
