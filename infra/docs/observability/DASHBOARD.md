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

현재 백엔드 메트릭에는 지연 시간 histogram bucket 기준이 없다. 따라서 p95·p99가 아니라 평균
응답 시간만 제공한다.

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

`백엔드 내부 · 환경 필터 적용` 영역은 JVM과 DB 연결 풀을 본다.

| 패널 | 기준 |
| --- | --- |
| `JVM 힙 메모리` | heap 사용량과 committed 크기 |
| `DB 연결 풀` | HikariCP active, pending, max 연결 수 |

RDS 자체 CPU·메모리·스토리지 지표는 이 대시보드에 포함하지 않는다. 여기의 DB 패널은 앱
프로세스가 보는 HikariCP 연결 풀 상태다.

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

## 수정과 적용

대시보드를 바꿀 때는 `jarihana-overview.json`을 수정한다. Grafana UI에서 임시로 확인한
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
