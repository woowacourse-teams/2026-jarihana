# 자리하나 서비스 토폴로지

자리하나 서비스 토폴로지는 Grafana의 `Jarihana` 폴더에 `자리하나 · 서비스 토폴로지` 이름으로 등록된다.
저장된 UID는 `jarihana-canvas`이며 로컬 검증 환경에서는 다음 주소로 접근한다.

```text
http://localhost:13000/d/jarihana-canvas
```

운영 Grafana에서는 같은 UID를 사용한다.

```text
/d/jarihana-canvas
```

모니터링 EC2의 메모리 부족으로 Tempo를 기본 실행에서 제외해도 이 화면의 노드·연결선·풀 표시는 유지한다.
DB 호출량과 DB p95만 Tempo가 생성한 지표에서 `jdbc_query_seconds_*`로 바꾼다.
HTTP req/s·p95·p99, 호스트 CPU·메모리와 HikariCP 지표는 기존 수집 경로를 사용한다.
Flow와 [내장 Canvas](NATIVE-CANVAS.md)에 같은 원칙을 적용한다.
요청별 trace 조회는 기본 구성에서 빠지며, 수치의 측정 범위와 결정 이유는
[인프라 ADR 0004](../adr/0004-disable-tempo-by-default.md#기존-대시보드를-유지하는-방법)에 있다.

이 화면은 Grafana 내장 Canvas가 아니라
[Flow panel](https://grafana.com/grafana/plugins/andrewbmchugh-flow-panel/) `1.20.1`을 사용한다.
Compose의 Grafana 설정은 `GF_PLUGINS_PREINSTALL_SYNC=andrewbmchugh-flow-panel@1.20.1`로 플러그인 버전을 고정한다.
대시보드 원본은 [jarihana-canvas.json](../../monitoring/grafana/provisioning/dashboards/json/jarihana-canvas.json)이고,
편집 가능한 토폴로지 원본은 다음 두 파일이다.

| 파일 | 역할 |
| --- | --- |
| [map.svg](../../monitoring/grafana/topology/map.svg) | 브라우저, 백엔드 서버, PostgreSQL 아이콘과 연결선의 SVG 원본 |
| [panel-config.yaml](../../monitoring/grafana/topology/panel-config.yaml) | SVG 셀 ID와 Grafana 쿼리 결과를 연결하는 Flow 설정 |
| [pool-nodes.mjs](../../monitoring/grafana/topology/pool-nodes.mjs) | 커넥션 수에 따라 작은 원의 개수·배치·색을 바꾸는 Flow 속성식 생성 |

[sync-dashboard.mjs](../../monitoring/grafana/topology/sync-dashboard.mjs)는 SVG와 YAML을
커넥션 노드와 속성식을 생성한 뒤 `jarihana-canvas.json`의 Flow panel 옵션에 삽입한다. 토폴로지 파일을 고친 뒤에는 다음 명령으로
대시보드 JSON을 갱신한다.

```bash
node infra/monitoring/grafana/topology/sync-dashboard.mjs
```

모니터링 자동 배포 workflow도 Compose 적용 전에 Node 24로 이 스크립트를 실행한다.
따라서 `infra/monitoring/grafana/topology/**` 변경이 `develop`에 들어가면 생성된 dashboard JSON과
Compose 설정 검사를 거쳐 모니터링 EC2에 적용된다.

Grafana dashboard provider는 `Jarihana` 폴더의 JSON 파일을 시작 시 등록하고,
`updateIntervalSeconds: 30` 설정에 따라 파일 변경을 30초마다 확인한다.

## 화면의 목적

토폴로지는 사용자 브라우저, 자리하나 API, PostgreSQL을 왼쪽부터 배치한다. 각 노드는 브라우저,
서버 랙, DB 실린더 아이콘으로 구분한다. API와 DB 사이의 작은 원 묶음은 앱 내부 HikariCP
커넥션 풀을 나타낸다. 별도 서버나 프록시를 뜻하지 않는다.
백엔드와 풀 사이에는 별도 왼쪽 간선을 그리지 않는다. 풀 곡선은 백엔드 오른쪽 가장자리에서
풀 영역을 지나 DB 앞의 한 지점으로 모이고, 그 뒤에는 하나의 공유 trunk가 DB 외곽까지 이어진다.
풀 아래에는 `HikariCP` 제목과 `최대 N · 대기 N` 요약만 표시하고, DB 호출 지표는 공유 trunk 아래에 표시한다.

공유 trunk 아래에는 DB 호출량과 DB p95를 나란히 표시한다.
두 값은 해당 환경의 DB 호출을 집계한 값이며, 특정 커넥션 자리 하나의 처리량이나 지연 시간이 아니다.

브라우저에서 API로 향하는 위쪽 선에는 HTTP req/s를 표시하고, API에서 브라우저로 돌아가는 아래쪽
응답선에는 p95·p99와 5xx/초를 표시한다. p95·p99는 서버가 처리한 HTTP 요청의 소요 시간이며,
브라우저까지의 네트워크 왕복 시간은 포함하지 않는다. 두 선의 이동 속도는 같은 완료 요청 카운터를
사용한 최근 2분 호출량 요약이며 요청과 응답 패킷을 각각 추적한 애니메이션은 아니다.

이 화면은 운영자가 앱, DB, 관측 수집 상태를 한눈에 보는 요약 화면이다. 원인 분석은
[운영 대시보드](DASHBOARD.md), Grafana Explore, Loki log에서 이어 본다. Tempo trace는 선택 구성을 켰을 때만
사용한다. 백엔드와 DB
노드를 클릭하면 같은 환경과 시간 범위를 유지한 채 `jarihana-overview`로 이동한다.

환경 필터는 `dev` 또는 `prod` 중 하나만 선택한다. 여러 앱 호스트가 같은 환경에 있으면 health와
자원 상태는 가장 나쁜 값을 기준으로 보여주고, 요청량과 DB 호출량은 합산한다. 그래서 이 화면은
개별 호스트의 세부 상태보다 환경 전체의 위험 신호를 먼저 보여준다.

## 실시간성

이 토폴로지는 요청마다 이벤트를 밀어 넣는 실시간 화면이 아니다. Grafana 화면은 5초마다 새로고침하고,
호출량과 지연 시간은 최근 2분 구간의 Prometheus 지표로 계산한다. 따라서 사용자가 요청을 보낸
순간의 개별 패킷을 보여주는 것이 아니라, 최근 흐름을 빠르게 반영하는 근실시간 요약이다.

수집 주기는 신호마다 다르다.

| 신호 | 현재 주기 |
| --- | --- |
| 앱 `/actuator/prometheus` scrape | 5초, timeout 4초 |
| Alloy metric remote write | 1초 batch |
| 앱 health와 DB health probe | 60초 |
| 호스트 지표 | 30초 |
| Grafana dashboard refresh | 5초 |

Tempo 선택 구성을 켜면 trace batch, metrics-generator collection, metrics-generator remote write 주기가
추가된다. 기본 토폴로지의 DB 호출량·DB p95는 이 경로에 의존하지 않는다.

호출량이 없으면 지연 시간은 `0ms`가 아니라 `—`로 표시한다. `—`는 최근 2분 구간에 계산할 표본이
없거나 수집 상태를 신뢰할 수 없다는 뜻이다.

## 상태 기준

| 대상 | 기준 | 해석 |
| --- | --- | --- |
| 백엔드 | `jarihana-health` job의 `/actuator/health` blackbox 결과 | 최근 150초 안의 값이 `1`이면 정상, `0`이면 앱 health 실패, 값이 없거나 오래되면 확인 불가 |
| 앱 지표 수집 | `jarihana-backend` job의 `/actuator/prometheus` scrape 결과 | 최근 30초 안의 값이 `1`이면 Prometheus 지표 수집 정상 |
| DB | `jarihana-postgres` job의 `pg_up`과 같은 scrape의 `up` 값 | 최근 150초 안의 `pg_up`이 `1`이고 같은 PostgreSQL exporter scrape가 살아 있으면 정상, `pg_up`이 `0`이면 DB 직접 점검 실패, 값이 없거나 scrape가 실패하면 확인 불가 |
| 앱 DB 점검 | `jarihana-database` job의 `/actuator/health/database` blackbox 결과와 앱 liveness 상태 | 앱 liveness가 정상이고 최근 150초 안의 값이 `1`이면 정상, `0`이면 앱에서 본 DB 연결 검사 실패, 앱 liveness가 실패하거나 값이 없거나 오래되면 확인 불가 |
| 자원 | `jarihana-host`의 CPU·메모리·디스크 사용률 | 80% 이상은 주의, 90% 이상은 긴급 기준 |
| 관측 저장소 | `prometheus`, `loki`, `grafana` job의 `up` 값 | 최근 90초 안의 값이 `1`이면 수집·조회 대상이 살아 있음. Tempo는 선택 구성에서만 포함 |

DB 상태와 DB 노드 색은 PostgreSQL exporter가 직접 수집한 `pg_up`을 따른다. 빨간색은 exporter가
PostgreSQL 직접 점검 실패를 보고했다는 뜻이고, 회색은 같은 PostgreSQL exporter scrape가 실패했거나
최근 값이 없어 DB 상태를 단정할 수 없다는 뜻이다.

앱 DB 점검과 DB 앞의 공유 연결선은 앱이 `/actuator/health/database`에서 확인한 연결 상태를 따른다.
검사가 실패하면 연결선은 빨간색으로 바뀌고 흐름이 멈춘다. 이때 직접 접속 검사가 정상이면 DB
아이콘은 정상으로 유지된다. 앱 관리 경로의 `404`도 검사 실패에 해당하므로 빨간 선만으로 DB
프로세스가 중단됐다고 단정하지 않는다.

백엔드만 중단되면 앱 지표 수집 실패로 흐름이 멈추고, liveness 실패가 수집되면 연결선은 회색
`확인 불가`가 된다. Alloy의 DB 직접 검사는 계속되므로 DB 아이콘은 정상일 수 있다. 반대로 모니터링
계정의 접속이나 exporter 수집만 실패하면 DB 아이콘 상태가 바뀌지만, 앱 연결 검사와 지표 수집이
정상이고 호출량이 있으면 연결선은 계속 움직인다. 앱 EC2 전체가 중단되면 같은 EC2의 Alloy도
멈추므로 DB 직접 검사도 갱신되지 않으며, 기존 값의 유효기간이 지나면 `확인 불가`가 된다.

`/actuator/health/database`는 dev·prod Spring 설정의 `database` health group에 `db` contributor만
포함해 만든 앱 측 연결 검사다. Alloy는 앱 관리 주소를 사용해 `/actuator/health`와
`/actuator/health/database`를 확인한다.

## 흐름과 지연 시간

사용자에서 백엔드로 가는 선은 Micrometer HTTP 지표를 사용한다. 요청률은
`http_server_requests_seconds_count`의 최근 2분 평균 증가율이며 `/actuator.*` 요청은 제외한다.
따라서 health check나 Prometheus scrape가 사용자 요청처럼 보이지 않는다.

HTTP p95와 p99는 `http_server_requests_seconds_bucket` histogram으로 계산한다. Spring dev·prod
설정은 `http.server.requests` histogram을 1ms부터 10s까지 노출한다. 값은 Prometheus
`histogram_quantile` 추정치이므로 실제 요청 하나의 정확한 지연 시간이 아니라 bucket 분포로 계산한
최근 2분 분위수다.

DB 호출량과 DB p95 표시는 백엔드 Actuator가 노출한 JDBC 메트릭을 사용한다.
요청률은 `jdbc_query_seconds_count{job="jarihana-backend",environment="$environment"}`의 최근
2분 평균 증가율이다. DB p95는 `jdbc_query_seconds_bucket` histogram으로 계산한다.
이 값은 앱에서 실행한 JDBC 호출의 흐름과 지연 시간이지, DB 내부 CPU·락·쿼리 플랜 상태를 뜻하지
않는다. SQL 문장 개수나 특정 커넥션 하나의 처리량도 아니다. 기준은 JDBC 실행이다. 예약 작업이나
health check가 실제 SQL을 실행하면 포함될 수 있지만, 단순 connection validity 확인처럼 SQL을
실행하지 않는 검사는 `jdbc_query_seconds_*`를 만들지 않을 수 있다.

HTTP 요청·응답선의 animation duration은 실제 2분 평균 호출량으로 정한다. 0 또는 확인 불가이면 점 이동을
멈추고, 0.05rps는 약 2.4초, 30rps 이상은 약 0.25초로 보간한다. 보간은 낮은 호출량에서도 움직임을
읽을 수 있도록 `biasPower: 0.4`를 사용한다. 선의 색은 health 상태를 따르고, Flow panel의 기본
일시정지 버튼으로 애니메이션을 멈출 수 있다.

DB 앞의 공유 trunk도 최근 2분 DB 호출량으로 animation duration을 정한다. `db_flow`는 앱 지표
수집과 앱 DB 연결 검사(`db_connection_health`)가 모두 정상일 때만 호출량을 전달하며, 그 외에는
`0`으로 멈춘다. 호출량이 0이거나 확인 불가일 때도 멈추고, 0.05rps는 약 2.4초, 30rps 이상은
약 0.25초로 보간한다. 색은 `db_connection_health`를 따라 정상은 초록색, 실패는 빨간색,
확인 불가는 회색이다. DB 직접 검사(`db_health`)는 이 선의 색이나 움직임을 결정하지 않는다.
HikariCP 자리 개수나 대여·반납 모션은 별도의 풀 지표로 정하며 기존 표현을 유지한다.

## DB 연결 풀

API와 PostgreSQL 사이의 `HikariCP` 영역에는 최대 연결 수만큼 작은 원을 표시한다.
채운 원 한 개가 생성된 연결 한 개다. 사용 중인 연결은 초록색, 유휴 연결은 파란색이며,
아직 생성되지 않은 여유 자리는 속이 빈 원으로 구분한다. 예를 들어 최대 10개 중 사용 3개·유휴 5개이면
초록 원 3개·파란 원 5개·빈 원 2개를 보여준다. 원은 수량을 표현하며 개별 JDBC 연결의 ID를 추적하지 않는다.

사용 중인 원은 DB 쪽으로 이동해 머무르고, 반납되어 유휴가 되면 풀 자리로 돌아온다. 이동 시간은
가독성을 위한 3.2초이며 실제 쿼리 실행 시간이 아니다. 현재 `active`와 5초 전 `active`를 비교해
대여·반납 방향을 정한다. 최대값이 바뀌거나 이전 값이 없으면
이동을 재현하지 않고 현재 상태의 위치에 표시한다. 수집 불가나 연결 소멸을 반납으로 표현하지 않는다.

이동은 풀에서 연결을 빌려 쓰는 상태의 표현이다. 연결이 물리적으로 DB로 이동하는 것은 아니며,
`active`에는 트랜잭션 동안 연결을 보유한 상태도 포함된다.

5초 수집 사이에 끝나는 짧은 사용은 `hikaricp_connections_usage_seconds_count`의 현재 값과
5초 전 값의 차이로 확인한다. 두 시점의 `active`가 모두 0이어도 사용 완료 횟수가 늘면 유휴 원이
노란색으로 DB 쪽을 왕복한다. 이미 초록 원의 복귀로 표현한 수량은 왕복 재생에서 제외한다.
완료 횟수가 유휴 원 수보다 많으면 유휴 원 수까지만 재생한다. 상태 점검 등 앱 내부 DB 사용도 포함한다.

빈 자리 테두리는 풀에 세로로 고정되어 있고, 자리마다 DB 앞의 합류점으로 모이는 전용 곡선 간선이 하나씩 있다.
점은 자기 곡선을 따라 합류점까지 이동한 뒤 DB 외곽 앞에서 멈추며, DB 실린더 내부로 들어가지 않는다.
반납되면 같은 곡선을 거슬러 돌아온다. 여러 점은 위아래 자리에서 번갈아 출발하며, 출발 시차는 최대 1.2초다.
유휴 간선은 파란색, 사용 중 간선은 초록색, 미생성 자리는 회색 점선이다.
사용 수가 3개에서 1개로 줄면 초록 점과 간선 하나가 남고 두 점은 각자의 곡선을 따라 복귀한다.

점이나 곡선에 마우스를 올리면 해당 선과 풀 자리의 테두리를 강조하고 상태 설명을 보여준다.
Tab으로 자리를 선택해도 같은 설명이 표시된다. 클릭하거나 Enter를 누르면 현재 환경과 조회 시간을
유지한 채 `앱의 DB 연결 풀 · HikariCP` 상세 그래프로 이동한다. 여기서 사용·유휴·최대·대기 수의
변화를 함께 확인할 수 있다.

설명의 자리 번호는 화면상의 순서다. 예를 들어 `연결 자리 3 · 사용 중`은 집계된 사용 수를 세 번째
자리에 표시했다는 뜻이며, 특정 JDBC 연결이나 그 연결의 SQL을 식별하지 않는다. 사용 중에는
트랜잭션이 연결을 보유한 시간도 포함되므로 SQL이 실행 중이라고 단정할 수 없다.

노란 왕복은 최근 사용 활동을 느리게 재생한 것이며 해당 연결의 현재 점유를 뜻하지 않는다.
실제 개별 연결 ID나 대여·반납 시각은 추적하지 않는다. 현재 사용·유휴 상태는 원래 지표를 유지한다.
카운터가 증가하지 않거나 초기화된 경우, 수집 누락 또는 최대값 변경 시에는 재생하지 않는다.
수집·전송·화면 갱신 시점에 따라 지연되거나 일부 구간이 화면에서 누락될 수 있다.
Flow의 일시정지 버튼과 OS의 동작 줄이기 설정에서는 원을 현재 위치에 바로 표시한다.

계산식 검증은 Flow 1.20.1과 같은 Math.js 13.0.2로 실행한다. 아래 명령은 라이브러리와 화면 검증용
합성 지표를 임시 폴더에만 저장하며, Grafana 데이터나 앱 설정은 바꾸지 않는다.

```bash
curl -fsSL https://cdn.jsdelivr.net/npm/mathjs@13.0.2/lib/browser/math.js -o /tmp/jarihana-pool-mathjs-13.0.2.cjs
node infra/monitoring/grafana/topology/test-pool-nodes.mjs /tmp/jarihana-pool-mathjs-13.0.2.cjs /tmp/jarihana-pool-motion-qa
```

테스트는 대여·유지·반납·유휴, 짧은 사용 재생, 다수 사용, 카운터 초기화, 수집 누락, 최대값 변경,
연결 소멸, 표시 개수 제한을 확인한다.
생성된 `index.html`에서는 같은 SVG와 계산 결과로 이동 방향을 확인할 수 있다.

헬스 쿼리 검증은 Flow panel과 native Canvas의 DB health, 앱 DB 점검, Flow DB 흐름, native 앱 liveness 표현식을
Prometheus `promtool` 합성 시계열로 실행한다. 아래 명령은 Docker의 `prom/prometheus:v3.15.0`
이미지에서 `promtool test rules`를 실행한다.

```bash
node infra/monitoring/grafana/canvas/test-health.mjs
```

최대값이 바뀌면 표시 개수와 배열도 바뀐다. 화면에서는 100개까지 그리고 그보다 많으면 초과 수량을
요약한다. 최대값을 수집하지 못하면 원을 숨기고, 최대만 있고 사용·유휴를 모르면 회색 원으로 표시한다.

풀 아래에는 `HikariCP` 제목과 `최대 N · 대기 N` 한 줄만 둔다. 사용·유휴·최대·대기의 원천 지표는
`hikaricp_connections_active`, `hikaricp_connections_idle`, `hikaricp_connections_max`,
`hikaricp_connections_pending`이다. 사용·유휴는 원의 채움과 이동으로 표현하고, 최대·대기는 짧은 요약으로
보여준다. 이 값은 DB 서버의 전체 연결 수와 다르다.

| 항목 | 의미 |
| --- | --- |
| 사용 | 앱이 현재 사용 중인 연결 수 |
| 유휴 | 연결을 유지한 채 다음 작업을 기다리는 연결 수 |
| 최대 | 앱 풀에 설정된 최대 연결 수 |
| 대기 | 연결을 얻지 못해 기다리는 스레드 수 |

최대는 과거 사용량의 최고 기록이 아니라 `maximumPoolSize` 설정값이다. 같은 환경에 앱 인스턴스나 풀이 여러 개면
연결 수와 최대값을 합산한다.

대기 스레드가 1개 이상이면 풀 상세 그래프에서 병목 여부를 함께 확인한다.

## 운영할 때 주의할 점

토폴로지는 장애 원인을 확정하는 화면이 아니다. 빨간색 노드나 빠르게 움직이는 선이 보이면 운영
대시보드의 health 이력, HTTP 상태 코드, p95·p99, HikariCP 연결 풀과 최근 로그를 함께 확인한다.
Tempo 선택 구성을 켠 환경이라면 같은 시간대 trace도 이어서 본다.

로컬 검증에서는 실제 API 읽기 요청 뒤 HTTP p95가 약 16ms, p99가 약 28ms, DB p95가 약 1.8ms로
조회됐다. Flow 애니메이션은 실제 호출률에 따라 약 1.85초 duration으로 움직이는 것을 확인했다.
이 검증은 로컬 Compose 환경의 동작 확인이며, AWS 배포나 운영 부하를 검증한 결과는 아니다.
