#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../actions" && pwd)
source "$script_dir/coordinator.sh"

control() {
  local phase=$1 operation=${2:-} directory slot evidence deadline limit jobs next_check=0 label
  bg_init coordinator
  directory="$(dirname "$STATE_FILE")/results-$RUN_ID-$GITHUB_SHA"
  case $phase in
    open) bg_load; mkdir -m 700 -- "$directory"; return;;
    close) [[ ! -d $directory ]] || touch "$directory/closed"; return;;
    clean)
      bg_load
      jq -e '.phase=="COMPLETE" and .pending==null' <<< "$STATE" >/dev/null
      bg_owned_directory "$directory"
      for slot in A B; do
        for operation in prepare handoff activate observe complete stop; do
          rm -f -- "$directory/$slot.$operation.json"
        done
      done
      rmdir "$directory"; return;;
  esac
  if [[ -n $operation ]]; then
    bg_load
    slot=$(jq -er --arg op "$operation" '.pending | select(.operation==$op) | .slot | select(.=="A" or .=="B")' <<< "$STATE")
    deadline=$(jq -er '.pending.deadline | select(type=="number" and .==floor and .>0)' <<< "$STATE")
    evidence="$directory/$slot.$operation.json"
    if [[ $slot == "$(jq -r .target <<< "$STATE")" ]]; then label='새 앱 서버'; else label='기존 앱 서버'; fi
    until [[ -f $evidence ]]; do
      [[ ! -f $directory/A.failed && ! -f $directory/B.failed ]] || bg_die '앱 서버가 실패를 보고했습니다.'
      (( $(bg_now)<deadline )) || bg_die '허가 기한 안에 앱 완료 결과를 받지 못했습니다.'
      bg_live_cached
      if (( SECONDS>=next_check )); then
        jobs=$(bg_github "/repos/$REPO/actions/runs/$RUN_ID/attempts/1/jobs?per_page=100")
        jq -e --arg label "$label" 'all(.jobs[]|select((.name|split(" / ")|last)==$label); .conclusion==null or .conclusion=="success")' <<< "$jobs" >/dev/null || bg_die '앱 잡이 완료 증거를 전달하기 전에 중단됐습니다.'
        next_check=$((SECONDS+30))
      fi
      sleep 3
    done
    bg_owned_file "$evidence"
    APP_RESULT=$(cat -- "$evidence"); export APP_RESULT
  fi
  # 각 단계가 원래의 잠금, 최신 저널, 허가 ID, 앱 증거와 복구 경계를 검증한다.
  if [[ $phase == switch ]]; then bg_output started true; fi
  case $phase in grant-handoff|stop) limit=12m;; observe|switch|frontend-publish) limit=25m;; *) limit=8m;; esac
  exec timeout --kill-after=15s "$limit" bash "$script_dir/coordinator.sh" "$phase"
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then control "$@"; fi
