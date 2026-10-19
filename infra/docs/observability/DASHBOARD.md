# 자리하나 Grafana 운영 대시보드

자리하나 운영 대시보드는 Grafana의 `Jarihana` 폴더에 `자리하나 · 운영 현황` 이름으로
등록된다. 저장된 UID는 `jarihana-overview`이며 운영 Grafana에서는 다음 경로로 접근한다.

```text
/d/jarihana-overview
```

로컬 검증 환경에서는 다음 주소를 사용한다.

```text
http://localhost:13000/d/jarihana-overview
```

대시보드의 원본은 Grafana UI가 아니라 저장소의 JSON 파일이다.

| 파일 | 역할 |
| --- | --- |
| [jarihana.yaml](../../monitoring/grafana/provisioning/dashboards/jarihana.yaml) | Grafana dashboard provider 설정 |
| [jarihana-overview.json](../../monitoring/grafana/provisioning/dashboards/json/jarihana-overview.json) | 실제 대시보드 정의 |
| [jarihana-canvas.json](../../monitoring/grafana/provisioning/dashboards/json/jarihana-canvas.json) | [시스템 흐름 Canvas](CANVAS.md) 정의 |
| [jarihana-load-test-local.json](../../monitoring/grafana/provisioning/dashboards/json/jarihana-load-test-local.json) | [로컬 스트레스 테스트](LOAD-TEST-DASHBOARD.md) 정의·수집 전제·SQL 통계 해석 |

Grafana는 시작할 때 provider가 가리키는 JSON 파일을 읽고, 이후 `updateIntervalSeconds: 30`
설정에 따라 30초마다 파일 변경을 확인한다. provider 설정은 Grafana가 읽는 provisioning
구성이므로 변경 후 Grafana 컨테이너를 재생성한다. JSON만 바꾼 경우에는 파일 polling으로
반영될 수 있지만, 운영에서는 적용 여부를 UI나 로그에서 확인한다.

Grafana의 파일 provisioning은 대시보드를 로컬 파일에서 읽어 생성·갱신한다.
이 저장소는 `allowUiUpdates: false`로 설정하므로 UI에서 저장한 변경을 원본으로 삼지 않는다.
패널을 바꾸려면 JSON 파일을 수정한다.
[Grafana dashboard provisioning 문서](https://grafana.com/docs/grafana/latest/administration/provisioning/#dashboards)

## 필터

상단 필터는 두 개다.

| 필터 | 적용 대상 | 설명 |
| --- | --- | --- |
| `환경 · 백엔드/로그` | 앱 health, 앱 지표, 백엔드 로그 | `dev` 또는 `prod` 중 하나를 선택한다. |
| `서버 · 자원` | 호스트 CPU·메모리·디스크·inode, 호스트 Alloy 수집 상태 | `HOST_ID` 기준 서버 필터다. 전체 또는 여러 서버를 선택할 수 있다. |

환경 필터는 앱과 로그에만 적용된다. 호스트 메트릭에는 `environment` 라벨이 없으므로
CPU·메모리·디스크·inode 패널은 서버 필터로 본다. 로컬 Docker 검증 환경에서는 백엔드와
모니터링 컨테이너가 같은 Docker VM 위에서 보이므로 두 서버가 물리적으로 분리된 EC2처럼
측정된다고 해석하지 않는다. 로컬에서는 dev만 실행되므로 prod 선택 시 데이터가 없는 것이
정상일 수 있다.

서버 필터에서 특정 서버만 보려면 `All`을 해제한 뒤 대상 `HOST_ID`를 선택한다. `All`이 함께
선택되어 있으면 전체 서버 조회가 유지된다.

## 읽는 순서

먼저 상단 stat 패널을 본다.

| 패널 | 정상 해석 | 확인할 것 |
| --- | --- | --- |
| `백엔드 헬스` | 최근 150초 내 `/actuator/health` 확인 결과가 `1`이면 `정상` | `0`은 `실패`, 최근 결과가 없으면 `수집 없음`으로 표시한다. 실패하면 앱·DB 연결·네트워크를 확인한다. |
| `앱 지표 수집` | 최근 90초 내 `/actuator/prometheus` 수집 결과가 `1`이면 `정상` | health는 정상인데 지표 수집만 실패하면 metrics 노출이나 Alloy 설정을 확인한다. 최근 결과가 없으면 `수집 없음`이다. |
| `500 오류 · 5분` | 최근 5분 동안 완료된 HTTP 500 로그 수 | `0`은 500 로그가 없다는 뜻이다. |
| `CPU 최대`, `메모리 최대`, `디스크 최대` | 선택한 서버 중 가장 높은 사용률 | 80 이상은 주의, 90 이상은 긴급 기준으로 본다. |

패널 색은 읽기 쉽게 만든 시각적 기준이다. Slack 알림의 실제 발송 상태나 알림 이력을 뜻하지
않는다. 알림 발송 여부는 Grafana Alerting 화면과 Slack 수신 결과로 확인한다.

값이 `수집 없음` 또는 `No data`인 경우는 `0`과 다르다. `0`은 쿼리가 실행되어 값이 0으로 계산된 상태다.
`No data`는 대상 시계열이 없거나, 필터에 맞는 서버·환경이 없거나, 수집 경로가 끊긴 상태일
수 있다. 특히 로컬에서 prod를 선택하면 `No data`가 나올 수 있다.

## 패널 구성

`백엔드 응답과 요청` 영역은 앱 관점의 트래픽을 본다.

| 패널 | 기준 |
| --- | --- |
| `헬스체크 이력` | `probe_success{job="jarihana-health"}` 기준 health 성공 여부 |
| `분당 요청 · HTTP 상태 코드` | Actuator의 `http_server_requests_seconds_count`를 HTTP status별 분당 요청 수로 표시 |
| `평균 응답 시간` | `http_server_requests_seconds_sum / count` 기반 평균 응답 시간 |

이 HTTP 응답 영역은 p95·p99가 아니라 평균 응답 시간을 제공한다. 아래 JDBC 실행 지표와는
측정 대상이 다르다.

`서버 자원 · 서버 필터 적용` 영역은 host exporter 메트릭을 본다.

| 패널 | 기준 |
| --- | --- |
| `CPU 사용률 · 서버별` | idle CPU를 제외한 사용률 |
| `메모리 사용률 · 서버별` | `MemAvailable / MemTotal` 기반 사용률 |
| `디스크 사용률 · 서버 / 마운트` | ext 계열·xfs·btrfs 파일시스템의 사용률 |
| `inode 사용률 · 서버 / 마운트` | 파일 수 고갈 위험 확인 |

CPU·메모리·디스크·inode는 80% 이상에서 주의 색상, 90% 이상에서 긴급 색상으로 표시한다.
Slack 알림은 80% 이상 90% 미만이 5분 지속되면 주의, 90% 이상이면 추가 대기 없이 다음
평가에서 긴급으로 판단한다. 대시보드 색은 현재 값이며 Slack 알림 상태 자체는 아니다.

`백엔드 내부 · 환경 필터 적용` 영역은 JVM, DB 연결 풀과 JDBC 실행을 본다.

| 패널 | 기준 |
| --- | --- |
| `JVM 힙 메모리` | heap 사용량과 committed 크기 |
| `DB 연결 풀` | HikariCP active, pending, max 연결 수 |
| `느린 JDBC 실행 · 100ms 초과 · 5분` | 최근 5분간 완료된 JDBC 실행 중 **100ms 초과** 실행 수의 추정값 |
| `느린 JDBC 비율 · 100ms 초과 · 5분` | 같은 기간의 100ms 초과 실행 수 / 전체 JDBC 실행 수 × 100 (%) |
| `JDBC 실행 횟수 · 최근 5분` | 각 시점 직전 5분간 전체 JDBC 실행 수의 추정값을 시계열로 표시 |

느린 JDBC 실행은 `jdbc_query_seconds_count`의 5분 증가량에서
`jdbc_query_seconds_bucket{le="0.1"}`의 5분 증가량을 뺀다. bucket은 100ms **이하**를 포함하므로
정확히 100ms인 실행은 느린 실행에 포함하지 않는다.
`increase`는 수집 간격을 기준으로 추정하므로 실행 수에 소수가 표시될 수 있으며, counter가
리셋되면 각 시계열에서 증가량을 계산한 뒤 합산한다.

느린 실행 두 패널은 `job="jarihana-backend",environment="$environment"`에만 적용된다. count와 100ms
bucket의 최신 샘플, 같은 인스턴스의 성공한 `up` 샘플이 모두 30초 미만이어야 계산에 참여한다.
중단되거나 수집이 실패한 인스턴스의 과거 값은 합계에서 제외된다. 유효한 시계열이 전혀 없으면
`No data`이며, 정상 수집 중 최근 5분 실행이 없으면 건수와 비율 모두 `0`이다.

측정 대상은 애플리케이션에서 관측한 JDBC 실행 시간이다. SQL 문장별 통계나 DB 서버 내부
실행 시간은 아니며, RDS 자체 CPU·메모리·스토리지 지표도 이 대시보드에 포함하지 않는다.

개별 실행이 빨라도 수천 번 반복되면 API 전체가 느려질 수 있다. 예를 들어 수신자 999명 조건의
모임 생성 요청은 서버 로그상 약 15.6초였고, 같은 1분 구간의 JDBC 실행 수는 약 3천 건이었다.
이는 요청별 SQL 수나 ORM 비용을 직접 측정한 값은 아니다. 실행 횟수 패널과 기존 HTTP 응답
시간을 함께 비교해, 개별 SQL 지연과 과도한 반복 호출을 구분한다.

dev/prod의 `management.metrics.distribution.slo.jdbc.query`에 `100ms,500ms,1s` 경계를
추가한다. 백엔드 배포 후 정확한 `le="0.1"` 버킷을 확인하고 대시보드를 반영해야 한다.
설정만 Git에 추가해도 실행 중인 앱에는 적용되지 않는다. 새 패널은 기존 JDBC 지표를 재사용하며
SQL 원문·회원 ID·요청 ID별 라벨을 추가하지 않는다.

`increase` 기반 패널은 최초 수집값이 이미 양수이면 첫 실행을 놓칠 수 있다. 유휴 `0`은 실제
실행이 전혀 없었다는 증명이 아니며, 장시간 단건은 HTTP 완료 로그로 교차 확인한다. 또한
100ms 미만 쿼리의 반복과 ORM 처리 비용은 느린 쿼리 수만으로 드러나지 않는다.

실제 패널의 PromQL은 다음 명령으로 검증한다. Docker에서 저장소와 같은 Prometheus 버전의
`promtool`을 실행하며, 혼합·빠른 실행·유휴·누락·오래된 샘플·수집 실패·중단된 인스턴스·환경
필터·counter 리셋 시나리오를 검사한다. `EVIDENCE_DIR`를 지정하면 fixture와 실행 로그를 보존한다.

```bash
EVIDENCE_DIR=.omo/evidence/slow-query-dashboard node infra/monitoring/grafana/test-slow-queries.mjs
```

`수집 경로 확인` 영역은 관측 시스템 자체가 데이터를 받고 있는지 본다.

| 패널 | 기준 |
| --- | --- |
| `서버·Alloy 지표 수집` | 선택한 서버의 host scrape와 Alloy scrape 상태 |
| `모니터링 서비스 지표 수집` | Prometheus, Loki, Grafana 자체 scrape 상태 |

이 영역이 깨지면 앱 장애가 아니라 관측 경로 장애일 수 있다. 앱 health, 앱 지표, host scrape,
Alloy scrape를 나눠서 본다.

`최근 로그 · 환경 필터 적용` 영역은 Loki 로그를 본다.

| 패널 | 기준 |
| --- | --- |
| `HTTP 500 요청 로그` | `event_action="http.request.completed"`이고 `http_response_status_code=500`인 완료 로그를 읽기 쉬운 형식으로 표시 |
| `백엔드 로그` | 최근 백엔드 로그의 level·message와 요청 메서드·경로·상태 코드·request_id를 표시 |

각 로그 패널은 화면에서 선택한 시간 범위의 최신 100건까지 조회한다. 로그 행을 펼치면
파싱된 logger·request_id·오류 필드를 확인할 수 있다.

HTTP 500은 정확히 status code 500만 센다. 501·502·503 같은 다른 5xx는 이 패널과 500 알림에
포함하지 않는다. 최근 5분 500 수는 Loki의 완료 로그를 기준으로 계산한다.

## 로그 조회와 Explore

`admin`으로 로그인한 뒤 **Explore → Query history → Starred**를 연다.
`dev`·`prod` 각각 `전체`, `ERROR`, `WARN`, `INFO`, `DEBUG·TRACE`, `WARN·ERROR`의
6개 쿼리, 총 12개를 등록한다. 원하는 항목을 선택하고 시간 범위를 지정한 뒤 **Run query**를 누른다.
쿼리는 최신 원본 로그 100건까지 조회한다.

각 쿼리에 환경이 명시되어 있고 `host_id=~".*"`는 전체 서버를 뜻한다.
특정 서버만 보려면 Explore 쿼리 편집기에서 `host_id="대상 HOST_ID"`로 바꾼다.
Explore는 대시보드의 환경·서버 변수를 사용하지 않는다.

원본은 [queries.json](../../monitoring/grafana/explore/queries.json)이며,
[초기화 스크립트](../../monitoring/grafana/explore/sync-starred-queries.mjs)가 배포 후
Query History API로 등록한다. 재실행 시 관리 식별자로 기존 항목을 찾아 중복 등록을 막는다.
저장소에서 쿼리를 변경하면 새 쿼리를 등록한 뒤 이전 관리 항목의 별표만 해제한다.
사용자가 따로 저장한 즐겨찾기는 유지한다.

Starred는 Grafana DB에 사용자별로 저장된다. 다른 계정에는 공유되지 않으며,
별표를 붙인 쿼리는 일반 기록의 2주 정리 대상에서 제외된다.
공유 Saved queries 라이브러리나 파일 provisioning을 사용하는 기능은 아니다.
[Grafana Query history 문서](https://grafana.com/docs/grafana/latest/visualizations/explore/query-management/)

레벨은 Loki 인덱스 라벨이 아니라 JSON 본문의 `log.level`을 `| json`으로 파싱한
`log_level` 필드로 필터링한다. `전체`는 파싱하지 않아 비 JSON 로그도 보존한다.
레벨 조회 결과가 비어 있으면 해당 시간의 로그가 없거나 앱에서 해당 레벨 출력을 꺼 둔 것일 수 있다.
HTTP 500 완료 로그도 현재 `Events` logger에서는 `INFO`로 기록되므로 `ERROR`와 HTTP 500은
같은 조건이 아니다. HTTP 상태 코드로 확인하려면 운영 현황의 `HTTP 500 요청 로그`를 사용한다.

## 수정과 적용

대시보드를 바꿀 때는 해당 JSON(`jarihana-overview.json` 등)을 수정한다. Grafana UI에서 임시로 확인한
변경이 있다면 JSON으로 옮긴 뒤 파일을 기준으로 검증한다.

JSON 파일만 수정한 경우 Grafana가 30초 polling으로 변경을 반영한다. provider 파일
`jarihana.yaml`을 수정했거나 반영 여부가 불확실하면 모니터링 서버에서 Grafana만 재생성한다.

```bash
cd infra/monitoring
docker compose up -d --no-deps --force-recreate grafana
```

적용 후에는 Grafana에서 `/d/jarihana-overview`를 열어 패널이 뜨는지 확인한다. 설정 파일은
Compose의 `./grafana/provisioning:/etc/grafana/provisioning:ro` 마운트를 통해 컨테이너에
전달된다.
