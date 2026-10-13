# 자리하나 모니터링 실행 구성

dev·prod는 각각 별도 EC2에서 실행하며 각 앱의 Alloy가 메트릭과 허용한 로그를
세 번째 서버인 모니터링 EC2로 보낸다. Nginx·Prometheus·Loki·Grafana와 호스트 수집 Alloy는
모니터링 서버의 Compose 프로젝트로 실행한다. health·HTTP 500·호스트 CPU·메모리·디스크·inode 알림 정의
12개와 Slack 연락처·전달 정책을 제공한다. Tempo trace 저장소는 기본 실행에서 제외하고,
요청 단위 span 분석이 필요할 때만 [Tempo 가이드](TRACING.md)의 선택 절차로 켠다.
모니터링 서버 Compose 배포는 GitHub Actions가 자동으로 수행하며, 외부 장애 감시는 포함하지 않는다.

| 파일 | 실행 위치와 역할 |
| --- | --- |
| [docker-compose.yml](../../monitoring/docker-compose.yml) | 모니터링 EC2: Nginx·Prometheus·Loki·Grafana·호스트 수집 Alloy. Tempo는 선택 구성 |
| [prod 앱 Compose](../../docker-compose.yml)·[dev 앱 Compose](../../docker-compose.dev.yml) | 각 EC2: 앱·Alloy 서비스와 `alloy-data` 볼륨 직접 정의 |
| [앱 환경변수 예시](../../.env.example) | 각 앱 EC2: 앱·Alloy 공통 입력 |
| [alloy/config.alloy](../../monitoring/alloy/config.alloy) | HTTP·호스트 메트릭 수집, health 확인, Docker 로그 전송 |
| [alloy/monitoring.alloy](../../monitoring/alloy/monitoring.alloy) | 모니터링 EC2: 호스트·Alloy 자체 메트릭 수집 |
| [prometheus/prometheus.yml](../../monitoring/prometheus/prometheus.yml) | 자체 지표 scrape와 메트릭 보관 정책 |
| [loki/loki.yaml](../../monitoring/loki/loki.yaml) | 단일 노드 로그 저장소와 보관 정책 |
| [tempo/tempo.yaml](../../monitoring/tempo/tempo.yaml) | 선택 구성: 트레이스 7일 보관, span·서비스 그래프 지표 생성 |
| [Grafana 데이터 소스](../../monitoring/grafana/provisioning/datasources/datasources.yaml) | Prometheus·Loki 자동 연결. Tempo는 선택 구성에서 추가 |
| [Explore 쿼리 목록](../../monitoring/grafana/explore/queries.json)·[초기화 스크립트](../../monitoring/grafana/explore/sync-starred-queries.mjs) | `admin`의 Query history → Starred에 dev·prod 레벨별 로그 쿼리 등록 |
| [monitoring-deploy.yml](../../../.github/workflows/monitoring-deploy.yml) | 모니터링 EC2 self-hosted runner에서 Compose 스택 자동 배포 |

설계 배경은 [아키텍처](ARCHITECTURE.md)와
[인프라 ADR 0001](../adr/0001-local-alloy-observability.md)에 있다.

## 실행 전 준비

대상은 Docker Engine과 Docker Compose v2가 설치된 Linux EC2다. Alloy의 host 네트워크와 호스트 마운트는 Linux EC2
기준이며 macOS에서 호스트 지표가 동일하게 수집된다고 가정하지 않는다.

처음에는 dev에서 확인한다. 모니터링 서버의 Nginx `80`은 Grafana에 접근할 운영자에게,
`8080`은 앱 EC2 보안 그룹의 사설 접근에만 열도록 보안 그룹·라우팅을 확인한다. 사설 IP bind만으로
인터넷 접근이 차단된다고 판단하지 않는다. 이 초기 구성의 수신 API에는 인증·TLS가 없으므로
인터넷에 공개하지 않는다. 외부망을 통과해야 한다면 먼저 인증·TLS 경로를 추가한다.

이미지는 Nginx `1.30.5-alpine`, Prometheus `v3.15.0`, Loki `3.7.8`, Grafana `13.2.3`, Alloy `v1.20.1`로
고정했다. Tempo 선택 구성은 `2.10.8`을 사용한다. 버전을 바꿀 때는 설정 검사와 수집·조회 검증을 다시 수행한다.

## 1. 모니터링 서버 실행과 자동 배포

모니터링 서버의 기본 배포 경로는 GitHub Actions의 `monitoring-deploy.yml`이다. 이 workflow는
`develop` 브랜치에 `infra/monitoring/**` 또는 workflow 파일 자체가 push되면 자동 실행된다.
`workflow_dispatch`는 같은 `develop` revision을 다시 적용할 때만 사용한다. 앱 배포는 별도 backend
dev/prod workflow가 담당하며 앱 Compose와 앱 Alloy 설정 변경도 해당 앱 배포를 실행한다.

workflow는 저장소 전체 Actions 변수와 시크릿을 사용한다. 저장소 Settings → Secrets and variables → Actions에
다음 값을 등록한다.

| 종류 | 이름 | 값 |
| --- | --- | --- |
| Repository variable | `MONITORING_HOST_ID` | 지표 라벨에 사용할 안정적인 모니터링 호스트 이름. 실제 AWS instance ID일 필요는 없다 |
| Repository variable | `MONITORING_BIND_ADDRESS` | 모니터링 EC2의 실제 사설 IPv4 |
| Repository secret | `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |
| Repository secret | `GRAFANA_ADMIN_PASSWORD` | Grafana `admin` 초기 비밀번호이자 Explore 초기화 API 인증값. 기존 계정이 있으면 현재 로그인 비밀번호와 일치해야 한다 |

Repository variable이나 secret만 바꾸면 push 이벤트가 발생하지 않는다. 값 변경을 바로 적용하려면
`workflow_dispatch`로 `develop`의 모니터링 배포를 다시 실행한다.

모니터링 EC2의 self-hosted runner에는 `self-hosted`, `Linux`, `ARM64`, `jarihana-monitoring`
라벨이 있어야 한다. runner 호스트에는 Docker Compose v2와 `curl`이 필요하다. Node는
`actions/setup-node@v4`로 Node 24를 준비한 뒤
`infra/monitoring/grafana/topology/sync-dashboard.mjs`를 실행한다.

배포 단계는 `.env` 파일을 요구하지 않는다. workflow는 repository variable `MONITORING_HOST_ID`를
컨테이너 환경변수 `HOST_ID`로 매핑한다. repository 변수 이름을 분리해 backend dev/prod workflow의
`vars.HOST_ID`와 충돌하지 않게 한다. `MONITORING_BIND_ADDRESS`, `GRAFANA_ADMIN_PASSWORD`, `SLACK_WEBHOOK_URL`도 shell 환경변수로 주입하고 모든 Compose 명령에 `--env-file /dev/null`을
명시한다. Compose 구성 검사(`config --quiet`), 이미지 받기(`pull`), 각 서비스의 설정 검사,
컨테이너 재생성(`up -d --no-build --force-recreate`) 순서로 실행한다.
Prometheus, Loki, Grafana, Alloy의 준비 상태와 Nginx를 거친 Grafana 응답을 HTTP로 확인한다.
이후 `grafana/explore/sync-starred-queries.mjs`가 loopback Grafana API에 `admin`으로 접속해
Explore의 자주 쓰는 로그 쿼리 12개를 등록한다. 재배포 시에도 실행되며 기존 등록 항목을 재사용한다.
재생성해도 Prometheus·Loki·Grafana·Alloy named volume은 유지한다. Tempo 선택 구성을 켰다면 `tempo-data`도 유지한다.

터미널에서 같은 입력으로 임시 확인해야 할 때만 `infra/monitoring/.env.example`을 참고해
shell 환경변수를 채운다. 이 파일은 로컬·수동 실행용 보조 자료이며 EC2 유지보수에 필요한
상태 파일이 아니다.

```bash
cd infra/monitoring
export HOST_ID=jarihana-monitoring-ec2
export MONITORING_BIND_ADDRESS=10.0.1.10 # 실제 모니터링 EC2 사설 IPv4로 변경
read -r -s -p 'Slack Webhook URL: ' SLACK_WEBHOOK_URL
export SLACK_WEBHOOK_URL
read -r -s -p 'Grafana admin password: ' GRAFANA_ADMIN_PASSWORD
export GRAFANA_ADMIN_PASSWORD
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml config --quiet
```

관리자 초기 비밀번호는 repository secret `GRAFANA_ADMIN_PASSWORD`에서 주입하며 Compose의
`GF_SECURITY_ADMIN_PASSWORD`로 전달한다. 값이 없거나 비어 있으면 배포 입력 검사와 Compose 구성 검사가 실패한다.
Grafana는 시작할 때 마운트된 파일에서 알림 규칙·연락처·전달 정책을 읽으며 이후 시작할 때도
파일 설정을 다시 적용한다. Webhook 준비·변경과 실제 전송 확인은 [Slack 장애 알림](SLACK.md)을 따른다.
`MONITORING_BIND_ADDRESS`는 Nginx `80`·`8080`을 bind할 모니터링 EC2의 실제 사설 IPv4다.
Prometheus `9090`, Loki `3100`, Grafana `3000`은 호스트 loopback 관리 포트로 유지한다.
Tempo 선택 구성을 켤 때도 조회 `3200`은 loopback 관리 포트로 두고 OTLP `4317`은 호스트에 publish하지 않는다.
기본값 `127.0.0.1`은 같은 서버에서 시험할 때만 사용하며 외부 앱 EC2에서는 접근할 수 없다.
Nginx `80`은 `Host: grafana.jarihana.com` 요청의 Grafana 루트 경로와 WebSocket을 전달하며
다른 Host는 `404`로 응답한다. `8080`은 RFC1918 사설 IPv4와 loopback만
허용하고 다른 출발지는 거부한다. 정확히 일치하는 다음 POST 경로만 전달하며 나머지 경로는 `404`다.
허용 경로의 POST 외 메서드는 `403`으로 거부한다.

| Nginx 수집 경로 | Compose 내부 목적지 |
| --- | --- |
| `POST /prometheus/api/v1/write` | `http://prometheus:9090/api/v1/write` |
| `POST /loki/api/v1/push` | `http://loki:3100/loki/api/v1/push` |

Nginx는 `/prometheus` 접두사를 제거하고 Loki 경로는 그대로 전달한다.
기본 Nginx 설정의 `POST /tempo/v1/traces`는 `404`를 반환한다. Tempo 선택 구성을 켤 때만
이 경로의 `proxy_pass http://tempo:4318/v1/traces`를 복원한 설정이나 override를 적용해
`/tempo` 접두사를 제거한다.
최초 구축은 모니터링 스택을 먼저 배포하고 수신 경로를 확인한 뒤 backend·Alloy를 갱신한다.
기존 Tempo 구성에서 전환할 때는 백엔드를 먼저 배포하고 `jdbc_query_seconds_*` 수집을 확인한 다음
모니터링을 배포한다. Nginx 장애 중에는 앱 Alloy가 재시도하며 큐·원본 보관 한도를 넘으면 유실될 수 있다.
Grafana 관리자 사용자명은 `admin`으로 고정한다.
포트·관리자 사용자명과 Grafana의 `GF_SERVER_ROOT_URL`은 `docker-compose.yml`의 고정값이다.
공개 URL은 `https://grafana.jarihana.com/`이며 별도 환경변수를 추가하지 않는다.

모니터링 Alloy는 host 네트워크에서 `http://127.0.0.1:9090/api/v1/write`로 직접 전송한다. 앱 메트릭·health·Docker 로그는 수집하지 않으며
Docker socket도 마운트하지 않는다. procfs·sysfs·rootfs는 읽기 전용으로 마운트하고,
상태는 모니터링 프로젝트의 `alloy-data` 볼륨에 보관한다. 관리 주소는
`127.0.0.1:12345`로 고정한다. 모니터링 Compose는 이 Alloy에 컨테이너별 메모리 상한을 걸지 않는다.

```bash
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml config --quiet
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml pull
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml run --rm --no-deps --entrypoint /bin/promtool prometheus check config /etc/prometheus/prometheus.yml
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml run --rm --no-deps loki -config.file=/etc/loki/config.yaml -verify-config=true
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml run --rm --no-deps alloy validate /etc/alloy/config.alloy
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml up -d --no-build --force-recreate
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml ps
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml logs --tail 100 grafana
```

`up -d`의 반환만으로 알림 설정 적용을 판단하지 않는다. Grafana 로그에서 provisioning 오류를
확인하고 UI에서 규칙·연락처·정책을 확인한다. 운영 중 변경도 파일에서 관리한다.
파일이나 Webhook 변경 시 [Slack 가이드의 재생성 명령](SLACK.md#적용과-확인)을 따른다.

기동 상태는 실제 HTTP 응답으로 확인한다. Loki의 초기 준비에는 시간이 걸릴 수 있다.

```bash
curl --fail --retry 30 --retry-all-errors --retry-delay 3 --max-time 5 "http://127.0.0.1:12345/-/ready"
curl --fail --retry 30 --retry-all-errors --retry-delay 3 --max-time 5 "http://127.0.0.1:9090/-/ready"
curl --fail --retry 30 --retry-all-errors --retry-delay 3 --max-time 5 "http://127.0.0.1:3100/ready"
curl --fail --retry 30 --retry-all-errors --retry-delay 3 --max-time 5 "http://127.0.0.1:3000/api/health"
curl --fail --retry 30 --retry-all-errors --retry-delay 3 --max-time 5 -H "Host: grafana.jarihana.com" "http://${MONITORING_BIND_ADDRESS}:80/api/health"
```

Compose를 직접 실행했다면 준비 상태 확인 후 Node 24로 다음 명령을 실행한다.
workflow 배포에서는 이 단계까지 자동으로 실행한다. 스크립트는 위에서 export한
`GRAFANA_ADMIN_PASSWORD`를 사용하며, 기본 접속 주소는 `http://127.0.0.1:3000`이다.

```bash
node grafana/explore/sync-starred-queries.mjs
# 로컬 검증 스택처럼 포트가 다를 때만 주소 지정
GRAFANA_URL=http://127.0.0.1:13000 node grafana/explore/sync-starred-queries.mjs
```

등록 위치와 조회 조건은 [Explore 사용 안내](DASHBOARD.md#로그-조회와-explore)를 따른다.
스크립트는 기존 사용자 즐겨찾기를 보존한다. 관리 대상 쿼리가 바뀌면 새 항목을 별표로 등록한 뒤
이전 관리 항목의 별표만 해제하고 조회 기록은 남긴다.

Prometheus·Grafana는 컨테이너 healthcheck도 설정했다. Loki 이미지는 shell·curl이 없는
distroless 이미지이므로 위의 외부 `/ready` 확인을 사용한다. 컨테이너가 running이라는 사실만으로
데이터 수신까지 확인한 것은 아니다.

`grafana.jarihana.com`의 DNS를 CloudFront 배포에 연결하고 `https://grafana.jarihana.com/`으로
Grafana를 연다. CloudFront에서 HTTPS를 처리하고, CloudFront → Nginx → Grafana는 HTTP로 연결한다.
CloudFront의 원본 요청은 `Host: grafana.jarihana.com`을 유지해야 한다.
루트 `jarihana.com`의 기존 서비스 레코드는 변경하지 않는다. CloudFront·DNS의 실제 설정은 아직 수행하지 않았다.
수집 주소는 모니터링 EC2의 사설 IP `8080`을 사용하며 수집용 도메인·DNS·`extra_hosts`는 필요 없다.
Grafana의 도메인을 변경한다면
Compose의 `GF_SERVER_ROOT_URL`과 `nginx/default.conf`의 Host 설정을 함께 수정한다.
Grafana Live의 WebSocket Origin 검사 때문에 브라우저 접속 주소와 공개 URL이 일치해야 한다.
SSH로 관리할 때는 개인 컴퓨터에서 아래와 같이 loopback Grafana 포트 `3000`으로 터널을 열 수도 있다.

```bash
ssh -N -L 3000:127.0.0.1:3000 <ssh-user>@<monitoring-host>
```

터널 사용 시 브라우저에서 [Grafana](http://localhost:3000)를 열고 설정한 관리자 계정으로 로그인한다.
이 주소는 기본 공개 URL과 다르므로 Grafana Live 확인은 `GF_SERVER_ROOT_URL`과 일치하는 주소에서 수행한다.
Prometheus·Loki 데이터 소스는 이미 등록된다. 같은 네트워크의 서비스 이름으로 연결하므로
이 데이터 소스 URL은 Nginx 주소로 바꾸지 않는다.
관리자 초기 비밀번호는 첫 데이터베이스 생성에 사용된다. 기존 Grafana 볼륨이 있다면
GitHub Secret·Compose·`.env` 변경만으로 계정 비밀번호가 바뀌지 않으며 Grafana의 비밀번호 변경 절차를 사용한다.
비밀번호를 변경했다면 Explore 초기화에 쓰는 `GRAFANA_ADMIN_PASSWORD` Secret도 같은 값으로 갱신한다.
API 인증이 실패하면 배포 단계가 실패하며, 스크립트가 계정 비밀번호를 초기화하지는 않는다.
알림 파일 적용에는 별도 관리자 API 인증이나 호스트 스크립트 실행이 필요하지 않다.

## DB 연결 준비

dev·prod 배포 DB는 모두 외부 RDS PostgreSQL이다. workflow는 `RDS_URL`, `DB_USERNAME`,
`DB_PASSWORD`로 각각 `jdbc:postgresql://<RDS_URL>:5432/jarihana_dev?sslmode=require`,
`jdbc:postgresql://<RDS_URL>:5432/jarihana_prod?sslmode=require`를 만든다. 별도 CA bundle
마운트는 사용하지 않는다. RDS endpoint, 보안 그룹, 스키마와 계정은 배포 전에 준비한다.
로컬 개발과 테스트 PostgreSQL은 기존 방식을 유지한다.

모니터링 전용 DB 계정은 앱 계정과 분리하는 것을 권장한다. 실제 등록된 DSN은 배포 환경별
`POSTGRES_MONITOR_DSN` Secret으로 전달되며, 현재 작업에서는 접속 성공과 `pg_monitor` 권한을
검증하지 않았다. 관리자 계정을 모니터링 DSN에 넣지 않는다.

```sql
CREATE ROLE postgres_monitor LOGIN PASSWORD '<별도로 정한 비밀번호>';
GRANT CONNECT ON DATABASE jarihana_dev TO postgres_monitor;
GRANT pg_monitor TO postgres_monitor;
```

prod에서는 데이터베이스 이름을 `jarihana_prod`로 바꿔 같은 권한을 부여한다. 비밀번호의 URI 예약
문자는 percent-encoding한다. 예시는 다음과 같다.

```dotenv
# dev RDS
POSTGRES_MONITOR_DSN=postgresql://postgres_monitor:<encoded-password>@<rds-endpoint>:5432/jarihana_dev?sslmode=require&connect_timeout=3

# prod RDS
POSTGRES_MONITOR_DSN=postgresql://postgres_monitor:<encoded-password>@<rds-endpoint>:5432/jarihana_prod?sslmode=require&connect_timeout=3
```

배포 프로필은 스키마를 검증만 하므로 Spring Session을 포함한 스키마 준비·기존 데이터 이관·
시퀀스·권한·복원 검증은 별도로 필요하다. [인프라 ADR 0002](../adr/0002-rds-deployment-database.md)를
따라 dev·prod 모두 RDS를 사용한다.

## 2. 앱과 Alloy 함께 실행

앱 EC2의 저장소 루트에서 환경변수 파일을 준비한다. dev EC2와 prod EC2에 각각 준비하며
기존 `infra/.env`가 있다면 덮어쓰지 않고 예시와 비교해 필요한 항목을 채운다.

```bash
cp infra/.env.example infra/.env
```

`infra/.env`에는 `BACKEND_TAG`, DB·인증·S3 등 앱 실행 입력과 다음 Alloy 입력을 함께 채운다.
예시 파일의 항목 설명을 기준으로 각 서버 값을 지정한다.

| 변수 | dev EC2 | prod EC2 |
| --- | --- | --- |
| `HOST_ID` | dev EC2의 고유 ID | prod EC2의 고유 ID |
| `PROMETHEUS_REMOTE_WRITE_URL` | `http://<monitoring-private-ip>:8080/prometheus/api/v1/write` | 동일 모니터링 수신 URL |
| `LOKI_PUSH_URL` | `http://<monitoring-private-ip>:8080/loki/api/v1/push` | 동일 모니터링 수신 URL |
| `POSTGRES_MONITOR_DSN` | dev RDS 모니터링 계정 DSN | prod RDS 모니터링 계정 DSN |

위 네 변수는 필수다. 수신 주소는 모니터링 EC2의 사설 주소와 Nginx `8080`을 사용한다.
Tempo 선택 구성을 켤 때만 `TEMPO_OTLP_ENDPOINT=http://<monitoring-private-ip>:8080/tempo`를 추가한다.
이 값에는 `/tempo`까지 넣고 `/v1/traces`는 붙이지 않는다. `otelcol.exporter.otlphttp`가 이 경로를
추가해 `/tempo/v1/traces`로 전송한다. 이 변수만 추가해서는 trace가 켜지지 않는다. Compose `tracing`
profile, Grafana Tempo 데이터 소스 복원, Nginx trace 경로 복원, Prometheus Tempo scrape 복원,
앱 Alloy OTLP pipeline 복원, 백엔드 `OTEL_SDK_DISABLED=false`와 OTLP trace exporter 설정을 함께 적용한다.
`APP_METRICS_TARGET`은 dev·prod 각 Compose에서 `127.0.0.1:8081`로 고정해 Alloy 컨테이너에 전달한다.
셸이나 `.env`의 값으로 치환하지 않는다. 호스트 `8081`은 컨테이너 관리 포트 `8081`로 연결한다. Alloy는 해당 앱 하나를
`/actuator/prometheus` 경로로 읽고 같은 포트의 `/actuator/health`, `/actuator/health/liveness`,
`/actuator/health/database`를 각각 60초마다 확인한다. 이 경로에는 업무 API의 `/api` 접두사를
붙이지 않는다. Alloy의 PostgreSQL exporter도 별도 계정으로 DB에 직접 접속해 60초마다 수집한다.
exporter는 연결 상태와 기본 통계를 함께 수집한다. 설정 통계는 끄고 추가 collector는 `database`로
제한했지만, `SELECT 1` 한 번만 실행하는 구성은 아니다. 운영 DB에서의 부하는 별도 확인이 필요하다.

직접 검사 실패는 해당 계정·네트워크에서 접속하지 못했다는 뜻이며, 앱 계정의 연결 검사는
Actuator로 따로 확인한다. 두 경로의 상태 해석은 [Native Canvas 문서](NATIVE-CANVAS.md)에 정리했다.

### 앱 실행

프로필은 위 외부 입력과 별도로 각 앱 Compose에 고정한다. `SPRING_PROFILES_ACTIVE`는
dev Compose의 backend·Alloy에서 모두 `dev`, prod Compose에서는 모두 `prod`다.
셸이나 `infra/.env`에 같은 변수를 지정해도 이 고정값은 바뀌지 않는다. YAML 앵커나
`com.jarihana.monitoring.environment` Docker 라벨은 사용하지 않는다.

다음은 dev EC2에서 저장소 루트를 기준으로 실행하는 명령이다. 기존 앱과 같은 Compose
프로젝트 이름을 유지한다. prod EC2에서는 `infra/docker-compose.dev.yml`을
`infra/docker-compose.yml`로 바꾸며 `infra/.env`도 위 표의 prod 값으로 준비한다.

```bash
docker compose --env-file infra/.env -f infra/docker-compose.dev.yml config --quiet
docker compose --env-file infra/.env -f infra/docker-compose.dev.yml run --rm --no-deps alloy validate /etc/alloy/config.alloy
docker compose --env-file infra/.env -f infra/docker-compose.dev.yml up -d --no-build backend
docker compose --env-file infra/.env -f infra/docker-compose.dev.yml ps
docker compose --env-file infra/.env -f infra/docker-compose.dev.yml logs --tail 100 alloy
curl --fail http://127.0.0.1:12345/-/ready
```

각 앱 Compose에 Alloy 서비스와 `alloy-data` 볼륨을 직접 정의했다. 따라서
`up -d --no-build backend`가 Alloy도 시작한다. backend는 Alloy의 `service_started`만
기다린다. RDS는 외부 서비스이므로 Compose 시작 순서로 준비 여부를 확인하지 않는다.
Alloy 시작 역시 저장소 수신을 뜻하지 않으므로 앱 health·DB 연결과 아래 수집 확인을 수행한다.

`depends_on.restart: true`는 설정하지 않는다. backend 대상 갱신은 변경이 없는 정상 Alloy를
매번 재시작하지 않지만 앱 프로젝트 전체 `down`은 Alloy도 내린다. 별도 collector Compose는 없다.
`alloy-data`는 각 앱 파일에 직접 선언하며 해당 앱 프로젝트에 속한다. 공통 수집 규칙은
`./monitoring/alloy/config.alloy`를 마운트한다. include·extends 대신 한 앱 파일에서 구성을
바로 읽는 단순함을 택했으므로 Alloy 서비스 선언은 dev/prod 두 파일에 함께 유지한다.

이전 독립 `jarihana-collector` 프로젝트를 실제 EC2에 배포했는지는 확인하지 않았다.
이미 운영 중인 수집기가 있다면 실제 프로젝트·볼륨을 확인하고 WAL·읽기 위치를 백업한 뒤
중지·이관 절차를 정한다. 새 앱 프로젝트의 `alloy-data`는 이전 프로젝트 볼륨을 자동 재사용하지
않는다. 이름 변경이나 `down -v`로 상태를 잃지 않도록 주의한다.

`APP_METRICS_TARGET`은 각 앱 Compose의 고정값을 사용하며 GitHub Actions에서 주입하지 않는다.
프로필은 workflow 환경변수 없이 각 앱 Compose의 고정값을 사용한다. 배포 workflow는 repository
variable `MONITORING_BIND_ADDRESS`와 포트 `8080`, 위 경로에서 기본 두 endpoint를 만든다.
기본 수집 주소용 새 변수·시크릿은 필요하지 않다. `HOST_ID`는
환경별 override가 없으면 `jarihana-dev-ec2` 또는 `jarihana-prod-ec2`를 사용한다.
`POSTGRES_MONITOR_DSN`은 비밀번호를 포함하므로 각 GitHub Environment의 Secret으로 등록하며
같은 배포 단계에 전달한다. 배포는 `up -d --no-build --force-recreate backend alloy`로
체크아웃된 설정을 다시 읽게 한다.
checkout으로 bind mount 원본인 `config.alloy` 내용만 바뀌어도 설정을 다시 읽도록 두 서비스를
명시적으로 재생성한다. Alloy 재생성 중에는 수집·전송이 잠시 멈추며 `alloy-data`는 유지한다.
무손실이나 무중단을 보장하는 절차는 아니다.

앱 자동 배포는 [백엔드 런타임·빌드 경로](../../../backend/README.md#배포-환경-설정)와
앱 Compose·workflow·Alloy 설정 변경에 반응한다.
`infra/docs/**`만 바뀌면 앱 배포를 자동 실행하지 않는다. dev/prod workflow 모두 `backend/**`를
path로 보므로 backend 하위 문서 변경은 앱 배포 조건에 포함된다. dev는 GHCR 이미지를 빌드·push하고,
prod는 main의 backend tree hash로 같은 GHCR 이미지를 찾아 받는다. 두 workflow 모두 `workflow_dispatch`의
`image_tag`로 기존 이미지를 다시 배포할 수 있고, 배포 후 `infra/scripts/verify-backend.sh`를 실행한다.
점검 실패 시 각 서버의 직전 성공 태그 파일로 되돌린다. 앱·인프라가 함께 바뀌거나 이후 앱 배포가
실행되면 해당 체크아웃의 Compose·Alloy 설정을 사용한다. 실행 조건의 제외이며 인프라 설정을
이전 버전에 고정하는 것은 아니다.

앱 배포 runner 라벨은 dev가 `jarihana-dev`, prod가 `jarihana-prod`다. workflow는 기동 뒤 `http://127.0.0.1:12345/-/ready`를 확인하지만 이 응답만으로
Prometheus·Loki의 실제 수신을 증명하지는 않는다. workflow 변경 자체도 EC2 배포 완료를 뜻하지 않는다.

수동으로 Alloy 설정을 바꿀 때도 backend만 대상으로 한 일반 `up`으로는 변경 내용을 다시 읽지
않을 수 있다. 다음처럼 재생성하고 readiness와 아래 수집 확인을 수행한다.

```bash
docker compose --env-file infra/.env -f infra/docker-compose.dev.yml up -d --no-build --force-recreate backend alloy
curl --fail http://127.0.0.1:12345/-/ready
```

Alloy는 Docker socket을 읽어 컨테이너를 발견한다. socket의 읽기 전용 마운트가 Docker API의
권한까지 읽기 전용으로 제한하는 것은 아니다. 또한 host 네트워크, 호스트 파일시스템 접근을
사용하므로 수집기 설정과 이미지의 변경 권한을 제한한다.

## 3. 기본 앱 로그 수집

두 앱 Compose의 backend는 `local` logging driver와
`com.jarihana.monitoring.logs=true` 라벨을 기본으로 사용한다. `max-size=10m`, `max-file=5`로
회전한 stdout을 Alloy가 Docker API로 읽어 Loki에 전송한다. 로그 override 파일은 없다.
서비스 이름이 `backend`이고 수집 허용 라벨이 있는 컨테이너만 수집한다. 라벨 없는 컨테이너나
Alloy 자체 로그는 앱 로그 수집 대상에서 제외한다.

Alloy는 자신의 `SPRING_PROFILES_ACTIVE`에서 로그의 `environment` 라벨을 만든다.
ECS JSON 원문과 요청 ID는 그대로 보관하며 Loki 인덱스에는 `service_name`, `environment`,
`host_id`만 남긴다. 실제 요청의 응답 ID로 Loki에서 로그를 찾아 전송 완료를 확인한다.

CloudWatch 도구는 legacy 운영 참고로 보존하지만 현재 backend 로그 경로는 Docker `local` →
Alloy → Loki다. 기존 AWS 로그·대시보드·알림 자원 정리는 수행하지 않았다. [Slack 장애 알림](SLACK.md)은 Grafana 시작 시 알림 정의 12개·연락처·notification policy를 파일에서 등록한다.
외부 장애 감시는 아직 없으며 실제 Slack 수신도 확인하지 않았다.

## 수집 확인

Grafana Explore에서 Prometheus 데이터 소스를 선택하고 `up`을 조회한다.
모니터링 프로그램 자체의 지표와 Alloy가 보낸 앱·호스트 지표가 있는지 확인한다.
`up{job="jarihana-host"}`에서 dev·prod·모니터링 EC2의 서로 다른 `host_id`와 값 `1`을
확인한다. 디스크·inode 지표에는 예상한 `mountpoint`가 있는지도 확인한다. 모니터링 Alloy만
갱신할 때는 모니터링 Compose 위치에서 `docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml up -d --no-deps --force-recreate alloy`를
실행한 뒤 수신을 다시 확인한다.
의도한 앱의 값이 `1`이고 `environment`·`instance`가 dev/prod를 구분하는지 본다.
앱 프로세스가 내려가면 수집기가 살아 있는 동안에는 해당 대상이 `0`으로 보일 수 있다.
Alloy까지 중단되면 데이터 없음도 별도로 확인해야 한다.

Docker 데이터가 저장되는 디스크는 해당 EC2에서 다음과 같이 확인한다.

```bash
JARIHANA_DOCKER_ROOT=$(docker info --format '{{.DockerRootDir}}')
findmnt -T "$JARIHANA_DOCKER_ROOT"
df -h "$JARIHANA_DOCKER_ROOT"
df -i "$JARIHANA_DOCKER_ROOT"
```

출력된 마운트 위치가 `node_filesystem_size_bytes{job="jarihana-host",host_id="jarihana-monitoring-ec2"}`의
`mountpoint`에도 있는지 확인한다. `host_id`는 확인하려는 EC2의 `HOST_ID`로 바꾼다.
named volume도 Docker 데이터 디스크를 사용하므로 별도 EBS를 붙였다면 그 마운트까지 확인한다.

Loki 데이터 소스에서는 다음 범위로 앱 로그를 찾는다.

```logql
{service_name="jarihana", environment="dev"}
```

알려진 요청의 응답 `X-Request-Id`로 로그 원문을 검색해 상태 코드, 환경과 `service.version`을
확인한다. JSON 원문은 그대로 보관하며 요청 ID·회원 ID를 인덱스 라벨로 추가하지 않는다.

HTTP p95·p99와 DB p95는 histogram bucket이 있어야 계산된다. 백엔드가 새 JDBC 계측과 histogram
설정을 포함해 배포되기 전에는 DB 호출량·DB p95가 비어 보일 수 있다. 모니터링 대시보드보다 백엔드
배포가 먼저 끝나야 `jdbc_query_seconds_count`와 `jdbc_query_seconds_bucket`이 Prometheus에 들어온다.

## 보관과 자원 설정

- Prometheus는 7일 또는 2GB 기준 중 먼저 도달한 범위로 오래된 블록을 정리한다.
  이 크기는 WAL·head 등을 포함한 전체 디스크의 단단한 상한이 아니므로 여유 공간을 둔다.
- Loki는 30일 보관이며 compactor의 처리 주기와 삭제 지연이 더해진다.
  retention은 전체 디스크 용량 제한이 아니다.
- Tempo 선택 구성은 7일 보관이며 WAL·블록·지표 생성 WAL을 `tempo-data:/var/tempo`에 저장한다.
  Compose의 `GOMEMLIMIT: 250MiB`로 Go 런타임의 소프트 메모리 한도를 지정한다.
  컨테이너 전체 메모리의 강제 상한은 아니므로 실제 사용량은 이 값을 넘을 수 있다.
- 앱 Docker 로그는 파일당 10MB, 최대 5개로 회전한다. 읽기 전에 회전된 로그는 수집하지 못할 수 있다.
- named volume은 Prometheus·Loki·Grafana 데이터와 Alloy 상태를 컨테이너 교체 사이에 보관한다.
  Tempo 선택 구성을 켰다면 `tempo-data`도 같은 방식으로 보관한다.
  일반 재배포에 `down -v`를 사용하지 않는다. EC2 디스크 장애에 대비한 백업은 별도다.
- 모니터링 Compose는 Grafana·Loki·Prometheus·모니터링 Alloy에 컨테이너별 메모리 상한을 걸지 않는다.
  Tempo 선택 구성도 컨테이너별 메모리 상한은 두지 않는다.
  실제 메모리는 같은 호스트의 Docker·OS·다른 프로세스와 공유한다. 앱 Compose의 Alloy는 기존
  `mem_limit: 256m`을 유지한다. 1GiB micro에서 동작을 보장하는 설정이 아니므로 수집량과 조회 부하를
  측정해 서버 크기를 조정한다.

보관 정책은 각 저장소 설정 파일에서 바꾼다. 자동 배포 입력인 `MONITORING_HOST_ID`,
`MONITORING_BIND_ADDRESS`, `GRAFANA_ADMIN_PASSWORD`, `SLACK_WEBHOOK_URL`은 repository-wide Actions variables/secrets에서 관리한다. 포트·관리자 사용자명은
`docker-compose.yml`의 고정값을 수정한다. 모니터링 Compose에 컨테이너별 메모리 상한을 두려면
해당 서비스에 명시적으로 추가하고 운영 부하로 검증한다. 앱 Alloy의 메모리 상한은 앱 Compose의
`mem_limit`에서 수정한다.
Compose 프로젝트 이름을 바꾸면 다른 named volume이 만들어질 수 있으므로 이름도 고정한다.
설정을 바꾼 뒤에는 검사기를 다시 실행하고 해당 서비스를 재생성한다.

## 검증 기록과 남은 범위

2026-10-12에는 접두사를 적용한 별도 Docker 프로젝트에서 29개 검증을 통과했다.
실제 Alloy의 remote write가 `/prometheus/api/v1/write`를 거쳐 Prometheus에 샘플 `42`를 저장했고,
OTLP HTTP exporter가 `/tempo`에 `/v1/traces`를 붙여 전송한 트레이스도 Tempo에서 조회했다.
Loki는 Nginx를 통한 직접 HTTP 전송·조회를 확인했다. Grafana 로그인·WebSocket,
이전 수집 경로와 알 수 없는 경로의 `404`, GET·HEAD와 외부 출발지의 `403`도 확인했다.
이 테스트의 Alloy는 bridge 네트워크를 사용했으며 실제 EC2의 host 네트워크와 AWS 접근 설정은 검증하지 않았다.
Slack 알림은 비활성화했고 검증용 컨테이너·볼륨·네트워크는 제거했다.
이 기록은 Tempo를 기본 실행에서 제외하기 전의 trace 경로 검증이다. 현재 기본 대시보드의 DB 호출량·DB p95는
Tempo가 아니라 `jdbc_query_seconds_*` 지표를 사용한다.

아래는 `/prometheus`·`/tempo` 접두사를 추가하기 전인 2026-10-12의 사설 IP `8080` 경로 검증 기록이다.
현재 접두사가 있는 수집 경로의 검증 결과는 아니다. 당시 별도 Docker 프로젝트에서 Nginx 경유 HTTP 검증 22개를 통과했다.
Grafana 로그인 `200`·인증된 WebSocket 연결 `101`, Loki 로그 저장·조회, Alloy를 거친 Tempo 트레이스 조회,
Prometheus remote write 샘플 `42`를 확인했다. 다른 Host와 조회 경로는 `404`, 수집 경로의 GET·HEAD는
`403`이었다. 사설 주소를 `X-Forwarded-For`에 넣은 외부 출발지 요청도 `403`으로 거부했다.
테스트용 계정·데이터를 사용하고 Slack 알림과 Grafana provisioning은 비활성화했으며,
검증용 컨테이너·볼륨·네트워크는 제거했다. 브라우저 화면, 실제 AWS DNS·보안 그룹·TLS 검증은 포함하지 않는다.

아래는 Nginx 도입 전인 2026-10-05의 dev·prod 구성으로 수행한 로컬 Docker 테스트 기록이다.
현재 Nginx `8080` 수신 경로와 OTLP HTTP 전환의 검증 결과는 아니다. 실제 Spring 대신 Python
테스트 앱과 bridge 네트워크를 사용했으며 DB 컨테이너·로그 override 없이 다음을 확인했다.

- backend의 `local` driver `10m`·5개, 기본 수집 허용 라벨과 두 서비스 구성을 inspect로 확인했다.
- 테스트 앱의 환경별 JSON 로그가 Loki에 도착하고 메트릭 값 `9`가 Prometheus에서 조회됐다.
  실행 중인 Alloy 설정 파일의 바이트도 저장소 원본과 같았다.
- 과거 RDS CA 마운트 설계에서는 CA 원본 파일이 없으면 Docker bind가 실패하고 경로를 자동 생성하지
  않는지 확인했다. 현재 dev·prod RDS 연결은 `sslmode=require`를 사용하고 CA 파일 마운트는 필수 계약이 아니다.

별도 중첩 JSON 로그를 Loki에 직접 넣어 로깅 가이드의 LogQL 예시 네 개도 확인했다.
요청 ID 조회는 관련 이벤트 3개, HTTP 완료·오류 집계는 각각 1개를 반환했고 p95는
250,000,000ns를 250ms로 계산했다. 시작·업무 이벤트는 완료 집계에서 제외됐다.
이 쿼리 검증은 직접 전송한 테스트 데이터이며 위 Alloy 로그 전송 검증과 구분한다.

실제 Spring 연결, dev·prod RDS TLS, 호스트 지표와 DB 계정 권한을 이 테스트로 검증한 것은 아니다.
실제 EC2 배포·호스트 지표·RDS 스키마와 데이터 준비, 백업·복원, 운영 부하·장기 보관 삭제·알림은
별도 확인이 필요하다. 기존 Agent 제거와 AWS 자원 정리는 수행하지 않았다.

공식 참고: [Compose 서비스](https://docs.docker.com/reference/compose-file/services/),
[Prometheus 설정](https://prometheus.io/docs/prometheus/latest/configuration/configuration/),
[Loki retention](https://grafana.com/docs/loki/latest/operations/storage/retention/),
[Alloy Docker 수집](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/).
