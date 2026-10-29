# 서버별 배포 작업의 실행 허가와 결과

`infra/blue-green-deploy/scripts/actions/app.sh`가 앱 A/B의 로컬 진입점이다.
`backend-app-operation.yml`이 해당 앱의 전용 runner와 GitHub environment를 선택한다.
전체 native DAG는 [Actions 계약](github-actions-adapter.md), 설치는
[배포 적용 절차](controller/full-deployment.md)를 따른다.

## 실행 허가

```text
coordinator: pending {id, operation, slot, deadline} 저장
앱 job: 부모 run·control checkout HEAD·실제 EC2·최신 허가 확인
        → 각 동작 직전 재확인 → 로컬 관리 API/Docker 작업 → result output
coordinator: native needs 이후 result와 최신 pending 대조 → 다음 단계 허가
```

공통 검증은 환경·deployment ID·실제 부모 run ID/attempt/SHA·control SHA·이미지·slot·
operation·deadline을 확인한다. 실제 GitHub 부모가 진행 중이어야 하며 첫 attempt만 허용한다.
최초 JSON을 캐시해서 계속 실행하지 않는다. pending이 있는 동안은 pending deadline과
전체 expires_at이 유효해야 한다. 60초 heartbeat는 pending 없는 coordinator 대기에만 적용한다.

IMDSv2로 실제 instance ID를 확인하며 IMDSv1·proxy·redirect로 대체하지 않는다.
앱은 Nginx 전환이나 EC2 시작·중지를 수행하지 않는다. Nginx의 최신 저널은 고정 host key와
읽기 전용 SSH 키로 읽는다. helper는 한 환경의 고정 경로를 최대 4MiB까지 읽으며
SSH 인자·`SSH_ORIGINAL_COMMAND`로 경로나 환경을 고르지 않는다.

## 후보 준비와 worker 인계

후보는 승인 이미지 digest와 root 소유 Compose를 사용한다. 설치된 Compose는 control tag의
템플릿과 일치해야 한다. 컨테이너의 실제 DB URL·host·환경·PAUSED·dev 발송 차단을 대조한다.
정상 롤백 뒤 남은 standby도 PAUSED·작업 종료·타 호스트의 정확한 DB 권한이 증명돼야
SIGTERM 정상 종료 후 교체한다. 알 수 없는 컨테이너를 지우지 않는다.

`handoff`는 현재 owner 확인 → BEGIN/HANDOFF → PAUSE → drain → RELEASE 순서다.
PAUSE 성공은 작업 종료를 뜻하지 않는다. 실제 발송과 finish commit이 끝나야 RELEASE하며,
DB UNASSIGNED와 로컬 drain을 확인한 뒤 후보를 ACTIVATE한다.
관찰 뒤 COMPLETE하고 봉인된 허가로 이전 앱을 중지한다.
롤백은 후보 PAUSE/drain/RELEASE 성공 뒤에만 이전 앱을 ACTIVATE/OBSERVE/COMPLETE한다.
후보 readiness가 DOWN이어도 관리 API의 신원·worker 권한·활동 상태가 확실하면 후보 반납을
진행할 수 있다. 관리 상태가 미확정이면 이전 HTTP만 복구하고 이전 worker는 재개하지 않는다.

loopback 상태 변경 POST는 원본 CAS payload와 명령 ID를 로컬 저널에 먼저 저장한다.
토큰·payload를 로그로 출력하지 않고 proxy·redirect·transport retry를 사용하지 않는다.
응답 유실·5xx·잘못된 응답·후속 조회 실패는 자동 재전송하지 않는다.
허가 철회는 이미 보낸 POST를 취소한 증거가 아니다. pending과 미확정 상태를 보존한다.

## 결과와 종료 증거

`result`는 raw Spring snapshot에 다음 필드를 더한 JSON이다.

| 필드 | 의미 |
| --- | --- |
| instance_id, slot | IMDSv2 인스턴스와 승인 slot |
| operation, deployment_id, run_id | 실행 작업과 원래 배포·부모 실행 |
| pending_id, grant_id | 같은 pending UUID를 나타내는 두 필드 |
| image | 승인 digest와 연결된 실제 앱 version |
| healthy, running, normal_exit | Boolean 상태; normal_exit 기본 false |
| observed_started_at, observed_finished_at | observe의 Unix 시각; 최소 900초 검증 |

Spring 원본의 boot·host·환경·authority·worker와 activity 카운터를 함께 검증한다.
없는 카운터를 0으로 채우거나 문자열 true를 Boolean으로 바꾸지 않는다.
앱별 `result`를 native output으로 전달하며 dispatch child artifact는 사용하지 않는다.

`stop`은 SEALED와 target의 정확한 boot 권한·이전 앱 PAUSED·모든 활동 0을 확인한다.
Docker 컨테이너 세대를 고정하고 SIGTERM 후 종료를 기다리며 강제 kill을 하지 않는다.
종료 코드 0/143, OOM false, 재시작 없음이 증명돼야 normal_exit=true를 출력한다.
coordinator가 이 결과와 현재 target 경로·지표를 수용한 뒤 이전 EC2를 중지한다.
시간 초과나 종료 불확실성은 두 EC2와 pending을 보존한다.
