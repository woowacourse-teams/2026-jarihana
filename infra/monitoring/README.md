# 자리하나 모니터링 실행 설정

- [모니터링 서버 Compose](docker-compose.yml): Nginx·Prometheus·Loki·Tempo·Grafana·호스트 수집 Alloy
- [모니터링 자동 배포](../../.github/workflows/monitoring-deploy.yml): `main`의 모니터링 설정 변경을 전용 EC2 runner에서 배포
- [Tempo 트레이스 수집](../docs/observability/TRACING.md): Java Agent → 앱 Alloy → Nginx → Tempo, 7일 보관과 검증
- [prod 앱 Compose](../docker-compose.yml)·[dev 앱 Compose](../docker-compose.dev.yml): 앱·Alloy 서비스와 `alloy-data` 볼륨
- [Slack 장애 알림](../docs/observability/SLACK.md): Grafana 파일 provisioning, health·HTTP 500·호스트 자원 알림 정의 12개와 전달 정책
- [Grafana 운영 대시보드](../docs/observability/DASHBOARD.md): `Jarihana` 폴더의 `jarihana-overview` 대시보드와 필터·패널 해석
- [Grafana Canvas](../docs/observability/CANVAS.md): `jarihana-canvas` 시스템 흐름 화면, 앱·DB 상태와 최근 2분 평균 트래픽 해석
- [앱 Alloy 설정](alloy/config.alloy): 두 앱 Compose가 마운트하는 공통 수집 설정
- [모니터링 Alloy 설정](alloy/monitoring.alloy): 모니터링 EC2의 호스트·Alloy 자체 메트릭 수집

앱 서버의 환경변수 예시는 [infra/.env.example](../.env.example)에 있다. 수집기만 별도
프로젝트로 실행하지 않고 앱 Compose의 `up -d --no-build backend`로 함께 시작한다.
dev·prod DB는 모두 RDS PostgreSQL이다. backend 로그는 기본 `local` driver와 허용 라벨로 수집한다.
배포 실행은 `--force-recreate backend alloy`로 체크아웃된 설정을 적용한다.
백엔드 배포는 앱 런타임·Compose·workflow·Alloy 설정 변경에 반응한다. `infra/docs/**`만 바뀌면
앱 배포를 자동 실행하지 않지만, dev/prod workflow 모두 `backend/**`를 path로 보므로 backend 하위
문서 변경은 앱 배포 조건에 포함된다.
dev는 GHCR 이미지를 빌드·push하고, prod는 같은 backend tree tag 이미지를 받아 `jarihana-prod`
runner에서 교체한다. 두 workflow 모두 직전 성공 태그를 기록해 배포 후 점검 실패 시 되돌린다.
이후 앱 변경으로 배포가 실행되면 해당 체크아웃의 인프라 설정도 반영한다.

모니터링은 별도 workflow가 `main`의 `infra/monitoring/**` 또는 해당 workflow 변경 시 자동 배포한다.
repository-wide Actions variables `MONITORING_HOST_ID`·`MONITORING_BIND_ADDRESS`와 repository secret
`SLACK_WEBHOOK_URL`을 환경변수로 주입하므로 EC2에 `.env`를 따로 만들 필요가 없다.
workflow는 `MONITORING_HOST_ID`를 컨테이너 `HOST_ID`로 매핑해 backend dev/prod workflow의
`vars.HOST_ID`와 충돌하지 않게 한다. 이 값은 지표 라벨에 사용할 안정적인 모니터링 호스트 이름이며 실제 AWS instance ID일 필요는 없다.
`MONITORING_BIND_ADDRESS`는 Nginx `80`·`8080`을 bind할 모니터링 EC2의 실제 사설 IPv4다.
Prometheus `9090`, Loki `3100`, Tempo 조회 `3200`, Grafana `3000`은 호스트 loopback 관리 포트로 유지하며
Tempo OTLP `4317`은 호스트에 publish하지 않는다.
Grafana의 `GF_SERVER_ROOT_URL`은 Compose에서 `http://grafana.jarihana.com/`으로 고정한다.
도메인·HTTPS 변경 시 Compose의 이 값과 Nginx Host 설정을 함께 맞춘다.
Nginx `80`은 `grafana.jarihana.com` Host만 받고 다른 Host는 `404`로 응답한다.
이 서브도메인의 DNS를 모니터링 EC2 공인 IP에 연결하며 루트 `jarihana.com`의 기존 서비스는 변경하지 않는다.
DNS 실제 변경은 아직 수행하지 않았다. 수집 주소는 사설 IP의 `8080`을 유지한다.
Nginx `80`은 Grafana 루트 경로·WebSocket, `8080`은 세 수집 API만 제공한다.
앱 Alloy는 기존 환경변수 이름을 유지하면서 세 목적지를 `8080`으로 바꾼다.
모니터링 스택을 먼저 배포한 뒤 backend·Alloy를 갱신한다. AWS 배포와 보안 그룹·라우팅 검증은 아직 수행하지 않았다.
대시보드를 생성하고 설정을 검증한 뒤 컨테이너를 재생성하며, 데이터 볼륨은 유지한다.
Compose는 Alloy를 포함한 모니터링 서비스에 컨테이너별 메모리 상한을 걸지 않는다.
실제 메모리는 같은 호스트의 Docker·OS·다른 프로세스와 공유한다.
모니터링 스택을 `docker compose up -d`로 시작하면 Grafana가 알림 파일을 읽어 적용한다.
이후 변경도 파일에서 관리하며 로그와 UI에서 적용 상태를 확인한다. 알림 파일 변경은 자동 배포로
적용한다. GitHub 변수·시크릿만 수정하면 push 이벤트가 없으므로 `Monitoring Deploy`의
`Run workflow`에서 `main`을 선택해 다시 실행한다.

환경변수, 실행 순서, 데이터 마운트와 수집 확인은
[모니터링 실행 가이드](../docs/observability/OPERATIONS.md)를 따른다.
설계·ADR·학습 자료는 [인프라 문서 목록](../docs/README.md)에 있다.
