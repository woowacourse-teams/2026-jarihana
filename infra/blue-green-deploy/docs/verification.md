# Blue-Green 검증

배포 스크립트, 백엔드 계측 또는 관제 원본을 바꿨을 때 필요한 검증 명령과 범위를 확인한다.
실제 배포 실행은 [배포 실행](deployment.md), 운영 상태는 [상태 확인](status.md), 실패 대응은 [장애 복구](recovery.md)를 따른다.

- [배포 스크립트와 계약](#배포-스크립트와-계약)
- [백엔드 계측](#백엔드-계측)
- [배포 관제 원본](#배포-관제-원본)
- [검증 범위와 한계](#검증-범위와-한계)

## 배포 스크립트와 계약

명령은 [배포 실행의 적용 버전](deployment.md#적용-버전)과 일치하는 저장소 checkout의 루트에서 실행한다. 호스트와 외부 자원 접근이 필요한 시험은 해당 환경에서 수행한다.

```sh
for file in infra/blue-green-deploy/scripts/actions/*.sh \
  infra/blue-green-deploy/scripts/migration-review.sh infra/blue-green-deploy/tests/actions/*.sh; do
  bash -n "$file"
done
# Linux root 소유 보호파일 fixture를 포함한 계약 시험
sudo bash infra/blue-green-deploy/tests/actions/run-tests.sh
# 전체 계약 시험에 포함: control 이관 허가, 원본/백업 해시, 만료와 경로 불일치 차단
sudo bash infra/blue-green-deploy/tests/actions/test-control-transition.sh
bash infra/blue-green-deploy/tests/actions/run-api-budget.sh
# Docker의 Prometheus promtool로 실제 배포 쿼리의 HTTP/SSE 분리 회귀 검사
node infra/blue-green-deploy/tests/actions/test-http-metrics.mjs
# Docker, Java 21, backend bootJar와 필요한 이미지를 준비한 통합 시험
bash infra/blue-green-deploy/tests/actions/run-local-e2e.sh
BG_COMPOSE_IMAGE=<로컬에서-빌드한-백엔드-이미지> \
  bash infra/blue-green-deploy/tests/actions/run-compose-e2e.sh
bash infra/blue-green-deploy/tests/actions/run-monitoring-acl.sh
actionlint .github/workflows/backend-bluegreen-deploy.yml \
  .github/workflows/backend-bluegreen-phase.yml \
  .github/workflows/backend-app-operation.yml .github/workflows/backend-migration-review.yml \
  .github/workflows/backend-prod-deploy.yml .github/workflows/frontend-prod-deploy.yml
```

기존 `test-app.sh`와 `test-release-workflow.sh`는 기본/음악 Compose의 같은 main SHA 선택,
음악 Compose 누락과 다른 SHA 거부,
v1 검증기 사전 차단과 위험한 Compose 모델을 컨테이너 교체 전에 거부하는 경계를 검사한다.
Docker 대역을 쓰는 계약 시험과 실제 Compose JSON 파서를 쓰는 검증을 구분한다.
로컬 실험용 생성 파일과 가짜 credential fixture는 저장소에 추가하지 않는다.

시험별 실행 조건과 대역 범위는 [각 하네스](../tests/actions/run-tests.sh)에서 확인한다.
`run-local-e2e.sh`의 기본 Java 이미지 ID가 로컬에 없다면 검증할 Java 21 이미지를 준비하고
`BG_E2E_JAVA_IMAGE=<준비한 이미지 ID 또는 digest>`로 지정한다. 두 통합 시험은 dev의 S3 경계 설정을
명시하되 `IMAGE_CLEANUP_ENABLED=false`로 실행하며 실제 공유 S3 삭제를 시험하지 않는다.

## 백엔드 계측

내부 점검의 계측 변경은 backend 디렉터리에서 확인한다.

```sh
cd backend
./gradlew test --tests '*HttpRequestMetricsConfigTest' --tests '*HttpRequestMetricsAcceptanceTest' \
  --tests '*JdbcMetricsTest' --tests '*JdbcSlowQueryMetricsTest' --tests '*HttpRequestLoggingFilterTest' --no-daemon
```

## 배포 관제 원본

관제 원본과 쿼리를 변경하면 생성 JSON을 직접 고치지 않고 재생성한다.

```sh
node infra/monitoring/grafana/deployment/build-dashboard.mjs
node --test infra/monitoring/grafana/deployment/test-dashboard.mjs
node infra/monitoring/grafana/deployment/test-queries.mjs
node infra/monitoring/grafana/deployment/test-provisioning.mjs
```

관제 구조 검사는 Node.js를 사용한다. PromQL 검사는 Docker의 Prometheus 이미지,
파일 프로비저닝 검사는 Docker의 Grafana 이미지가 필요하다. 이미지와 준비 절차는
[모니터링 workflow](../../../.github/workflows/monitoring-deploy.yml)를 따른다.

## 검증 범위와 한계

로컬 계약 시험은 허가, S3 조건부 쓰기, 해시 불일치와 복구 순서를 검증한다. 통합 시험은
실제 JVM, PostgreSQL, Nginx와 Prometheus를 쓰더라도 GitHub, AWS, SSH와 호스트 신원은 대역일 수 있다.
Compose 시험은 격리된 데몬과 registry pull, TLS DB, 승인 이미지와 PAUSED, 포트, 정상 종료를 확인한다.
가상 시계나 과거 실행 결과는 실제 300초 관찰, IAM, 보안 그룹, CloudFront, runner 및 장애 복구를
증명하지 않는다. 운영에서는 공동/단독 배포, 양방향 교대, 업로드와 해시 실패, worker 미확정,
복구 실패와 취소를 각각 확인한다. 검증 결과와 적용 기록은 당시 환경과 범위를 구분해 보존한다.
