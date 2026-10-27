# 자리하나 모니터링 실행 설정

- [모니터링 서버 Compose](docker-compose.yml): Nginx·Prometheus·Loki·Grafana·호스트 수집 Alloy. Tempo는 선택 구성
- [모니터링 자동 배포](../../.github/workflows/monitoring-deploy.yml): `develop`의 모니터링 설정 변경을 전용 EC2 runner에서 배포
- [Tempo 트레이스 선택 구성](../docs/observability/TRACING.md): trace가 필요할 때 Java Agent → 앱 Alloy → Nginx → Tempo, 7일 보관과 검증
- [prod 앱 Compose](../docker-compose.yml)·[dev 앱 Compose](../docker-compose.dev.yml): 앱·Alloy 서비스와 `alloy-data` 볼륨
- [Slack 장애 알림](../docs/observability/SLACK.md): Grafana 파일 provisioning, health·HTTP 500·호스트 자원 알림 정의 12개와 전달 정책
- [Grafana 운영 대시보드](../docs/observability/DASHBOARD.md): `Jarihana` 폴더의 `jarihana-overview` 대시보드와 필터·패널 해석
- [채팅 대시보드](../docs/observability/CHAT.md): 개발·운영 환경과 서버별 연결·전송·복구 지표
- [Explore 자주 쓰는 로그 쿼리](../docs/observability/DASHBOARD.md#로그-조회와-explore): `admin`의 Query history → Starred에 dev·prod 레벨별 쿼리 12개 등록
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

모니터링은 별도 workflow가 `develop`의 `infra/monitoring/**` 또는 해당 workflow 변경 시 자동 배포한다.
repository-wide Actions variables `MONITORING_HOST_ID`·`MONITORING_BIND_ADDRESS`와 repository secret
`GRAFANA_ADMIN_PASSWORD`·`SLACK_WEBHOOK_URL`을 환경변수로 주입하므로 EC2에 `.env`를 따로 만들 필요가 없다.
workflow는 `MONITORING_HOST_ID`를 컨테이너 `HOST_ID`로 매핑해 backend dev/prod workflow의
`vars.HOST_ID`와 충돌하지 않게 한다. 이 값은 지표 라벨에 사용할 안정적인 모니터링 호스트 이름이며 실제 AWS instance ID일 필요는 없다.
`MONITORING_BIND_ADDRESS`는 Nginx `80`·`8080`을 bind할 모니터링 EC2의 실제 사설 IPv4다.
Prometheus `9090`, Loki `3100`, Grafana `3000`은 호스트 loopback 관리 포트로 유지한다.
Tempo 선택 구성을 켤 때도 조회 `3200`은 loopback으로 두고 OTLP `4317`은 호스트에 publish하지 않는다.
Grafana의 `GF_SERVER_ROOT_URL`은 Compose에서 `https://grafana.jarihana.com/`으로 고정한다.
CloudFront에서 HTTPS를 처리하고, CloudFront → Nginx → Grafana는 HTTP로 연결한다.
도메인을 변경할 때는 Compose의 이 값과 Nginx Host 설정을 함께 맞춘다.
Nginx `80`은 `grafana.jarihana.com` Host만 받고 다른 Host는 `404`로 응답한다.
`grafana.jarihana.com`의 공개 DNS는 CloudFront 배포에 연결하며 루트 `jarihana.com`의 기존 서비스는 변경하지 않는다.
앱 Alloy는 모니터링 EC2의 사설 IP와 `8080`을 사용하며 수집용 도메인·DNS·`extra_hosts`는 추가하지 않는다.
공개 Grafana DNS 변경과 AWS 배포는 아직 수행하지 않았다.
Nginx `80`은 Grafana 루트 경로·WebSocket, `8080`은 기본 두 수집 API만 제공한다.
앱 Alloy의 기본 목적지는 `http://<monitoring-private-ip>:8080/prometheus/api/v1/write`,
`http://<monitoring-private-ip>:8080/loki/api/v1/push`다.
Nginx는 `/prometheus` 접두사를 제거해 전달하고 Loki 경로는 그대로 전달한다.
Tempo 선택 구성을 켤 때만 `http://<monitoring-private-ip>:8080/tempo`를 추가하며 exporter가
`/v1/traces`를 붙인다. 기본 Nginx 설정은 `/tempo/v1/traces`를 `404`로 막으므로 trace 전송 전
해당 경로의 Tempo `proxy_pass`를 복원한 설정이나 override를 적용한다. Grafana Tempo 데이터 소스,
Prometheus Tempo scrape, 앱 Alloy OTLP pipeline, 백엔드 OTel 변수도 함께 켜야 하며, 자세한 절차는
[트레이스 선택 구성 문서](../docs/observability/TRACING.md)를 따른다. `8080`은 RFC1918 사설 IPv4·loopback의 정확한 POST 경로만 허용한다.
다른 경로는 `404`, 허용 경로의 다른 메서드는 `403`이다. 보안 그룹에서 `80`은 CloudFront 원본 접근에,
`8080`은 앱 EC2 보안 그룹에 허용한다. 기본 수집 주소는 기존 `MONITORING_BIND_ADDRESS`로 만들며 새 변수·시크릿은 없다.
최초 구축은 모니터링 스택을 먼저 배포한 뒤 backend·Alloy를 갱신한다. 기존 Tempo 구성에서 이번 JDBC 지표로
전환할 때는 백엔드를 먼저 배포해 `jdbc_query_seconds_*` 수집을 확인한 다음 모니터링을 배포한다.
이번 변경의 AWS 배포와 보안 그룹·라우팅 검증은 아직 수행하지 않았다.
대시보드를 생성하고 설정을 검증한 뒤 컨테이너를 재생성하며, 데이터 볼륨은 유지한다.
Grafana 준비 상태 확인 후 `grafana/explore/sync-starred-queries.mjs`가 `admin` 계정에
자주 쓰는 로그 쿼리를 등록한다. 기존 즐겨찾기를 보존하고 재실행 시 중복을 만들지 않는다.
API 인증에는 같은 `GRAFANA_ADMIN_PASSWORD`를 사용하므로 이 Secret은 현재 로그인 비밀번호와
일치해야 한다. Compose만 직접 실행할 때의 등록 명령은 [실행 가이드](../docs/observability/OPERATIONS.md)에 있다.
Compose는 Alloy를 포함한 모니터링 서비스에 컨테이너별 메모리 상한을 걸지 않는다.
실제 메모리는 같은 호스트의 Docker·OS·다른 프로세스와 공유한다.
prod 헬스 알림은 기존 중앙 배포 수집기의 `jarihana_nginx_route`와 Nginx source 성공·관측 시각을
사용해 실제 활성 호스트의 앱 Alloy 헬스 결과를 평가한다. 수집기·Nginx 관측 정보는 45초,
앱 헬스 결과는 150초 이내여야 하며 활성 경로 또는 해당 결과가 없으면 장애로 알린다.
대기 호스트 중지는 알리지 않는다. 수집기가 없거나 오래된 textfile만 반복 수집되는 경우에도
알림이 발생하므로 중앙 배포 수집기와 앱 Alloy 양쪽을 확인한다.
로컬 검증은 Docker가 실행 중일 때 `node grafana/test-health-alerts.mjs`로 수행한다
(`infra/monitoring` 디렉터리 기준).

모니터링 스택을 `docker compose up -d`로 시작하면 Grafana가 알림 파일을 읽어 적용한다.
이후 변경도 파일에서 관리하며 로그와 UI에서 적용 상태를 확인한다. 알림 파일 변경은 자동 배포로
적용한다. GitHub 변수·시크릿만 수정하면 push 이벤트가 없으므로 `Monitoring Deploy`의
`Run workflow`에서 `develop`을 선택해 다시 실행한다.

환경변수, 실행 순서, 데이터 마운트와 수집 확인은
[모니터링 실행 가이드](../docs/observability/OPERATIONS.md)를 따른다.
설계·ADR·학습 자료는 [인프라 문서 목록](../docs/README.md)에 있다.
