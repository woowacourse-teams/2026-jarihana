# Blue-Green 배포

별도 Nginx EC2가 앱 A/B 중 현재 서버로 요청을 보낸다. 배포할 때만 대기 EC2를 시작하고,
전환 후 최소 15분 관찰과 기존 작업 종료 확인을 마치면 이전 EC2를 중지한다.
다음 배포에서는 A/B 역할을 바꾼다. 단일 Nginx 장애까지 해결하는 구조는 아니다.

```text
사용자 → CloudFront → Nginx EC2 → 현재 앱 → RDS
배포: 대기 시작 → PAUSED 후보 준비 → 이전 worker 반납 → HTTP 전환 → 후보 활성화
      → 앱/HTTP 병렬 15분 관찰 → 봉인 → 이전 앱 SIGTERM 정상 종료 → 이전 EC2 중지
```

[인프라 ADR 0005](../docs/adr/0005-nginx-ec2-blue-green-deployment.md),
[배포 적용 절차](controller/full-deployment.md), [Actions 계약](github-actions-adapter.md),
[서버별 작업 계약](child-contract.md)을 함께 확인한다.

## 실행 경로

| 위치 (`infra/` 기준) | 역할 |
| --- | --- |
| `scripts/deploy/actions/common.sh` | root 설정·실제 GitHub/EC2·최신 허가·atomic 저널 공통 경계 |
| `scripts/deploy/actions/app.sh` | 앱 전용 runner의 prepare/handoff/activate/observe/complete/stop/rollback/bootstrap |
| `scripts/deploy/actions/coordinator.sh` | Nginx runner의 plan/grant/switch/observe/seal/EC2/rollback/interrupt/watchdog |
| `scripts/deploy/actions/cloud.sh` | 계정·VPC·IP를 대조한 EC2 시작·정상 중지 |
| `scripts/deploy/actions/nginx.sh` | 설정 검사·atomic 전환·실제 경로 및 이전 worker 세대 확인 |
| `scripts/deploy/actions/queue-guard.sh` | Hosted runner의 300초 queued job·7200초 전체 기한 감시와 현재 run 취소 1회 요청 |
| `scripts/deploy/migration-review.sh` | PR migration 호환성·잠금 위험 검토 알림 |
| `deploy/controller/app-compose.yml` | 승인 digest·기본 PAUSED 앱 템플릿 |
| `deploy/controller/full-*.example.json` | root 소유 coordinator/A/B 설정 예시 |
| `deploy/controller/systemd/jarihana-deploy-watchdog@.*` | Bash watchdog; 만료 상태 기록만 수행 |

GitHub native `workflow_call`·`needs`·outputs가 전체 순서를 연결한다. 상태 검사마다
workflow를 dispatch하지 않으며 Python/uv를 배포 runtime으로 사용하지 않는다.
앱 업무 Secrets는 선택한 GitHub environment에서만 전달한다.

develop push는 기존 dev 배포를 유지한다. 첫 Blue-Green 검증은 수동 `bootstrap`과
`deploy`로 수행한다. prod 자동 배포는 실제 검증 뒤 `BLUE_GREEN_PROD_ENABLED=true`로
활성화한다. 예시 파일 복사나 develop 머지만으로 prod 배포 방식이 바뀌지 않는다.

## 안전 경계

후보는 기본 PAUSED다. 이전 worker의 선점을 막고 발송·finish commit이 끝난 뒤 DB 권한을
반납해야 새 worker를 활성화한다. HTTP 전환과 worker 인계를 각각 검증한다.
Nginx 설정 atomic 교체·reload와 실제 경로, 이전 Nginx 세대의 연결 drain을 확인한다.
봉인과 SIGTERM 정상 종료 증거 없이 이전 EC2를 중지하지 않는다.
후보가 정상인데 이전 연결만 종료되지 않으면 후보로 계속 서비스하고 양쪽 EC2를 보존한다.
종료 보류 결과를 기록해 후속 종료·자동 롤백을 차단하며 Actions 실패 요약으로 확인을 요청한다.

전환 후 봉인 전 실패는 HTTP 복구 → 후보 worker 반납 → 이전 worker 복구 순서다.
후보가 미확정이면 이전 HTTP만 복구하고 worker 재개를 보류한다.
응답 유실·취소·만료·drain 미확인은 `NEEDS_ATTENTION`으로 남기며 pending과 양쪽 EC2를
보존한다. `always()` finalizer는 runner 장애 때 실행을 보장하지 않는다.
watchdog은 pending deadline/전체 만료를 검사하며 pending 없는 경우에만 60초 heartbeat를
검사한다. 강제 회수·종료·정리는 하지 않는다. 정상 롤백도 Actions 실패로 보고한다.
DB 스키마·데이터 자동 복구는 없으며 [DB 변경 규칙](../../docs/database-changes.md)을 따른다.

## 검증

```sh
bash -n infra/scripts/deploy/actions/common.sh \
  infra/scripts/deploy/actions/app.sh infra/scripts/deploy/actions/coordinator.sh \
  infra/scripts/deploy/migration-review.sh
# Linux에서 root 소유 보호파일 fixture를 포함한 격리 계약 테스트
sudo bash infra/tests/deploy/actions/run-tests.sh
# Docker·Java 21·backend bootJar·Alloy 이미지를 준비한 뒤 실제 JVM/Alloy 통합 검증
bash infra/tests/deploy/actions/run-local-e2e.sh
# 정식 backend/Dockerfile로 빌드한 이미지의 실제 pull·Compose 기동 검증
# jarihana-actions-test:local, postgres:17, registry:2, docker:27-dind 이미지를 먼저 준비한다.
BG_COMPOSE_IMAGE=<로컬에서-빌드한-백엔드-이미지> \
  bash infra/tests/deploy/actions/run-compose-e2e.sh
# 실제 격리 Nginx에서 coordinator 조회 ACL 6개 확인
bash infra/tests/deploy/actions/run-monitoring-acl.sh
# actionlint가 설치된 환경에서 저장소 self-hosted 라벨 설정을 사용한다.
actionlint .github/workflows/backend-bluegreen-deploy.yml \
  .github/workflows/backend-bluegreen-phase.yml \
  .github/workflows/backend-app-operation.yml .github/workflows/backend-migration-review.yml
```

정적 검증은 실제 Spring·Docker·Nginx와 GitHub/AWS의 통합 검증을 대신하지 않는다.
Compose 시험은 임시 privileged Docker-in-Docker 데몬에서만 실행하며 호스트 포트를 공개하지 않는다.
로컬 registry에 올린 이미지의 캐시를 제거한 뒤 실제 pull하고, 원본 Compose와 prepare/profile을
그대로 실행해 TLS DB 연결·READY/PAUSED·관리 포트 loopback·정상 SIGTERM과 실패 차단을 확인한다.
시험 종료 시 해당 시험의 Docker 자원을 정리하고 `local-plans/blue-green-deployment/artifacts/`에
기록을 보존한다. 외부 GitHub/AWS·호스트 설정·SSH 전송은 대역이며 실제 인프라 검증과 구분한다.
Bash 전환 뒤 경계 테스트와 격리 통합 결과는 해당 테스트의 실행 기록으로 확인한다.
PR의 `Backend Blue-Green Bash Checks`는 구문·ShellCheck error·격리 계약 테스트를 실행한다.
실제 IAM·보안 그룹·CloudFront·environment 보호·runner 선택·실제 15분 관찰·과거 앱과
새 DB 스키마 호환성은 별도 dev 검증 대상이다. 로컬 테스트만으로 성공했다고 표시하지 않는다.
