# Blue-Green 동작 구조

구성요소, worker 인계, 프론트엔드 상태 저장과 실행 보호 규칙을 설명한다.
전체 그림은 [README](../README.md), 환경 설정은 [서버 구성](server-setup/README.md), 실행은 [배포 실행](deployment.md), 복구는 [장애 복구](recovery.md)를 따른다.
프론트 연계 동작은 배포 실행의 [적용 버전](deployment.md#적용-버전)을 전제로 한다.
선택 이유와 대안은 [인프라 ADR 0005](../../docs/adr/0005-nginx-ec2-blue-green-deployment.md)와
[인프라 ADR 0006](../../docs/adr/0006-s3-paired-frontend-rollback.md)을 따른다.
문서의 예시나 저장소 코드만으로 실제 서버의 설치 및 적용 완료를 판단하지 않는다.

- [구성요소와 요청 경로](#구성요소와-요청-경로)
- [worker 인계와 정상 종료](#worker-인계와-정상-종료)
- [프론트엔드 릴리스](#프론트엔드-릴리스)
- [내부 점검과 관측](#내부-점검과-관측)
- [실행 보호와 기한](#실행-보호와-기한)

## 구성요소와 요청 경로

사용자 요청은 CloudFront에서 정적 파일과 API 경로로 나뉜다. 정적 파일은 S3에서 제공하고,
API는 Nginx가 현재 활성 앱 EC2 A 또는 B로 전달한다. 두 앱은 같은 운영 RDS를 사용한다.
A/B는 고정된 논리 슬롯이며 실제 호스트는 보호된 topology 설정으로 확인한다.

| 구성요소 | 역할 |
| --- | --- |
| GitHub Actions | 이미지와 프론트 빌드, 호스트별 작업 순서와 결과 연결 |
| Nginx와 coordinator | 활성 HTTP 경로 전환, 배포 저널, EC2 시작과 중지, 프론트 파일 게시와 복구 |
| 앱 A/B와 전용 runner | 자기 호스트의 앱 준비, worker 제어, 관찰과 정상 종료 |
| RDS | 앱 데이터와 환경별 worker 처리 권한 저장 |
| S3와 CloudFront | 공개 프론트 파일, 릴리스 원본과 현재 조합 보관 및 제공 |
| Alloy와 Prometheus | 앱, 호스트와 배포 상태 수집 및 배포 관찰에 필요한 지표 조회 |

정상 배포 순서는 [배포 실행](deployment.md#정상-배포-순서),
호스트별 통신과 권한은 [서버 구성](server-setup/README.md#호스트와-네트워크)을 따른다.

## worker 인계와 정상 종료

후보는 `PUSH_WORKER_CONTROL_ENABLED=true`, `PUSH_WORKER_START_PAUSED=true`로 시작한다.
readiness는 앱 상태뿐 아니라 DB와 chatListener 준비 상태를 포함한다.
현재 owner에서 `begin → HANDOFF → pause → drain → release`를 수행하고 DB 권한이
UNASSIGNED가 된 뒤 후보를 activate한다. PAUSE 성공이나 `processDue()` 반환만으로 종료를 판단하지 않는다.
이미 승인한 비동기 발송의 외부 응답과 결과 저장 트랜잭션 commit까지 끝나야 drain이다.
인계 중 알림 발송은 잠시 지연될 수 있다. 외부 발송 성공 뒤 DB 기록 전 장애의 중복 발송 가능성은 남는다.

### worker 제어 API

앱 runner가 해당 호스트의 `http://127.0.0.1:<management_port>/actuator/workercontrol`을 사용한다.
기본 포트는 8081이며 `X-Jarihana-Worker-Control-Token`으로 별도 머신 토큰을 전달한다.
[앱 실행기](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/scripts/actions/app.sh)가 보호된 파일을 읽어 curl stdin 설정으로 전달하므로,
토큰을 포함한 명령을 셸 인자나 로그에 직접 남기지 않는다. 공개 앱 포트의 접근은 거부한다.

GET 상태에서 version, environment, identity의 hostId/bootId와 아래 항목을 함께 확인한다.

| 항목 | 의미와 판단 기준 |
| --- | --- |
| `worker.state`, `worker.inFlight`, `worker.unresolved` | drain은 PAUSED와 두 수치 0을 모두 만족해야 한다. |
| `authority` | 환경별 DB owner, 배포 세대와 상태. 최초 행이 없으면 null일 수 있다. |
| `activity.httpInFlight` | 앱 context에 진입한 미완료 HTTP. 비동기 요청은 최종 종료까지 센다. |
| `activity.backgroundInFlight` | 실행 중인 푸시 스케줄러 회차. |
| `activity.backgroundDrained` | worker가 drained이고 스케줄러 회차도 0인 상태. |

이 수치는 조회 순간의 측정이다. Nginx에 남은 연결, 업그레이드된 WebSocket, 프레임워크 정리와
별도 executor 작업 전체의 종료를 증명하지 않는다. 새 백그라운드 작업을 추가하면 계측도 확장한다.
기존 Nginx worker 세대의 종료와 DB 권한 반납, 종료 직전 대상 boot를 따로 확인한다.

POST의 허용 동작은 begin, phase, pause, activate, release다. DB 행 잠금과 deployment ID,
epoch, expectedPhase/revision, 대상 host/boot, deadline으로 오래된 명령을 거부한다.
deadline은 시간대 오프셋 없는 LocalDateTime이며 호스트의 시간대와 시각을 맞춘다.
명령 ID와 원본 payload를 intent에 먼저 저장한다. 정확히 같은 마지막 명령은 중복 적용하지 않지만,
응답 유실이나 5xx 뒤에 자동 재전송하거나 새 ID로 재시도하지 않는다.
충돌은 409, 잘못된 요청은 400, 토큰 오류나 공개 포트 접근은 403으로 처리한다.
상세 payload와 전이 규칙은 [worker endpoint](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/backend/src/main/java/com/project/jarihana/notificationdelivery/command/controller/WorkerControlEndpoint.java)와
[권한 서비스](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/backend/src/main/java/com/project/jarihana/notificationdelivery/command/service/WorkerAuthorityService.java)를 따른다.
이 API는 HTTP 전환, EC2 중지나 배포 성공을 수행하지 않는다.
실습 종료의 HANDOFF에서 COMPLETE 전이는 owner가 없고 UNASSIGNED이며 로컬 drain이
확인된 경우에만 가능하다. COMPLETE/UNASSIGNED는 운영 배포 성공이나 배포 관찰 완료가 아니다.

### 이전 앱 종료 조건

배포 확정 후 새 owner가 COMPLETE/ACTIVE이고 이전 앱의 worker, HTTP, background 작업이
종료된 것을 확인한다. Docker 컨테이너 ID, 시작 시각과 재시작 횟수를 고정한 뒤 SIGTERM을 보낸다.
종료 코드 0 또는 143, OOM 없음, 재시작 없음과 정상 종료 증거가 있어야 EC2를 중지한다.
시간 초과를 이유로 강제 kill하지 않는다. 종료가 불확실하면 양쪽 EC2와 intent를 보존한다.

## 프론트엔드 릴리스

최초 baseline과 CloudFront 조건은 [프론트엔드 사전 준비](server-setup/README.md#프론트엔드-사전-준비)를 따른다.

### 원본과 상태 저장

```text
s3://techcourse-project-2026/jarihana/
├── frontend/                      # CloudFront 공개 파일, 이전 해시 자산도 유지
└── frontend-releases/
    ├── baseline-<run-id>/files/    # 최초 실제 공개 파일
    ├── <source-sha>-<run-id>/files/
    ├── 각 릴리스의 release.json
    └── state.json                 # current, previous, pending과 현재 backend_image
```

복구 원본은 과거 커밋 재빌드가 아닌 실제 바이트다. 파일의 path, size와 SHA-256을 manifest에
기록하고, 모든 원본 검증 뒤 release.json을 마지막에 쓴다. 미완성 manifest는 복구 원본이 아니다.
릴리스는 source SHA, backend digest, run/deployment ID와 control SHA로 연결한다.
최초 baseline의 소스를 모르면 null로 두며 추정하지 않는다. 비밀값은 기록하지 않는다.

릴리스 객체는 기존 객체가 없는 경우에만 생성하고 덮어쓰지 않는다. state.json은 읽은 ETag에
대한 조건부 쓰기(CAS)로 갱신한다. backend-only에서는 manifest의 과거 backend_image보다
pointer의 현재 backend_image가 조합의 기준이다. 기존 pending이나 공개 파일 drift가 있으면 중단한다.
원본과 이전 해시 자산은 보관 정책 합의 전까지 자동 삭제하지 않는다.

### 게시와 확정

지원 파일을 먼저 올리고 index.html을 마지막에 게시한다. 파일은 재검증하도록 캐시
메타데이터를 지정하고, S3 readback뿐 아니라 공개 URL의 실제 SHA-256을 manifest와 비교한다.
관찰 중 공개 파일을 다시 검증하는 범위와 시점은 [프론트엔드 관찰](status.md#프론트엔드-관찰)을 따른다. 이전 해시 자산이 남는 것은 허용하지만
현재 manifest의 파일이 누락되거나 달라진 것은 실패다.

공개 파일 게시와 복구는 파일 단위 작업이다. 모든 브라우저가 동시에 바뀌지는 않으며
이미 열린 탭과 서비스 워커는 이전 버전을 사용할 수 있다. `sync --delete`로 이전 자산을 지우지 않는다.
GitHub 전달 artifact의 7일 보존은 S3 복구 원본의 보관 기간이 아니다.

## 내부 점검과 관측

앱 A/B의 Alloy와 Prometheus 조회 경로는 [서버 구성](server-setup/README.md#앱-alloy와-조회-경로)을 따른다.
Nginx 서버의 중앙 수집기는 기존 [중앙 수집기 운영 문서](../../docs/observability/CENTRAL-DEPLOYMENT-COLLECTOR.md)를 참조한다.

### 점검 표시와 최신성

내부 Nginx probe와 후보 직접 검사는 `X-Jarihana-Deployment-Probe: true`를 전달하고,
공개 API 경로는 클라이언트가 보낸 같은 표시를 제거한다. 헤더는 인증 수단이 아니므로
앱 포트의 접근 제한도 유지한다. 백엔드는 표시가 있고 실제 `GET /api/groups?size=1`인
요청만 http.server.requests 타이머에서 제외한다. 같은 경로의 일반 요청은 집계하며
로그, JDBC, CPU와 메모리 지표는 유지한다. 필터 전에는 표시된 점검도 집계된다.

활성 Nginx 설정뿐 아니라 고정 제어 릴리스의 템플릿과 직접 검사 스크립트를 대조한다.
템플릿에 표시가 없으면 다음 전환에서 수동 설정이 덮어써질 수 있다. 설치 타이머와 prod 전용
systemd drop-in도 함께 확인하고 코드 병합만으로 모든 경로에 적용됐다고 판단하지 않는다.

배포 제어기, 관제 화면과 Slack 알림의 최신성 기준은
[관측 최신성](status.md#관측-최신성)에서 구분한다.

## 실행 보호와 기한

저널 schema 2를 사용하며 이전 v1 자동 이관과 미완료 저널에서의 새 plan은 허용하지 않는다.
단계 실행은 현재 GitHub run과 첫 attempt, 저장소, branch, 부모 SHA와 workflow 경로,
control SHA, 실제 EC2, image와 허가를 대조한다. A/B 앱은 로컬 관리 API만 호출하고
coordinator가 SSH 원격 명령으로 앱을 배포하지 않는다. SSH는 최신 저널 읽기 전용이다.
앱 작업 결과와 Nginx 종료 증거를 native outputs로 검증하며 누락 값을 0이나 true로 채우지 않는다.

| 제한 | 값과 의미 |
| --- | --- |
| 전체 저널 | 7200초 |
| prepare 허가 | EC2 running 확인 후 1500초 |
| observe 허가 | 1800초 |
| 일반 앱 작업 허가 | 600초. prod 복구의 별도 기한은 [복구 허가와 기한](recovery.md#복구-허가와-기한)을 따른다. |
| heartbeat | pending이 없을 때 60초, pending이 있으면 해당 deadline 검사 |
| queue guardian | 30초마다 run/jobs 조회, 전용 runner queued 300초 또는 전체 기한 초과 시 취소 1회 요청 |

queue와 checkout도 허가 시간을 소비하며 self-hosted queue는 job의 timeout-minutes에 포함되지 않는다.
조회 실패나 불완전한 jobs 목록은 정상으로 보지 않는다. 취소 응답 유실은 재전송하지 않는다.
감지는 poll과 API, GitHub 처리 시간만큼 늦어질 수 있고 guardian 자체의 시작도 보장하지 않는다.
취소는 정리 완료의 증거가 아니며 늦게 시작한 작업은 최신 허가에서 거부된다.

파일 루프와 대기는 성공한 부모 run 확인을 최대 10초, 읽기 전용 관찰은 최대 30초 재사용한다.
취소 감지는 다음 확인 경계와 현재 전송 시간만큼 늦을 수 있다. 실제 상태 변경, manifest/state
확정과 최종 결과 전에는 원격 run을 다시 확인하며 로컬 저널과 만료는 계속 검사한다.

GitHub API 응답의 잔여 요청은 새 plan/bootstrap 900, 일반 진행 500, 복구/중단 10 이상이어야 한다.
헤더 누락, 403/429나 예산 부족이면 실패 경로로 진행하며 제한 해제까지 맹목적으로 기다리지 않는다.
이 예산은 저장소가 공유하므로 다른 workflow의 소비나 GitHub 장애 중 복구 성공을 보장하지 않는다.

요청 예산과 캐시는 [공통 실행 코드](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/scripts/actions/common.sh)를 따른다.

watchdog은 검토한 control checkout과 실행 도구를 `/opt/jarihana-deploy`에 준비한다.
[watchdog unit](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/controller/systemd/jarihana-deploy-watchdog@.service)은 coordinator 계정으로
동일한 저널 잠금과 보호된 설정을 사용한다. pending deadline, heartbeat와 전체 만료를 보고
NEEDS_ATTENTION만 기록한다. 강제 권한 회수, 허가 재발급이나 EC2 중지는 수행하지 않는다.
`always()` finalizer도 runner 전원과 네트워크 장애 때 실행을 보장하지 않는다.

Blue-Green과 [Monitoring Deploy](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/monitoring-deploy.yml)는
jarihana-observed-deployment 잠금을 공유한다. 관측 gateway 재생성과 배포 관찰을 겹치지 않게 한다.
환경별로 잠금을 나누거나 부모/자식에 같은 잠금을 중복 설정하지 않는다.
cancel-in-progress=false와 queue=max로 직렬화하고 대기열이 가득 찬 실행 결과도 확인한다.
수동 재시작과 S3 writer는 이 잠금을 우회하므로 관찰 중 실행하지 않는다.

### 배포 저널 잠금

모든 coordinator 단계와 watchdog은 같은 `state.json.lock`을 사용한다.
배포 단계는 잠금을 최대 15초 기다리고 시간 초과 시 실패한다. watchdog은 대기 없이
시도하며 다른 실행의 잠금 보유로 경합한 경우에만 검사를 건너뛰고 다음 timer tick에 재확인한다.
잠금의 실제 오류는 실패로 처리한다. 저널은 잠금을 얻은 뒤 읽고 검증하며, 잠금 대기로 기존
허가 기한을 연장하거나 저널을 병렬 변경하지 않는다.
잠금 경계는 [coordinator 진입점](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/scripts/actions/coordinator.sh)을 따른다.
