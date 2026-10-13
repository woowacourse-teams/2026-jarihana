# ADR 0004. Tempo는 기본 모니터링 경로에서 비활성화하고 DB 호출 지표는 JDBC 메트릭으로 본다

- 상태: 채택 — 저장소 구성 반영, AWS 미배포
- 날짜: 2026-10-13
- 범위: 기본 모니터링 실행 구성, DB 호출량·지연 시간 지표, 선택적 trace 구성
- 대체 관계: [인프라 ADR 0003](0003-tempo-tracing.md)의 Tempo 상시 실행 결정을 기본 비활성 구성으로 바꾼다.
- 관련 문서: [아키텍처](../observability/ARCHITECTURE.md), [실행 가이드](../observability/OPERATIONS.md), [서비스 토폴로지](../observability/CANVAS.md), [트레이스 가이드](../observability/TRACING.md)

## 배경

초기 토폴로지는 Tempo metrics-generator가 만든 service graph 지표로 DB 호출량과 DB p95를 보여주도록 설계했다.
하지만 현재 자리하나 운영에서 먼저 필요한 것은 서비스별 trace drill-down보다 health, HTTP 오류, 호스트 자원,
로그, DB 연결 상태와 DB 호출 흐름을 안정적으로 보는 일이다. Tempo를 항상 켜면 Java Agent, OTLP receiver,
trace 저장소, metrics-generator, 추가 메모리와 디스크 운영까지 함께 관리해야 한다.

DB 호출량과 지연 시간은 trace 없이도 애플리케이션 JDBC 계층에서 메트릭으로 수집할 수 있다. 이미 백엔드는
Actuator Prometheus endpoint를 Alloy가 scrape하고 있으므로, JDBC 메트릭을 같은 경로로 내보내면 대시보드가
Tempo에 의존하지 않아도 된다.

## 결정

기본 모니터링 Compose에서는 Tempo를 실행하지 않는다. Tempo 서비스, 데이터 소스, Nginx trace 수신 경로,
Prometheus의 Tempo scrape, 앱 Alloy의 OTLP trace pipeline은 기본 실행 경로에서 제외한다.
나중에 요청 단위 trace 분석이 필요하면 Tempo와 Java Agent 경로를 선택 구성으로 다시 켠다.

DB 호출량과 DB p95는 백엔드의 Datasource Micrometer 계측으로 만든 Prometheus 지표를 사용한다.
대시보드는 `jdbc_query_seconds_count`의 최근 2분 증가율을 DB 호출량으로 보고,
`jdbc_query_seconds_bucket`의 histogram으로 DB p95를 계산한다. 이 지표는 앱에서 실행한 JDBC 호출을 집계한 값이다.
SQL 문장 개수나 특정 커넥션 하나의 처리량을 그대로 뜻하지 않으며, batch 실행은 JDBC 실행 단위로
집계될 수 있다. 예약 작업이나 health check가 실제 SQL을 실행하면 포함될 수 있지만, 단순 connection
validity 확인처럼 SQL을 실행하지 않는 검사는 `jdbc_query_seconds_*`를 만들지 않을 수 있다.

HikariCP 지표는 계속 연결 풀 상태를 표현하는 데만 쓴다. `hikaricp_connections_active`,
`hikaricp_connections_idle`, `hikaricp_connections_max`, `hikaricp_connections_pending`은 풀의 현재 상태이고,
`hikaricp_connections_usage_seconds_count`는 연결을 빌려 쓴 횟수다. 이 값은 SQL 실행 시간이나 DB p95가 아니다.

## 검토한 대안

| 대안 | 이번에 선택하지 않은 이유 |
| --- | --- |
| Tempo를 계속 기본 실행 | DB 호출량·p95만 위해 trace 저장소와 metrics-generator를 상시 운영하는 비용이 크다 |
| HikariCP usage timer로 DB p95 표시 | 연결 대여 시간은 트랜잭션 보유 시간까지 포함할 수 있어 쿼리 지연 시간으로 해석하기 어렵다 |
| PostgreSQL exporter만으로 앱 DB 호출량 계산 | DB 서버 상태는 볼 수 있지만 앱이 수행한 JDBC 호출량·지연 시간은 직접 설명하지 못한다 |
| trace를 완전히 폐기 | 나중에 느린 요청의 내부 span을 볼 필요가 생길 수 있으므로 선택 구성으로 남긴다 |

## 결과와 재검토 조건

기본 스택의 운영 부담은 줄고, 서비스 토폴로지의 DB 호출량·DB p95·커넥션 풀 표시는 Tempo 없이 동작한다.
다만 특정 요청 하나를 열어 HTTP span과 JDBC span을 따라가는 trace drill-down은 기본 구성에서 사용할 수 없다.
느린 요청의 원인을 요청 단위로 추적해야 하거나 서비스 간 호출 관계가 늘어나면 Tempo 선택 구성을 다시 켠다.

JDBC 메트릭이 노출되려면 백엔드가 먼저 새 계측 의존성과 histogram 설정을 포함해 배포되어야 한다.
모니터링 대시보드를 먼저 배포하면 DB 호출량과 DB p95는 백엔드가 갱신될 때까지 `—` 또는 데이터 없음으로 보일 수 있다.
이 순서는 장애가 아니라 배포 순서 차이다.
