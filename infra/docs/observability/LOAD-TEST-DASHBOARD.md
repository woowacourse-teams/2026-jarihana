# 로컬 스트레스 테스트 대시보드

현재 로컬에서 확인한 `자리하나 · 로컬 스트레스 테스트` 대시보드의 원본을
[jarihana-load-test-local.json](../../monitoring/grafana/provisioning/dashboards/json/jarihana-load-test-local.json)에 보관한다.
UID는 `jarihana-load-test-local`이며 기존 `Jarihana` provider가 자동 등록한다.

```text
/d/jarihana-load-test-local
```

기존 운영 대시보드와 다른 UID를 사용한다. Grafana의 파일 provisioning 설정과
Prometheus datasource UID `prometheus`를 재사용한다. JSON 변경은 기존 provider의
30초 polling으로 반영하며 Grafana UI에서 저장한 값을 원본으로 삼지 않는다.

## 수집 조건

기본 환경은 `local-load-test`다. 이 대시보드는 로컬 부하 테스트 수집원이 보내는
아래 메트릭을 조회한다. JSON을 등록하는 작업 자체가 수집기를 설치하거나
dev/prod의 Alloy 설정을 바꾸지는 않는다.

| 수집원 | 메트릭과 라벨 | 로컬 수집 주기 |
| --- | --- | --- |
| 백엔드 Actuator | `job="jarihana-backend"`, HTTP histogram·HikariCP·JVM·GC | 5초 |
| PostgreSQL exporter | `job="jarihana-postgres"`, `datname="jarihana"`, `pg_up`·deadlocks·`jarihana_pg_activity_*`·`jarihana_pg_io_*`·`jarihana_pg_statements_*` | 10초 |
| 로컬 컨테이너 수집기 | `job="jarihana-containers"`, `jarihana_container_*`, `service="backend"` 또는 `"postgres"` | 10초 |

모든 위 수집원은 `environment="local-load-test"` 라벨을 사용한다.
SQL 통계에는 `pg_stat_statements`가 필요하다. CPU는 컨테이너 제한 코어 대비이며
메모리는 inactive file cache를 뺀 사용량을 컨테이너 제한과 비교한다.
호스트 전체 사용량이나 AWS 인스턴스의 성능을 의미하지 않는다.

현재 dev/prod 기본 수집 설정에는 이 로컬 컨테이너·SQL 사용자 정의 메트릭이 없다.
따라서 동일 Prometheus에 로컬 수집값을 보내지 않은 환경에서는 해당 패널이
`수집 없음`으로 표시된다. AWS용 수집 설정이나 RDS CloudWatch 연동을 대신하는
대시보드로 해석하지 않는다.

## 표시 범위와 해석

- 서버 완료 요청률, API별 p50/p95/p99·5xx, CPU·메모리, HikariCP, JVM·GC,
  DB 락 대기·데드락·I/O와 수집 상태를 제공한다.
- 기존 로컬 화면의 k6 패널도 보존한다. k6 결과를 별도 파일로 저장하고 remote-write를
  사용하지 않는 실행에서는 VU·클라이언트 실패·예상 거절 패널이 비어 있는 것이 예상된다.
  서버 분석에는 별도 k6 결과의 처리량·오류·타임아웃·dropped iterations를 함께 사용한다.
- 서버 5xx 시계열이 없거나 요청 표본이 부족하면 오류율·백분위수가 비어 있을 수 있다.
  빈 값을 임의로 0으로 바꾸지 않는다.
- PostgreSQL I/O 평균 시간은 구간 연산 수가 0이면 표시하지 않는다.
  블록 전송량은 RDS `DiskQueueDepth`와 다른 지표다.
- DB 락 대기는 수집 시점의 세션 수다. 10초 사이에 끝나는 짧은 대기는 놓칠 수 있다.

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
