# 자리하나 Native Canvas 관제도

자리하나 Native Canvas 관제도는 Grafana의 `Jarihana` 폴더에 `자리하나 · Canvas 관제도`
이름으로 등록된다. 저장된 UID는 `jarihana-canvas-native`이며 운영 Grafana에서는 다음 경로로
접근한다.

```text
/d/jarihana-canvas-native
```

로컬 검증 환경에서는 다음 주소를 사용한다.

```text
http://localhost:13000/d/jarihana-canvas-native
```

대시보드 원본은 [jarihana-canvas-native.json](../../monitoring/grafana/provisioning/dashboards/json/jarihana-canvas-native.json)이다.
이 JSON은 [build-dashboard.mjs](../../monitoring/grafana/canvas/build-dashboard.mjs)가
기존 Flow 대시보드의 Prometheus target을 재사용해 만든다.

```bash
node infra/monitoring/grafana/canvas/build-dashboard.mjs
```

기존 Flow 화면은 유지한다. Flow 화면의 UID는 `jarihana-canvas`이고 문서는
[서비스 토폴로지](CANVAS.md)에 둔다. Native Canvas 화면은 별도 UID와 별도 JSON을 사용하며,
상단 링크의 `기존 Flow 보기`로 기존 화면으로 이동할 수 있다.

## Compose와 Grafana 기능

Native Canvas는 Grafana 기본 `canvas` 패널 하나로 구성한다. 외부 Flow panel 플러그인 설정을
수정하지 않는다. 모니터링 Compose의 Grafana 서비스는 기존 Flow 화면을 위해
`GF_PLUGINS_PREINSTALL_SYNC=andrewbmchugh-flow-panel@1.20.1`을 유지하고, 기본 Canvas 확대·이동을
위해 `GF_FEATURE_TOGGLES_ENABLE=canvasPanelPanZoom`을 켠다.

JSON은 `canvas` 단일 패널 하나에 모든 Prometheus target을 둔다. 별도 패널을 여러 개 조합한
대시보드가 아니므로, 배치와 선 연결을 바꿀 때는 같은 패널의 `options.root.elements`와
`targets`를 함께 확인한다.

## 배치와 소유권

화면은 사용자, 백엔드 호스트, 애플리케이션, HikariCP 연결 풀, 외부 RDS를 한 장에 배치한다.

| 영역 | 소유권 | 의미 |
| --- | --- | --- |
| `백엔드 호스트` | EC2 호스트 | CPU·메모리 같은 서버 자원 상태 |
| `애플리케이션` | Spring Boot 앱 | 앱 liveness와 종합 health, HTTP 요청량, p95·p99, 5xx |
| `앱의 커넥션 풀` | 앱 프로세스의 HikariCP | active·idle·max·pending과 풀 사용률 |
| `PostgreSQL` | 외부 RDS | Alloy의 직접 접속 검사와 JDBC 메트릭 기반 DB 호출 |

HikariCP 수치는 RDS 서버의 전체 연결 수가 아니다. 앱 프로세스가 가진 JDBC 연결 풀 상태다.
`대기`는 연결을 얻으려고 기다리는 스레드 수다. CPU·메모리는 선택한 환경의 호스트 중
가장 높은 사용률, 풀 수치는 선택한 환경의 앱을 합산한 값이다. 여러 인스턴스를 운영할 때
각 호스트를 하나씩 그린 지도는 아니며, 인스턴스별 값은 운영 상세 화면에서 확인한다.
RDS CPU, 메모리, 스토리지, 락, 쿼리 플랜은 이 화면에서 직접 측정하지 않는다.

## 앱·DB·연결 상태 구분

| 표시 | 수집 경로 | 의미 |
| --- | --- | --- |
| API 아이콘·`응답 중` | `/actuator/health/liveness` | DB와 무관하게 Spring Boot가 생존 상태를 응답함 |
| 앱 상단 `서비스 정상/이상`·사용자 연결선 | `/actuator/health` | DB를 포함한 앱의 종합 상태 |
| DB 아이콘·`접속 정상/실패` | Alloy의 PostgreSQL exporter → DB | 모니터링 계정으로 DB에 직접 접속할 수 있는지 |
| API → HikariCP → DB 연결선·`앱 연결 정상/실패` | `/actuator/health/database` | 앱의 DB 계정과 연결 풀을 통한 연결 상태 |

DB가 중단돼도 앱이 살아 있으면 API는 `응답 중`, 서비스는 `서비스 이상`, DB는 `접속 실패`가 된다.
반대로 앱만 중단되면 API는 `응답 없음`이고 DB 직접 접속은 계속 확인한다. 앱에서 DB로 가는
경로는 검사할 수 없으므로 liveness 실패가 수집되면 연결선을 회색 `확인 불가`로 표시한다.
흐름은 앱 metrics 수집 실패만으로도 멈추며, DB 아이콘을 장애로 바꾸지는 않는다.

앱이 살아 있어도 앱 DB 연결 검사가 실패하면 연결선은 빨간색으로 바뀌고 흐름이 멈춘다.
직접 접속이 정상이면 DB 아이콘은 정상으로 유지된다. 반대로 모니터링 계정의 접속이나 exporter
수집만 실패해도 앱 연결 검사와 지표 수집이 정상이고 호출량이 있으면 선은 계속 움직인다.

직접 검사의 `pg_up`은 DB 접속/Ping 결과이며 `up{job="jarihana-postgres"}`는 exporter 수집 성공 여부다.
exporter 수집에 실패했거나 DB 표본이 150초보다 오래됐으면 DB 아이콘은 `확인 불가`가 된다.
Alloy도 같은 앱 EC2에서 실행되므로 EC2 전체가 중단되면 DB 직접 검사도 멈춘다.
또한 접속 실패만으로 DB 프로세스 중단을 단정할 수 없다. 계정·TLS·네트워크 장애도 같은 결과를 낸다.

liveness는 관리 포트 8081의 응답이다. 업무 포트 8080이나 실제 사용자 요청의 성공까지 보장하지는
않으므로 종합 서비스 상태와 5xx·지연 시간도 함께 본다. 기존 종합 health 알림 규칙은 그대로 사용한다.
모니터링 계정과 DSN 준비는 [운영 가이드](OPERATIONS.md#db-직접-검사-계정)를 따른다.

## 시간 기준

요청량과 지연 시간은 최근 2분 구간으로 계산한다.

| 값 | 기준 |
| --- | --- |
| HTTP req/s | `http_server_requests_seconds_count`의 최근 2분 rate, `/actuator.*` 제외 |
| HTTP p95·p99 | `http_server_requests_seconds_bucket`의 최근 2분 histogram quantile |
| DB ops/s | `jdbc_query_seconds_count`의 최근 2분 rate |
| DB p95 | `jdbc_query_seconds_bucket`의 최근 2분 histogram quantile |
| CPU | `node_cpu_seconds_total`의 최근 2분 rate |
| 메모리 | 가장 최근 host exporter sample |
| HikariCP | 가장 최근 앱 metric sample |

DB ops/s와 DB p95는 최근 2분 rate를 계산하지만, 합산 전 각 count·bucket 시계열의 존재 여부와
마지막 수집 시각을 확인한다. 해당 지표가 없거나 마지막 샘플이 30초 이상 지났으면 `—`로 표시한다.
앱 수집과 health가 정상이어도 JDBC count만 사라지면 과거 호출량으로 선을 계속 움직이지 않는다.
counter 값이 그대로여도 새 샘플이 수집되면 정상적인 유휴 상태다. 이 검사는 기존 5초 화면 갱신마다
쿼리에서 수행하며 DB 아이콘과 연결선의 health 색은 각 검사 결과를 계속 따른다.

대시보드는 5초마다 갱신한다. 종합 health, liveness, 앱→DB 검사와 DB 직접 검사는 각각 60초 주기로 수집된다.
실행 시점이 서로 달라 한 검사 결과가 먼저 바뀔 수 있다. 150초는 실패 판정 대기 시간이 아니라
수집값의 유효기간이다. 이 값은
요청 한 건의 실시간 패킷 흐름이 아니라 최근 수집값을 요약한 관제 화면이다.

## 선과 애니메이션

Native Canvas의 점선 애니메이션은 Flow panel의 duration 기반 속도 표현과 다르다. Canvas 선의
애니메이션 속도는 고정이며, 호출량은 선 굵기와 숫자로 표시한다. 선의 방향은 요청 흐름을
보여준다.

| 선 | 방향 | 상태 색 | 굵기 |
| --- | --- | --- | --- |
| 사용자 → API | HTTP 요청 | DB를 포함한 종합 health | `http_flow` |
| API → HikariCP → PostgreSQL | DB 호출 | 앱→DB 연결 health | `db_flow` |

`흐름 표시` 드롭다운을 `정지`로 바꾸면 `${motion}` 값이 `0`이 되어 점선 방향·굵기 표현이 멈춘다.
DB 흐름은 앱 지표 수집과 앱 DB 연결 검사(`db_connection_health`)가 모두 정상일 때만 표시한다.
수집값이 없거나 오래됐을 때, 호출량이 0일 때, 앱 DB 연결 검사가 실패했을 때는 멈춘다.
DB 아이콘의 직접 접속 결과(`db_health`)는 연결선의 색이나 움직임을 결정하지 않는다.

값이 없으면 패널은 `—`를 표시한다. `—`는 0이 아니라 대상 시계열이 없거나, 필터에 맞는 환경이
없거나, 수집 상태가 오래되어 값을 신뢰할 수 없다는 뜻이다. 최근 2분 동안 HTTP 요청이 없으면
req/s는 `0`, p95·p99는 `—`가 된다. 관측한 요청이 없으므로 지연 시간을 계산하지 않는 것이다.

## 화면 조작과 로컬 검증

서버 아이콘이나 `자리하나 API`를 누르면 환경과 시간 범위를 유지한 채 운영 상세 화면으로
이동한다. `흐름 표시 → 정지`는 숫자 갱신을 유지하면서 움직이는 점선을 숨긴다.
Grafana Canvas는 운영체제의 동작 줄이기 설정을 자동으로 따르지 않으므로 이 메뉴를 사용한다.

가로 배치는 데스크톱 관제 화면을 기준으로 했다. 1440px·1920px에서 전체 흐름을 볼 수 있고,
390px처럼 좁은 화면에서는 전체 그림이 작아진다. Ctrl+휠로 확대하거나 패널을 넓혀서 본다.
Canvas 내부는 밝은 Grafana 테마에서도 어두운 배경과 같은 색상 체계를 유지한다.

로컬 Grafana에서 실제 백엔드 읽기 요청으로 req/s·p95·p99가 표시되는 것을 확인했다.
정지·재생, 미수집 환경의 `확인 불가`, 상세 화면 링크, 확대 기능과 밝은/어두운 테마를 확인했다.
기존 Flow 관련 파일의 해시도 변경 전후 일치했다. 이 검증은 로컬 환경 기준이며 AWS 배포나
운영 부하 검증 결과를 뜻하지 않는다.

직접 DB 검사 추가 후 로컬 PostgreSQL과 백엔드를 각각 중단해 다음 결과도 확인했다.

| 실제 상태 | API liveness | DB 직접 접속 | 앱→DB 연결 | 종합 서비스 |
| --- | --- | --- | --- | --- |
| 모두 실행 | 응답 중 | 접속 정상 | 앱 연결 정상 | 서비스 정상 |
| 백엔드만 중단 | 응답 없음 | 접속 정상 | 앱 연결 미확인 | 서비스 이상 |
| DB만 중단 | 응답 중 | 접속 실패 | 앱 연결 실패 | 서비스 이상 |

이 검증은 로컬의 기존 백엔드 이미지에 `MANAGEMENT_ENDPOINT_HEALTH_PROBES_ENABLED=true`를
주입해 수행했다. 배포용 dev/prod YAML에도 같은 설정을 반영했고 Gradle `processResources`를
통과했다. 실제 RDS의 계정·TLS 접속과 운영 부하는 아직 검증하지 않았다.

## 수정 순서

대시보드 배치나 표시 규칙을 바꿀 때는 생성기를 수정한 뒤 JSON을 다시 만든다.

```bash
node infra/monitoring/grafana/canvas/build-dashboard.mjs
node infra/monitoring/grafana/canvas/test-health.mjs
```

`test-health.mjs`는 생성된 JSON의 PromQL을 Prometheus `promtool`로 실행한다. Docker가 필요하며
DB만 중단, 앱만 중단, metrics 수집 실패, 오래된 표본과 exporter 수집 실패를 구분하는지 검사한다.

Grafana dashboard provider는 JSON 파일을 읽어 `Jarihana` 폴더에 등록한다. JSON만 바꾼 경우
provider의 30초 polling으로 반영될 수 있지만, 적용 여부는 Grafana UI나 로그에서 확인한다.
Grafana 서비스 설정이나 feature toggle을 바꿨다면 [모니터링 실행 가이드](OPERATIONS.md)의
Grafana 재생성 절차를 따른다.
