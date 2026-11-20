# 내부 배포 점검의 HTTP 지표 제외

`HttpRequestMetricsConfig`는 `X-Jarihana-Deployment-Probe: true`가 있고
실제 요청이 `GET /api/groups?size=1`인 경우만 `deployment.probe=true`로 분류한다.
`http.server.requests` 타이머 등록에서 이 분류만 제외한다.

같은 타이머에서 나오는 요청 수, 상태별 오류율, 시간 합계/평균과 히스토그램 기반
p50/p95/p99가 모두 같은 기준을 사용한다. 사용자나 부하테스트가 같은 URL과 `size=1`로
조회해도 전용 표시가 없으면 집계한다. User-Agent나 경로만으로 제외하지 않는다.
로그, JDBC, CPU/메모리 등 다른 지표는 계속 기록한다.

## 운영 적용과 신뢰 경계

운영 Nginx의 내부 점검 경로는 표시를 주입하고 공개 API 경로는 클라이언트가 보낸 표시를
제거해야 한다. 앱 포트는 기존 Nginx/내부 접근 제한을 유지한다. 헤더는 인증 수단이 아니다.

2026-10-29 14:21 KST에 Nginx 활성 설정과 30초 관측 타이머를 SSH로 선반영했다.
현재 저장소에는 표시를 처리하는 [Nginx 템플릿](../../../infra/blue-green-deploy/nginx/nginx.conf.template),
[직접 점검 스크립트](../../../infra/blue-green-deploy/scripts/actions/nginx.sh)와
[30초 수집 주기 정의](../../../infra/monitoring/deployment/systemd/jarihana-observability@prod.timer.d/30-second-interval.conf)가 있다.

SHA 배포로 전환한 Blue-Green은 배포를 시작한 main SHA의 Nginx 템플릿과 직접 점검 스크립트를 사용한다.
기존 서버의 전환은 [최초 전환 절차](../../../infra/blue-green-deploy/docs/release-sha.md)를 따른다.
위 선반영 기록은 과거 적용 상태이며 현재 운영 설치를 증명하지 않는다.
배포 후 활성 설정의 표시와 실제 지표를 확인하며, 설치형 수집기/타이머는 별도로 갱신한다.
적용 순서와 구버전 앱의 제약은 [인프라 적용 안내](../../../infra/docs/observability/PROBE-METRICS-ROLLOUT.md)를 따른다.

검증 명령은 다음과 같다.

```sh
cd backend
./gradlew test --tests '*HttpRequestMetricsConfigTest' --tests '*HttpRequestMetricsAcceptanceTest' \
  --tests '*JdbcMetricsTest' --tests '*JdbcSlowQueryMetricsTest' --tests '*HttpRequestLoggingFilterTest' --no-daemon
```
