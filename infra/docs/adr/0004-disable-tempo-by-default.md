# ADR 0004. Tempo는 기본 모니터링 경로에서 비활성화하고 DB 호출 지표는 JDBC 메트릭으로 본다

- 상태: 채택 — 저장소 구성 반영, AWS 미배포
- 날짜: 2026-10-13
- 범위: 기본 모니터링 실행 구성, DB 호출량·지연 시간 지표, 선택적 trace 구성
- 대체 관계: [인프라 ADR 0003](0003-tempo-tracing.md)의 Tempo 상시 실행 결정을 기본 비활성 구성으로 바꾼다.
- 관련 문서: [아키텍처](../observability/ARCHITECTURE.md), [실행 가이드](../observability/OPERATIONS.md), [서비스 토폴로지](../observability/CANVAS.md), [트레이스 가이드](../observability/TRACING.md)
- 구현 PR: [#398](https://github.com/woowacourse-teams/2026-jarihana/pull/398)

## 배경

이번 결정의 직접적인 배경은 모니터링 EC2의 메모리 부족이다. 운영자의 보고와 요청에 따라
Tempo를 기본 실행에서 제외해 메모리 부담을 줄이되, 이미 만든 대시보드의 배치와 주요 지표는 유지하기로 했다.

초기 토폴로지는 Tempo metrics-generator가 만든 service graph 지표로 DB 호출량과 DB p95를 보여주도록 설계했다.
그래서 Tempo 컨테이너만 중지하면 두 값의 원천이 사라진다. 현재 먼저 필요한 health, HTTP 오류,
호스트 자원, 로그, DB 연결 상태와 호출 흐름을 계속 보려면 DB 호출 지표의 수집 경로도 함께 바꿔야 한다.
Tempo를 항상 켜면 trace 저장소와 metrics-generator의 메모리가 필요하고,
앱의 Java Agent와 Alloy의 OTLP 처리 경로도 함께 운영해야 한다.

DB 호출량과 지연 시간은 trace 없이도 애플리케이션 JDBC 계층에서 메트릭으로 수집할 수 있다. 이미 백엔드는
Actuator Prometheus endpoint를 Alloy가 scrape하고 있으므로, JDBC 메트릭을 같은 경로로 내보내면 대시보드가
Tempo에 의존하지 않아도 된다.

## 결정

기본 모니터링 Compose에서는 Tempo를 실행하지 않는다. Tempo 서비스, 데이터 소스, Nginx trace 수신 경로,
Prometheus의 Tempo scrape, 앱 Alloy의 OTLP trace pipeline은 기본 실행 경로에서 제외한다.
나중에 요청 단위 trace 분석이 필요하면 Tempo와 Java Agent 경로를 선택 구성으로 다시 켠다.
여기서 제거는 기본 배포에서 Tempo 컨테이너와 trace 전송을 끈다는 뜻이다.
재활성화를 위한 `tracing` profile과 설정 파일은 남기고, 기존 `tempo-data` 볼륨은 삭제하지 않는다.

DB 호출량과 DB p95는 백엔드의 Datasource Micrometer 계측으로 만든 Prometheus 지표를 사용한다.
대시보드는 `jdbc_query_seconds_count`의 최근 2분 증가율을 DB 호출량으로 보고,
`jdbc_query_seconds_bucket`의 histogram으로 DB p95를 계산한다. 이 지표는 앱에서 실행한 JDBC 호출을 집계한 값이다.
SQL 문장 개수나 특정 커넥션 하나의 처리량을 그대로 뜻하지 않으며, batch 실행은 JDBC 실행 단위로
집계될 수 있다. 예약 작업이나 health check가 실제 SQL을 실행하면 포함될 수 있지만, 단순 connection
validity 확인처럼 SQL을 실행하지 않는 검사는 `jdbc_query_seconds_*`를 만들지 않을 수 있다.
최근 2분 집계에 남은 과거 샘플이 계측 누락을 가리지 않도록, 합산 전 각 JDBC 시계열이 존재하고
마지막 샘플이 30초 미만인지 확인한다. 유효한 count가 없으면 호출량을 숨기고 흐름을 멈추며,
유효한 bucket이 없으면 p95를 숨긴다. DB 직접 검사와 앱 DB 연결 상태의 판단 기준은 유지한다.

HikariCP 지표는 계속 연결 풀 상태를 표현하는 데만 쓴다. `hikaricp_connections_active`,
`hikaricp_connections_idle`, `hikaricp_connections_max`, `hikaricp_connections_pending`은 풀의 현재 상태이고,
`hikaricp_connections_usage_seconds_count`는 연결을 빌려 쓴 횟수다. 이 값은 SQL 실행 시간이나 DB p95가 아니다.

## 기존 대시보드를 유지하는 방법

노드 배치와 연결선은 저장소의 Flow·Canvas 정의가 그리고, 색·수치·애니메이션은 조회한 메트릭을 사용한다.
Tempo가 화면 자체를 그리는 구조가 아니므로 DB 호출량·DB p95의 원천을 JDBC 메트릭으로 바꾸면
기존 서비스 토폴로지와 운영 대시보드를 유지할 수 있다.

| 유지할 화면·기능 | 기본 구성의 데이터 원천 |
| --- | --- |
| HTTP req/s·5xx·p95·p99 | Micrometer의 `http_server_requests_seconds_*` |
| 서버 CPU·메모리·디스크 | Alloy 호스트 exporter의 `node_*` |
| HikariCP 사용·유휴·최대·대기와 풀 애니메이션 | `hikaricp_connections_*`와 이전 수집값 비교 |
| DB 호출량·DB p95와 호출 흐름 표시 | Datasource Micrometer의 `jdbc_query_seconds_count`·`jdbc_query_seconds_bucket` |
| DB 아이콘의 직접 연결 상태 | PostgreSQL exporter의 `pg_up`·`up` |
| DB 연결선과 앱 DB 점검 상태 | Actuator database health probe와 앱 liveness |
| 로그 조회 | Docker 로그 → Alloy → Loki |

DB 아이콘과 앱에서 DB로 향하는 연결선은 서로 다른 경로를 나타낸다. 직접 접속이 가능해도
앱 계정이나 연결 풀에 문제가 있을 수 있으므로 연결선의 색은 앱 DB 검사 결과를 따른다.
선의 움직임은 앱 지표 수집과 앱 DB 검사가 모두 정상일 때만 JDBC 호출량으로 표현한다.
백엔드만 중단되면 흐름은 멈추고 앱 연결 상태는 확인 불가가 되지만, Alloy의 직접 검사가
정상이면 DB 아이콘은 정상으로 남는다. 반대로 직접 검사만 실패해도 앱의 연결 상태와 호출량이
정상이면 선은 계속 움직인다. HikariCP 개별 풀 자리와 대여·반납 모션의 기준은 바꾸지 않는다.

DB p95는 기존 span 집계에서 앱의 JDBC 실행 시간 집계로 측정 범위가 바뀐다.
화면 항목은 유지하지만 전환 전후 숫자가 항상 일치한다는 뜻은 아니다.
움직이는 선과 풀의 점도 집계값의 표현이며, 특정 요청이나 물리 커넥션의 이동을 재생하지 않는다.
요청별 span 타임라인, trace ID 조회와 trace 기반 관계 분석은 기본 구성에서 사용할 수 없다.

## 검토한 대안

| 대안 | 이번에 선택하지 않은 이유 |
| --- | --- |
| Tempo를 계속 기본 실행 | 메모리가 부족한 모니터링 EC2에서 trace 저장소와 metrics-generator의 상시 부담을 유지하게 된다 |
| Tempo만 중지하고 대시보드 쿼리는 유지 | 기존 DB 호출량·p95의 원천이 없어져 화면 유지 요구를 충족하지 못한다 |
| HikariCP usage timer로 DB p95 표시 | 연결 대여 시간은 트랜잭션 보유 시간까지 포함할 수 있어 쿼리 지연 시간으로 해석하기 어렵다 |
| PostgreSQL exporter만으로 앱 DB 호출량 계산 | DB 서버 상태는 볼 수 있지만 앱이 수행한 JDBC 호출량·지연 시간은 직접 설명하지 못한다 |
| trace를 완전히 폐기 | 나중에 느린 요청의 내부 span을 볼 필요가 생길 수 있으므로 선택 구성으로 남긴다 |

## 결과와 재검토 조건

기본 스택에서 Tempo와 trace 처리 부담을 제외하고, 서비스 토폴로지의 DB 호출량·DB p95·커넥션 풀 표시는 유지한다.
다만 특정 요청 하나를 열어 HTTP span과 JDBC span을 따라가는 trace drill-down은 기본 구성에서 사용할 수 없다.
느린 요청의 원인을 요청 단위로 추적해야 하거나 서비스 간 호출 관계가 늘어나면,
호스트의 메모리 여유와 수집량을 확인한 뒤 Tempo 선택 구성을 다시 켠다.

메모리 부족 보고와 제거 결정은 실제 절감량 측정과 구분한다. Tempo가 메모리 부족의 유일한 원인이라고
확정한 것은 아니며, 동일 부하에서 전환 전후 호스트 가용 메모리와 컨테이너 사용량을 비교한다.
JDBC histogram도 앱과 Prometheus에 수집 비용을 추가하므로 제거만으로 용량이 충분하다고 판단하지 않는다.

JDBC 메트릭이 노출되려면 백엔드가 먼저 새 계측 의존성과 histogram 설정을 포함해 배포되어야 한다.
모니터링 대시보드를 먼저 배포하면 DB 호출량과 DB p95는 백엔드가 갱신될 때까지 `—` 또는 데이터 없음으로 보일 수 있다.
이 순서는 장애가 아니라 배포 순서 차이다.
