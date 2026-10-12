# ADR 0001. 로컬 Alloy에서 Prometheus와 Loki로 전송한다

- 상태: 채택 — 초기 Compose 설정을 작성했으며 AWS 배포·운영 전환은 아직 하지 않았다.
- 날짜: 2026-10-03
- 보완: 2026-10-06 — dev·prod별 EC2와 앱 Compose의 Alloy 직접 정의, 각 Compose의 dev/prod 프로필 고정 및 Slack 알림 규칙·전달 정책을 반영했다.
- 보완: 2026-10-12 — 모니터링 Nginx의 화면·수집 진입점과 저장소 관리 포트의 loopback 제한을 반영했다.
- 범위: 자리하나의 시스템 메트릭·애플리케이션 로그 수집과 조회
- 관련 문서: [아키텍처](../observability/ARCHITECTURE.md), [실행 가이드](../observability/OPERATIONS.md), [학습 노트](../learning/observability.md), [현재 로깅 가이드](../../../backend/docs/operations/application-logging.md)

## 배경

자리하나에서는 서버의 CPU·메모리·디스크·네트워크 상태와 애플리케이션의 요청량·오류율·
응답시간을 함께 보려 한다. CPU 그래프 하나만으로는 부족하다. 문제가 생긴 시간의 로그로
넘어가 원인을 확인하려 한다. 장기적으로는 백엔드와 DB의 관계를 노드와 간선으로 표현하고 그 위에 호출량과
지연시간을 표시하는 화면도 만들고 싶다.

설계 과정에서는 수집기를 어디에 둘지, 로그까지 수집할 때 로컬 수집기가 필요한지, 서버가
내려가면 전송하지 못한 데이터는 어떻게 되는지 검토했다. 설정과 배포의 편의, 서버 증설과
무중단 배포, 작은 모니터링 서버가 성능 테스트의 관측 데이터를 감당할지도 선택 기준이었다.

수집·저장·조회 경계를 직접 구성하고 Grafana에서 원하는 화면을 만들기로 했다.
직접 운영할 구성 요소가 늘어나므로 비용·안정성의 우위를 가정하지 않고 수집량과 운영 부담을
측정한다. 저장소에서는 이전 관측 설정과 자동화를 제거하고 아래 경로를 기본으로 사용한다.

## 결정

**애플리케이션 EC2마다 Grafana Alloy를 두고 별도 모니터링 EC2의 Nginx를 거쳐 Prometheus와 Loki로 보낸다.
Grafana에서 두 저장소를 조회한다. 중앙 Collector는 초기 구성에 추가하지 않는다.**

Nginx `80`은 Grafana 루트 경로·WebSocket을, `8080`은 정확히 일치하는 세 POST 수집 경로
(`/prometheus/api/v1/write`, `/loki/api/v1/push`, `/tempo/v1/traces`)를 제공한다.
Prometheus·Tempo는 `/prometheus`·`/tempo` 접두사를 제거해 저장소 경로로 전달하고 Loki 경로는 유지한다.
`8080`은 RFC1918 사설 IPv4와 loopback만 허용하고 나머지 출발지를 거부한다.
알 수 없는 경로는 `404`, 허용 경로의 POST 외 메서드는 `403`으로 응답한다.
기존 `MONITORING_BIND_ADDRESS`로 두 포트를 bind하고 저장소 관리 포트는 loopback에만 둔다.
앱 Alloy의 수집 주소는 이 사설 IP와 경로로 만들며 수집용 도메인·DNS·`extra_hosts`나 새 변수·시크릿은 추가하지 않는다.
Nginx는 HTTP 전달을 맡으며 신호 가공·큐를 가진 중앙 Collector 역할은 추가하지 않는다.
사설 IP bind와 별개로 AWS 보안 그룹·라우팅에서 운영자 화면 접근과 앱 EC2 수집 접근을 확인한다.

dev EC2와 prod EC2는 서로 다른 서버이며 모니터링 EC2도 별도로 둔다.
Nginx·Alloy·Prometheus·Loki·Grafana는 모두 Docker Compose로 실행한다.
`infra/docker-compose.yml`과 `infra/docker-compose.dev.yml`에
Alloy 서비스와 `alloy-data` 볼륨을 각각 직접 정의해 Spring Boot·Alloy를 같은 프로젝트에서
관리한다. include·extends로 파일을 연결하기보다 한 앱 Compose 파일에서 실행 구성을 바로
읽는 단순함을 택했다. Alloy 서비스 선언은 두 파일에 중복되지만 수집 설정은 공통
`infra/monitoring/alloy/config.alloy`를 마운트한다. 별도 collector Compose는 두지 않는다.
모니터링 EC2의 Prometheus·Loki·Grafana는 별도 프로젝트다.
로컬 Alloy는 관측 대상과 같은 호스트에 있는 컨테이너를 뜻한다. 모니터링 EC2에도
호스트 전용 Alloy를 모니터링 Compose에 포함한다. 이 수집기는
[monitoring.alloy](../../monitoring/alloy/monitoring.alloy)로 호스트·자체 메트릭만 로컬
Prometheus에 전송하며 앱 scrape와 Docker 로그 수집은 하지 않는다. 각 EC2의 고유한
`HOST_ID`로 구분하고 같은 `jarihana-host` 규칙을 적용한다.

DB 경계는 [인프라 ADR 0002](0002-rds-deployment-database.md)에 둔다. dev·prod는 외부 RDS PostgreSQL을
사용하고 backend는 Alloy의 `service_started`만 기다린다. 실제 접속·스키마와 앱 health는 배포 후 확인한다.
`up -d --no-build backend` 한 번으로 필요한 의존 서비스도 시작한다. Alloy 시작은 remote write나
Loki 수신 성공까지 보장하지 않으므로 수집·조회는 따로 확인한다. `depends_on.restart: true`는
설정하지 않는다. backend를 갱신해도 설정이 바뀌지 않은 정상 Alloy를 매번 재시작하지 않지만,
프로젝트 전체 `down`은 앱과 Alloy를 함께 내린다.
배포 workflow에서는 bind mount한 `config.alloy` 변경까지 읽도록
`up -d --no-build --force-recreate backend alloy`로 두 서비스를 재생성한다.
따라서 자동 배포 중에는 Alloy 수집이 잠시 중단된다. 영속 상태는 유지하지만 무중단·무손실을
보장하지 않는다. runner 라벨은 dev `jarihana-dev`, prod `jarihana-prod`로 구분한다.

`SPRING_PROFILES_ACTIVE`는 dev Compose의 backend·Alloy에 `dev`, prod Compose의 두 서비스에
`prod`로 직접 고정한다. 셸이나 `--env-file` 값으로 치환하지 않으며 YAML 앵커나 환경 구분용
Docker 라벨은 쓰지 않는다.
Alloy는 자신의 `SPRING_PROFILES_ACTIVE`로 로그의 `environment`를 붙이고,
dev·prod 각 Compose가 `127.0.0.1:8081`로 고정해 전달한 `APP_METRICS_TARGET` 한 곳만
앱 메트릭 대상으로 수집한다. 이 값은 셸이나 `.env`에서 치환하지 않으며 호스트 `8081`은
컨테이너 관리 포트 `8081`로 연결한다.
호스트·Alloy 자체 메트릭 수집은 유지한다.

비교했던 네 가지 배치 중 첫 번째 구조다.

| 배치 | 수집 경로 |
| --- | --- |
| **① 채택** | 로컬 Alloy → Nginx → 각 관측 저장소 |
| ② | 애플리케이션 → OTLP → 중앙 Alloy → 각 관측 저장소 |
| ③ | 로컬 Alloy → 중앙 Alloy → 각 관측 저장소 |
| ④ | 애플리케이션 → 각 관측 저장소 직접 전송 |

여기서 관측 저장소는 Prometheus·Loki 같은 프로그램을 뜻한다. 자리하나 Spring Boot 백엔드와
구별한다. 모니터링 EC2에 저장소가 모여 있어도 중간에서 데이터를 받는 중앙 Collector가 없는
구조일 수 있다.

초기 범위는 **Prometheus + Loki + Grafana**였고, 이후 [인프라 ADR 0003](0003-tempo-tracing.md)에서
Tempo와 OTel Java Agent를 추가했다. Canvas 화면도 저장소 JSON으로 제공한다. 그래도 자동
서비스 그래프, 인스턴스 증감까지 나타내는 인프라 지도, 백엔드와 DB 사이의 실제 전송량을
제공한다고 약속하지 않는다.

## 이 배치를 고른 이유

### 애플리케이션 밖의 데이터도 수집해야 한다

Spring Boot는 요청 처리 로그와 JVM·HTTP 지표를 만든다. 호스트의 디스크 사용량,
네트워크 인터페이스의 송수신량과 컨테이너 로그를 모으는 일까지 애플리케이션 코드가 맡을
필요는 없다. 같은 EC2의 Alloy가 로컬 데이터에 접근하도록 배치하면 이 수집 경로를 한곳에서
관리하기 쉽다.

로컬 Alloy가 유일한 방법은 아니다. 호스트에는 node_exporter를 두고 로그에는 Fluent Bit을
사용하거나, 애플리케이션이 OTLP로 중앙 Collector에 직접 보낼 수도 있다. 이번에는 로그와
호스트·애플리케이션 메트릭의 설정·배포 대상을 Alloy로 모으는 쪽을 선택했다.

### 데이터 생성과 수집·전송의 책임을 나눈다

Spring Boot는 기존 ECS JSON 로그를 출력하고 Micrometer 지표를 노출한다. Alloy는 수집 대상,
필터, 목적지와 재전송 정책을 맡고 Prometheus와 Loki는 데이터를 저장한다. 업무 코드에 Loki의
주소나 인증 정보를 넣지 않는다.

이 책임 분리는 중앙 Alloy에서도 가능하다. 로컬 배치만의 장점으로 과장하지 않는다. 로컬
배치를 선택한 추가 이유는 호스트와 컨테이너 데이터에 접근하기 쉽고 애플리케이션 지표를
외부에 공개하지 않은 채 수집할 수 있기 때문이다.

### 지금은 중앙 수집 계층을 한 단계 더 운영하지 않는다

중앙 Alloy를 두면 저장소 주소·인증·공통 필터를 한곳에서 바꿀 수 있다. 대신 별도 배포,
용량 관리와 장애 대응이 필요하고 한 대만 두면 여러 서버의 전송이 그 지점에 의존한다.

dev·prod는 각자 EC2에 두고 Alloy 수집 규칙은 공통 `config.alloy`로 관리한다. 서버 수와 정책 변경 빈도가 늘어 설정 배포가 실제 부담이 되면
중앙 계층을 다시 검토한다. 서버 수만으로 자동 전환하는 기준은 정하지 않는다.

### 애플리케이션과 관측 저장소의 장애 범위를 나눈다

Prometheus·Loki·Grafana를 별도 EC2에 두면 애플리케이션 호스트가 중단되어도 이미 전송한 데이터는
모니터링 서버에서 조회할 수 있다. backend만 수동 갱신하면 Alloy를 유지할 수 있지만,
현재 자동 배포는 설정 반영을 위해 Alloy도 재생성한다. 자동 배포와 프로젝트 전체 종료의
수집 중단 시간을 운영 절차에 반영한다.

애플리케이션 호스트와 함께 로컬 Alloy가 중단될 수 있다는 한계는 남는다. 외부 헬스체크는
장애를 감지할 뿐 전송하지 못한 로그를 복구하지 않는다. 로컬 저장·버퍼·재시도는 일시 장애에
대비하는 수단이며 호스트와 디스크의 소실까지 막는 무손실 보장은 아니다.

## 기술별 선택 이유와 감수하는 점

| 기술 | 이번 요구와 연결되는 이유 | 감수하는 점 |
| --- | --- | --- |
| **Docker Compose** | 기존 앱 배포와 같은 방식으로 이미지·설정·볼륨을 관리한다. 앱과 수집기는 한 프로젝트에서 관리하고 저장소는 별도 서버에 둔다 | 각 EC2에서 따로 실행·업데이트한다. 호스트 간 네트워크, 영속 데이터, 장애 복구와 무중단 배포를 별도로 설계해야 한다 |
| **Grafana Alloy** | Prometheus scrape, 호스트 exporter, Loki 로그 전송을 한 수집기에서 구성한다. 이후 OTLP 트레이스 경로도 추가할 수 있다 | 각 호스트에 설치·업데이트해야 한다. 애플리케이션과 CPU·메모리를 나눠 쓰며 Alloy 설정 문법을 익혀야 한다 |
| **Spring Boot Actuator + Micrometer** | 저장소에 이미 Prometheus registry와 관리 endpoint가 있다. HTTP·JVM·Hikari 지표를 재사용한다 | 필요한 지표의 이름·라벨·측정 범위를 확인해야 한다. p95용 histogram은 별도 설정과 검증이 필요하다 |
| **Prometheus** | 누적 카운터와 histogram을 저장하고 PromQL로 요청량·오류율·지연시간을 계산한다 | 시계열 수, 보관 기간, 디스크와 쿼리 비용을 직접 관리한다. 단일 서버는 고가용성이 아니다 |
| **Loki** | 기존 JSON 로그를 유지하며 환경·서비스로 범위를 좁혀 검색하고 Grafana에서 지표와 함께 조사한다 | 로그량과 조회 범위가 늘면 자원을 더 쓴다. 라벨 설계·보관·복구를 직접 관리한다 |
| **Grafana** | 메트릭과 로그를 한 화면에서 조회하고 필요한 대시보드·연결 화면을 구성한다 | 데이터를 수집하거나 없는 관계를 만들어 주지는 않는다. 대시보드와 알림도 별도로 구성해야 한다 |

Alloy는 OpenTelemetry Collector 배포판이면서 Prometheus 구성 요소도 제공한다.
Prometheus·Loki·Grafana의 역할을 한 프로그램으로 합쳐 주는 제품은 아니다.
[Alloy 소개](https://grafana.com/docs/alloy/latest/introduction/)

Linux EC2의 Alloy 컨테이너에는 호스트 네트워크를 사용해 현재 loopback으로 공개된 관리
포트를 읽게 한다. 호스트 파일시스템과 Docker 로그 API 접근도 별도로 연결한다. 이 선택은
앱의 기존 포트 구성을 유지하기 위한 것으로, 컨테이너의 격리 범위가 줄어드는 비용을 감수한다.
구체적인 네트워크·마운트·볼륨 기준은 [아키텍처의 Compose 배포 절](../observability/ARCHITECTURE.md#docker-compose-배포-단위)에 둔다.

## 검토한 대안

| 대안 | 선택할 만한 조건 | 이번에 선택하지 않은 이유 |
| --- | --- | --- |
| **관리형 Grafana Cloud** | Grafana를 쓰면서 저장소 운영을 맡기고 싶을 때 | 이번 범위는 별도 EC2에 직접 구성하는 방식이다. 무료 제공량이나 예상 요금만으로 배제하지 않는다 |
| **upstream OpenTelemetry Collector** | OTel 구성 요소와 여러 공급자 대상의 공통 파이프라인이 중심일 때 | 현재 필요한 Prometheus scrape와 Loki 로그 경로를 Alloy에서 함께 다루기로 했다. OTel 지원 여부로 둘을 구분하지 않는다 |
| **Fluent Bit·Vector 등 로그 중심 수집기** | 로그 수집과 가공이 주된 요구일 때 | 호스트·애플리케이션 메트릭까지 함께 관리하려 하므로 통합 수집 경로를 우선했다. 성능 우열을 측정한 결과는 아니다 |
| **node_exporter와 로그 수집기 조합** | 기능별 도구를 독립적으로 운영하고 싶을 때 | 역할은 분명하지만 설치·설정·업데이트 대상을 나눠 관리해야 한다 |
| **중앙 Alloy만 사용** | 애플리케이션이 OTLP로 내보내고 호스트 관측은 별도로 해결할 때 | 로컬 로그와 호스트 데이터 수집 경로가 별도로 필요하다 |
| **로컬 + 중앙 Alloy** | 많은 수집기의 필터·인증·라우팅 정책을 중앙에서 관리할 때 | 초기에는 두 수집 계층을 운영할 필요가 아직 확인되지 않았다 |
| **애플리케이션에서 저장소로 직접 전송** | 관측 신호가 적고 목적지·인증 변경이 드물 때 | 신호별 exporter와 목적지 설정이 앱에 가까워지고 호스트 데이터 수집은 여전히 남는다 |

SigNoz·Datadog·Kiali는 수집기와 같은 층의 대안이 아니다. 각각 통합 관측 플랫폼이나
서비스 메시 관찰 도구에 가깝다. 기능을 검토했지만 도입·성능·비용 비교 실험까지 한 것은 아니다.
도구의 역할 차이는 [학습 노트](../learning/observability.md)에서 다룬다.

## 초기 범위와 보류한 기능

| 범위 | 결정 |
| --- | --- |
| 호스트 CPU·메모리·디스크·인터페이스 송수신량 | Alloy의 호스트 수집 경로로 수집한다 |
| HTTP 요청량·5xx 비율·응답시간, JVM·Hikari | Micrometer → Alloy → Prometheus |
| 애플리케이션 로그 | 기존 ECS JSON을 유지하고 로컬 로그 원본 → Alloy → Loki로 전환한다 |
| 조회 화면 | Grafana의 일반 대시보드, 로그 조회와 [Canvas 시스템 흐름 화면](../observability/CANVAS.md)을 파일 provisioning으로 관리한다 |
| 트레이스·자동 서비스 그래프 | 초기에는 제외했으나 [인프라 ADR 0003](0003-tempo-tracing.md)에서 Agent·Tempo·지표 생성을 추가한다. 자동 서비스 그래프와 인프라 지도는 후속 범위다 |
| DB 간선별 bytes/s | 초기 제외. 호스트 총 송수신량과 구별하며 별도 네트워크 계측이 필요하다 |
| 알림 | [Slack 장애 알림](../observability/SLACK.md)은 Grafana 시작 시 health·HTTP 500·호스트 CPU·메모리·디스크·inode 알림 정의 12개와 전달 정책을 파일 provisioning으로 적용한다. 이후 변경도 파일에서 관리한다. 외부 장애 감시는 아직 없으며 실제 AWS·Slack 동작은 별도 검증한다 |
| micro 모니터링 서버 | 검증 후보. 평상시와 부하 테스트의 수용량을 보장한 결정이 아니다 |

## 결과와 재검토 조건

직접 구성하는 만큼 각 도구의 연결과 데이터 흐름을 설명하기 쉬워지지만 보관 기간·디스크
고갈·백업·업데이트·수집 누락을 팀이 운영해야 한다. 모니터링 EC2 한 대에 세 프로그램을 두면
그 호스트의 장애로 수집·조회·알림이 함께 중단될 수 있다. Nginx 장애도 앱 Alloy의 전송 재시도를
발생시킨다. 모니터링 스택을 먼저 배포하고 수신을 확인한 뒤 앱 Alloy 목적지를 바꾼다.

Prometheus의 remote write 수신은 작은 유입량을 전제로 검토한다. 공식 문서는 이 수신 경로를
대규모 push 수집의 일반 대안으로 사용하지 말라고 설명한다. 초기 1번 배치는 유지하되 실제
유입량이 감당 범위를 넘으면 Prometheus의 직접 scrape나 전용 remote write 저장소를
재검토한다. [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/#remote-write-receiver)

다음 관찰이 있으면 결정을 다시 검토한다.

- Alloy가 애플리케이션 자원을 압박하거나 수집 누락이 지속된다.
- Prometheus의 활성 시계열·메모리·디스크 또는 Loki의 수집·조회 부하가 운영 한계를 넘는다.
- 호스트별 설정 배포가 잦아져 중앙 정책 관리의 이점이 커진다.
- 개별 요청의 DB·외부 호출 시간이 필요해 로그와 집계 지표만으로 원인 조사가 어렵다.
- 직접 운영하는 시간과 비용이 관리형 대안보다 불리하다고 실제 운영 자료에서 확인된다.

## 후속 작업과 완료 조건

[초기 실행 구성](../observability/OPERATIONS.md)에 Alloy, 저장소의 영속 볼륨·보관 정책과
backend의 기본 `local` logging driver와 수집 허용 라벨을 적용했다. [아키텍처 문서](../observability/ARCHITECTURE.md)의
전환 순서에 따라 dev EC2에서 수집을 확인하고 histogram·라벨, 대시보드·알림을 준비한다.
AWS 배포, 기존 Agent 제거와 외부 자원 정리는 수행하지 않았다.

전환 완료는 화면에 그래프가 생기는 것으로 판정하지 않는다. 환경 구분, 요청 ID로 찾은 로그,
수집기 재시작, 저장소 일시 중단 후 복구, 데이터 없음 알림, 성능 테스트 중 수집 지연과 누락까지
확인해야 한다. 현재 알림 규칙의 운영 동작과 외부 장애 감시 공백을 배포 전에 확인해야 한다.
