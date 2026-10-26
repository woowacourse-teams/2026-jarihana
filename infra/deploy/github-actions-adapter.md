# GitHub Actions 배포 연결 계약

`backend-dev-deploy.yml`과 `backend-prod-deploy.yml`이
`backend-bluegreen-deploy.yml`을 `workflow_call`로 호출한다. 전체 순서는 GitHub의
`jobs`·`needs`·outputs에 드러나며, Bash는 해당 호스트에서 한 단계만 수행한다.
앱은 `backend-app-operation.yml`, Nginx는 `backend-bluegreen-phase.yml`을 재사용한다.
상태 검사마다 workflow를 dispatch하거나 artifact를 다운로드하지 않는다.

## dev 자동 배포 경로 선택

dev 부모 workflow의 hosted `route` job이 빌드 전에 실행된다. 기본값은 기존 배포이며,
repository 변수 `BLUE_GREEN_DEV_ENABLED=true`일 때 develop push를 Blue-Green `deploy`로 선택한다.
push에는 수동 input이 없으므로 선택한 mode를 job output으로 reusable workflow에 넘긴다.
수동 `bootstrap`·`deploy`는 여전히 명시할 수 있지만, dev 자동화 활성 상태의 수동 `legacy`는
실패한다. 실패한 Blue-Green을 기존 방식으로 자동 재시도하지 않는다.

`route` 성공 후 빌드하며, image_tag가 있는 수동 실행은 빌드를 건너뛴다. 배포 job은
route와 build 결과를 함께 확인해 선택된 한 경로만 실행한다. 경로 선택 실패·빌드 실패·취소 시
배포하지 않는다. dev/prod 활성화 변수는 true/false만 허용하며 environment에 중복 등록하지 않는다.
두 변수 모두 true이면 dev 배포를 거부하고, prod가 활성화됐으면 수동 dev Blue-Green도 거부한다.
prod Blue-Green 역시 dev 활성화 상태에서는 거부한다. 이는 공유 prod2의 물리적 격리를 대신하지
않으므로 환경 전환 때는 진행 중 실행을 마치고 dev 앱·runner 설정도 정리해야 한다.

실제 도메인 전환·최초 등록·해제 순서는 [dev 자동화 적용 순서](controller/dev-automatic-deployment.md)에 있다.

## 실행 순서

```text
resolve → plan → prepare(target) → grant-handoff → handoff(old)
        → switch → activate(target) → grant-observe
        → [observe-app(target) || observe-http(coordinator)]
        → seal → complete(target) → grant-stop → stop(old) → stop-ec2
```

두 관찰 job은 각각 최소 900초를 확인한다. `seal`은 두 job의 성공을 모두 기다린다.
처음 수동 bootstrap은 `plan → bootstrap(old) → finish-bootstrap`만 수행한다.
현재 앱 A가 승인 digest로 PAUSED·drained이고 DB 권한 UNASSIGNED, HTTP 대상 A,
대기 B EC2가 stopped일 때만 최초 등록을 허용한다.

전환 후 봉인 전 실패는 모든 선행 앱 job이 끝난 뒤 다음 순서로 복구한다.

```text
rollback-http → release-candidate → grant-rollback-old → resume-old → finish-rollback
```

복구 단계는 `always()`와 명시적인 선행 결과 조건을 사용한다. 후보 worker 반납을
확인하지 못하면 이전 worker를 재개하지 않는다. 후보 관리 상태가 미확정이면
이전 HTTP만 복구하고, readiness DOWN만으로 관리 상태가 확실한 후보의 반납을 막지는 않는다. 정상 롤백도 최종 `result` job은 실패한다.
그 밖의 실패·취소는 `interrupt`가 pending과 양쪽 EC2를 보존하고 확인 필요 상태를 기록한다.
GitHub의 `always()`는 runner 전원 장애나 연결 단절 시 실행을 보장하지 않는다.

## 실행 신원과 보호 경계

- 앱/coordinator job은 repository variable `BLUE_GREEN_CONTROL_REF`로 보호된
  `refs/tags/deployment-control-*`를 checkout하고 `BG_CONTROL_REF`로 전달한다.
  `common.sh`는 실제 checkout HEAD를 root 설정 `topology.control.sha`와 비교한다.
  이미지 digest, 호출한 부모 커밋 SHA, 제어 코드 SHA는 각각 검증한다.
- 실제 GitHub API에서 저장소 ID·부모 workflow·branch·SHA·run ID·첫 attempt·진행 상태를
  조회한다. 재사용 workflow에서도 `GITHUB_WORKFLOW_REF`는 dev/prod 부모 실행 문맥이다.
  UI rerun은 거부한다. 보호 태그를 이동하거나 실패한 pending을 지워 재시도하지 않는다.
- 환경별 A/B runner 라벨은 서로 달라야 한다. 각 job에서 IMDSv2로 실제 EC2를 대조한다.
  앱은 loopback 관리 API만 호출하며 coordinator가 앱 관리 포트나 SSH 명령으로 제어하지 않는다.
- 업무 설정과 Secrets는 각 job의 GitHub `dev`/`prod` environment에서 전달한다.
  dev는 `BLUE_GREEN_RDS_URL`을 명시한다. dev 자동화 비활성 상태의 수동 실습은
  push·scheduler를 false로 강제한다. 활성 상태는 기존 dev의 `PUSH_ENABLED`·
  `PUSH_WORKER_ENABLED`를 사용하되 후보는 제어 활성·START_PAUSED를 유지한다.
  실제 컨테이너의 푸시 설정도 prepare/profile에서 확인한다. 운영 중 변수를 바꾸지 않는다.
- 앱과 coordinator의 GitHub 권한은 Contents/Actions/Packages read다. 별도 hosted
  `queue-guardian` job만 Actions write를 사용해 현재 run을 취소할 수 있다.
  reusable 호출자가 그 권한을 허용해야 하므로 dev/prod 호출 경계도 Actions write다.
  workflow dispatch는 사용하지 않는다.
  앱/coordinator의 `GH_TOKEN`은 실행 중 API 읽기에만 쓰며 저널·설정·결과·watchdog에 저장하지 않는다.
  checkout 자격 증명은 남기지 않고 앱 prepare의 임시 Docker 인증 디렉터리는 정리한다.

## 저널, 허가와 출력

v2 저널은 coordinator 전용 0700 디렉터리의 0600 `state.json`이다.
파일 잠금과 revision/run/pending 비교 뒤 atomic write한다. v1 자동 이관과 미완료 저널의
새 plan은 거부한다. 앱은 고정 host key·읽기 전용 SSH helper로 최신 허가를 매번 읽는다.
각 허가 조회는 실제 부모 run이 살아 있는지와 전체 만료·pending deadline을 함께 검증한다.
읽기 전용 관찰에서 성공한 부모 run 조회만 프로세스 안에서 최대 30초 재사용한다.
모든 상태 변경의 부모 검증은 캐시 없이 수행하고, SSH 저널 허가는 관찰 때도 매번 새로 읽는다.
부모 run의 `queued`·`waiting`·`pending`·`requested`는 재사용 job 사이에도 나타날 수 있는
진행 상태다. 실행 ID·SHA·attempt·저장소와 작업 경로를 검증하고 `conclusion=null`인 경우에만
유효한 run으로 취급한다. 종료·취소된 run과 알 수 없는 상태는 허용하지 않는다.
guardian은 실행 식별값 불일치와 lifecycle 오류를 구분하고, 식별값이 다르면 실패한 필드 이름만 기록한다.

전체 기한은 7200초, prepare 허가는 EC2 running 확인 후 1500초, observe는 1800초,
그 밖의 앱 허가는 600초다. 앱 job 제한은 prepare 22분, observe 20분, 그 밖에는 8분이다.
runner 대기와 checkout도 허가 시간을 소비하며 기한이 지나면 실패한다.
GitHub self-hosted queue는 `timeout-minutes` 밖이며 기본 제한은
[24시간](https://docs.github.com/en/actions/reference/limits)이다. 이를 그대로 기다리지 않도록
`resolve` 뒤 hosted `queue-guardian`이 DAG와 병렬로 실제 run과 첫 attempt jobs API를 조회한다.
guardian은 30초마다 run과 jobs를 각각 조회한다(정상 상태에서 시간당 약 240회).
앱과 coordinator는 부모 읽기 전용 검증을 각각 30초 재사용하고, coordinator의 앱 job 실패
조회는 15초 간격이다. 건강 검사는 5초 대기 간격을 유지한다. 동일 저장소의 다른 workflow도
GITHUB_TOKEN 예산을 공유하므로 실제 dev 실행에서 총 사용량과 제한 응답을 확인한다.
`queued`이며 `self-hosted` 또는 `jarihana*` 라벨인 job ID를 처음 본 시각부터 300초를 측정한다.
queue에서 사라지면 시계를 지우며 `waiting`/`pending`/needs 대기는 queue timeout으로 취급하지 않는다.
jobs 응답은 2MiB·100개 이내의 완전한 목록이어야 하며 run ID·head SHA를 검증한다.
페이지가 더 필요하거나 조회가 실패하면 정상으로 간주하지 않는다.

300초 도달·전체 7200초 도달·조회 불확실성은 현재 run 취소를 **한 번만** 요청하고 실패한다.
기한 감지는 30초 poll 경계까지 늦어질 수 있으며 API 요청 시간과 GitHub 취소 처리 시간도 더해진다.
취소 응답 유실은 미확정으로 보고하며 POST를 재전송하지 않는다. guardian은 고유 이름
`deployment-result` job의 완료를 보면 끝난다. 결과 job은 guardian을 needs로 기다리지 않는다.
GitHub token은 hosted job 중에만 사용하며 SSH·서버 변경·영구 자격 증명은 추가하지 않는다.
guardian 자체가 시작되지 않거나 GitHub가 취소를 처리하지 못하면 300초 보장은 성립하지 않는다.
실제 dev에서 API의 queued/needs 상태와 재사용 job 이름·라벨·취소 전달을 검증해야 한다.
취소는 서버 정리 완료의 증거가 아니다. 늦게 시작한 앱은 최신 허가 검사에서 거부되며
pending·두 EC2를 보존한다.
pending 앱 job이 실행되는 동안 60초마다 coordinator heartbeat를 갱신할 필요는 없다.
watchdog은 pending이 있으면 그 deadline, 없으면 60초 heartbeat, 항상 전체 만료를 확인한다.
watchdog은 `NEEDS_ATTENTION`만 기록하며 허가 재발급·worker 인계·서버 종료를 하지 않는다.

앱은 `GITHUB_OUTPUT`의 `result` JSON을 출력하고 재사용 workflow가 전달한다.
다음 coordinator job은 `APP_RESULT` 또는 `TARGET_RESULT`로 받아 원래 허가와 실제 신원·
worker 상태·활동 수치·관찰 시각을 검사한다. 비밀값과 worker token은 출력하지 않는다.
세부 결과 필드는 [서버별 작업 계약](child-contract.md)을 따른다.

`seal`은 별도 native output `cleanup_deferred`를 전달한다. 정상 봉인은 `false`이며
`complete-target`은 이 값이 명시적으로 `false`인 경우에만 진행한다. 정상 후보에서 이전 연결만
종료되지 않으면 `true`를 출력하고 저널을 `NEEDS_ATTENTION`으로 남긴다. 후속 종료·자동 롤백을
건너뛰고 결과 job은 신규 서버 유지·양쪽 EC2 확인을 요청하며 실패로 끝낸다. 출력이 유실돼도
저널의 `cleanup_deferred=true` 검사가 HTTP 롤백을 차단한다.

설치와 수동 dev 검증은 [배포 적용 절차](controller/full-deployment.md)를 따른다.
로컬 검증은 실제 GitHub 권한·runner 가용성·보호 규칙·15분 관찰을 증명하지 않는다.

## 모니터링 배포와 동시 실행 방지

Blue-Green 재사용 workflow와 `Monitoring Deploy`는 workflow 수준의
`jarihana-observed-deployment` concurrency group을 공유한다. 모니터링 배포는 Prometheus와
조회용 Nginx를 재생성하므로 Blue-Green 시작부터 결과·롤백 처리까지 겹쳐 실행하지 않는다.
dev/prod가 같은 관측 서버를 사용하므로 환경별로 group을 나누지 않는다.
호출하는 dev/prod 부모와 phase/app 자식에는 이 group을 중복 설정하지 않는다.

`cancel-in-progress: false`와 `queue: max`로 진행 중 작업을 취소하지 않고 후속 작업을 기다리게 한다.
GitHub의 [확장 대기열](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/)은
최대 100개를 대기시키며, 가득 찬 뒤 들어온 작업은 취소되므로 실행 결과를 확인해야 한다.
수동 서버 재시작은 이 잠금을 거치지 않으므로 배포 관찰 중에는 수행하지 않는다.
관측 데이터가 없거나 오래되면 실패시키는 정책은 유지한다.

첫 적용은 두 workflow 변경을 같은 develop PR로 반영하고, 이전 버전으로 시작한 배포가 없는 상태에서
검증한다. 관찰 중 공유 모니터링 서버를 다시 배포하는 실험은 팀 사용 여부를 확인한 뒤 별도로 수행한다.
