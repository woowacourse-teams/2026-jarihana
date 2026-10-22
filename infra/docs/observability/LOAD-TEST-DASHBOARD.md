# 부하 테스트 대시보드

부하를 높일 때 처리량·API 응답 시간·오류율과 백엔드·DB 자원 상태를 함께 비교할 수 있도록
`자리하나 · 부하 테스트` 대시보드를 제공한다. 한 화면에서 병목의 징후를 확인하고,
별도로 수집한 k6 결과와 같은 시간대를 비교하는 용도다.

정의 파일은 [jarihana-load-test.json](../../monitoring/grafana/provisioning/dashboards/json/jarihana-load-test.json)이다.
UID는 `jarihana-load-test`이며 기존 `Jarihana` provider가 자동 등록한다.

```text
/d/jarihana-load-test
```

기존 운영 대시보드와 다른 UID를 사용한다. Grafana의 파일 provisioning 설정과
Prometheus datasource UID `prometheus`를 재사용한다. JSON 변경은 기존 provider의
30초 polling으로 반영하며 Grafana UI에서 저장한 값을 원본으로 삼지 않는다.

## 사용 방법

1. 테스트할 서버의 메트릭이 연결된 Grafana에서 대시보드를 연다.
2. **환경**에서 `dev` 또는 `prod`를 선택한다. DB 이름은 각각 `jarihana_dev`와
   `jarihana_prod`로 자동 전환된다. **백엔드 서버**는 해당 환경의 Alloy health 수집 대상에서 선택한다.
3. 시간 범위를 테스트 실행 구간으로 맞추고 처리량·지연·자원 포화가 함께 변하는지 비교한다.
4. k6 결과는 별도 결과 파일로 분석한다. 이 대시보드는 서버·DB 지표만 조회하며,
   가상 사용자 수·클라이언트 실패·예상 거절·목표 RPS는 표시하지 않는다.

## 수집 조건

| 수집원 | 필요한 메트릭과 라벨 |
| --- | --- |
| 백엔드 Actuator | `job="jarihana-backend"`, HTTP histogram·HikariCP·JVM·GC |
| Alloy PostgreSQL exporter → RDS | `job="jarihana-postgres"`, `pg_up`·deadlocks·블록 읽기/캐시 적중·`jarihana_pg_activity_*`·`jarihana_pg_io_*`·`jarihana_pg_statements_*` |
| Alloy unix exporter → EC2 | `job="jarihana-host"`, `node_cpu_seconds_total`·`node_memory_MemAvailable_bytes`·`node_memory_MemTotal_bytes`, `host_id` |

앱과 PostgreSQL 지표는 `environment`로 구분한다. 호스트 지표에는 환경 라벨이 없으므로
`host_id`와 해당 환경의 `jarihana-health` 수집 대상을 연결한다. CPU는 EC2의 전체 코어 평균,
메모리는 전체 RAM 대비 `MemAvailable`을 뺀 사용률이다. 기존 운영 대시보드와 같은
호스트 계산식을 사용하며, 백엔드 EC2와 RDS 자체 자원 사용률을 혼동하지 않는다.

새 DB 통계는 [postgres-queries.yaml](../../monitoring/alloy/postgres-queries.yaml)을 기존 Alloy의
`prometheus.exporter.postgres.database`에 연결해 같은 `POSTGRES_MONITOR_DSN`과 remote-write 경로로 보낸다.
dev·prod 앱 Compose는 이 파일을 읽기 전용으로 마운트한다. 별도 DB 수집 서비스를 추가하지 않는다.
쿼리 파일 변경도 앱 배포 workflow를 실행하므로 대시보드뿐 아니라 각 환경의 Alloy도 갱신해야 한다.
기존 PostgreSQL 수집 주기 60초는 유지한다. DB rate 패널의 최소 수집 간격은 1분으로
설정해 `$__rate_interval`이 최소 4분의 표본을 사용하게 한다.

모니터링 계정에 `pg_monitor` 권한이 필요하며 SQL 통계에는 해당 DB의 `pg_stat_statements` 활성화가 필요하다.
I/O 통계는 PostgreSQL 16 이상과 `track_io_timing=on`을 전제로 한다. 타이밍 수집이 꺼져 있으면
I/O 쿼리는 행을 반환하지 않아 미수집을 0ms로 오해하지 않도록 한다. 확장 생성은 백엔드
Flyway V5가 담당한다. RDS 파라미터와 계정 권한은 자동 변경하지 않는다.
설정을 끈 직후에는 Prometheus 조회 구간에 남아 있는 과거 표본이 잠시 보일 수 있다.
[DB 연결 준비](OPERATIONS.md#db-연결-준비)에서 사전 조건을 확인한다.

대시보드 변경은 저장소 루트에서 `node infra/monitoring/grafana/test-load-test-dashboard.mjs`로
검증한다. Docker의 고정 Prometheus 이미지로 모든 PromQL과 dev/prod 격리·미수집 표시를 확인하며
실제 서버에 부하를 발생시키지 않는다.

## 표시 범위와 해석

- 서버 완료 요청률, API별 p50/p95/p99·5xx, CPU·메모리, HikariCP, JVM·GC,
  DB 락 대기·데드락·I/O와 수집 상태를 제공한다.
- 요청 처리량은 서버가 처리를 완료한 요청의 초당 증가율이다. 선택한 환경의 전체
  트래픽을 포함하며 부하 발생기가 보낸 요청 수나 목표 요청률과 다를 수 있다.
- 클라이언트 관점의 처리량·오류·타임아웃·dropped iterations는 별도 k6 결과에서 확인한다.
- 서버 5xx 시계열이 없거나 요청 표본이 부족하면 오류율·백분위수가 비어 있을 수 있다.
  빈 값을 임의로 0으로 바꾸지 않는다.
- PostgreSQL I/O 평균 시간은 구간 연산 수가 0이면 표시하지 않는다. `pg_stat_io`는
  클러스터 통계이며 WAL I/O를 제외한다. 블록 읽기·캐시 적중 패널은 DB별 PostgreSQL
  버퍼 동작 횟수다. 물리 디스크 전송량이나 스토리지 대기 큐로 해석하지 않는다.
- DB 락 대기는 수집 시점의 세션 수다. 수집 간격보다 짧게 끝나는 대기는 놓칠 수 있다.

SQL별 `mean_exec_time`, `max_exec_time`, `calls`는 최신 값 상위 20개를 표로 표시한다.
Prometheus에 보관되는 시간별 표본과 달리 이 표는 instant query를 사용하므로
대시보드에서 선택한 시간 구간의 변화량을 나타내지 않는다.

| 지표 | 의미 |
| --- | --- |
| `mean_exec_time` | 통계 초기화 이후 해당 SQL의 누적 평균 실행 시간(ms) |
| `max_exec_time` | 해당 SQL의 min/max 통계 초기화 이후 최대 실행 시간(ms) |
| `calls` | 해당 SQL의 통계 초기화 이후 완료 실행 횟수 |

`calls`의 구간 실행 횟수는 counter 증가량으로 계산할 수 있다. 구간 평균에는
`total_exec_time` 증가량을 `calls` 증가량으로 나눈 값이 필요하며, 현재 대시보드의
세 패널은 `total_exec_time`을 수집하거나 계산하지 않는다. 누적 최대값의 차이로
구간 최대 실행 시간을 복원할 수는 없다. SQL 원문과 실행 계획은 DB에서 별도로 확인한다.

SQL 식별자 `queryid`와 `userid`에는 문자열 표시 단위를 적용한다. 실행 시간 단위가
식별자 열에 적용되거나 큰 식별자가 시간 단위로 축약되지 않도록 한다.
