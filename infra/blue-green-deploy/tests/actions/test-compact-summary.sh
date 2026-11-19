#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd)
summary="$root/.github/scripts/compact-release-summary.jq"
render() { jq -r --arg url https://example.invalid/run -f "$summary"; }
ok='[{"name":"배포 / 배포 결과","conclusion":"success"},{"name":"배포 / 러너 대기 감시","conclusion":"success"}]'
report=$(render <<< "$ok")
[[ $report == *'배포 성공'* && $report == *'복구 해당 없음'* ]]
report=$(CLEANUP_DEFERRED=true render <<< "$ok")
[[ $report == *'종료 보류'* ]]
failure='[{"name":"배포 / 전환과 관측","id":7,"conclusion":"failure","steps":[{"name":"프론트 전용 릴리스 게시","conclusion":"success"},{"name":"공개 경로와 서비스 지표를 5분간 관측","conclusion":"failure"}]},{"name":"배포 / 프론트 버전 복구","conclusion":"success"},{"name":"배포 / 배포 결과","conclusion":"failure"}]'
report=$(render <<< "$failure")
[[ $report == *'배포 실패'* && $report == *'프론트 전용 복구 완료'* && $report == *'/job/7'* ]]
report=$(jq '.[1].conclusion="failure"' <<< "$failure" | render)
[[ $report == *'전체 복구 완료 기록 없음'* ]]
report=$(jq '.+[{name:"배포 / 전체 복구 확정",conclusion:"success"}]' <<< "$failure" | render)
[[ $report == *'전체 롤백 완료'* && $report == *'배포 실패'* ]]
echo 'PASS compact-summary 성공, 중단 스텝, 프론트 및 전체 복구, 미확정과 종료 보류'
