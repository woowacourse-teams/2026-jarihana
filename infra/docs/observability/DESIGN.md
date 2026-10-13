# 서비스 토폴로지 설계

이 문서는 `jarihana-canvas` 대시보드의 토폴로지 표현을 정리한다. 구현 사용법과 운영 해석은
[서비스 토폴로지 문서](CANVAS.md)를 기준으로 한다.

## 선택한 방향

현재 구현은 Grafana Flow panel `1.20.1`로 만든 정적 SVG 기반 동적 토폴로지다. 브라우저, 자리하나
API, PostgreSQL을 명시적인 아이콘으로 보여주고, Prometheus·Tempo 지표로 health, 호출량, 지연 시간,
DB 연결 풀을 갱신한다.

이 방향을 선택한 이유는 세 가지다.

- 현재 관측 스택이 이미 Grafana, Prometheus, Tempo, Loki로 구성되어 있다.
- Flow panel은 SVG의 셀 ID와 YAML 설정을 연결해 값, 색, fill level, flow animation을 지표로 구동할 수 있다.
- 자리하나는 아직 작은 서비스 구성이므로 자동 탐색형 서비스 맵보다 직접 설계한 운영용 그림이 더 빠르게 검증된다.

## 참고한 패턴

| 참고 대상 | 확인한 패턴 | 이 구현에 반영한 점 |
| --- | --- | --- |
| [Elastic APM Service map](https://www.elastic.co/docs/solutions/observability/apm/service-map) | 계측된 서비스와 연결을 실시간에 가깝게 보여주고, 평균 지연 시간·요청량·오류량 같은 상위 지표를 함께 둔다. 연결은 distributed trace에 의존한다. | 토폴로지를 단순 그림이 아니라 health, 요청률, 지연 시간, 오류 흐름을 함께 보는 운영 화면으로 둔다. |
| [Dynatrace Smartscape topology](https://docs.dynatrace.com/docs/analyze-explore-automate/smartscape/smartscape-in-context-views/smartscape-view-topology) | 선택한 노드 주변의 서비스 관계, 의존성, 문제 범위를 보고 drill-down한다. | 노드 클릭을 상세 대시보드 이동으로 연결하고, 토폴로지를 원인 확정 화면이 아니라 조사 진입점으로 둔다. |
| [Grafana Flow panel](https://grafana.com/grafana/plugins/andrewbmchugh-flow-panel/) | SVG와 YAML을 연결해 셀별 색, 값, fill level, flow animation을 지표로 제어한다. Flow animation은 데이터로 속도를 바꿀 수 있고, 애니메이션이 있으면 일시정지 컨트롤이 나타난다. | `map.svg`와 `panel-config.yaml`을 저장소 원본으로 두고, 호출량으로 선의 이동 속도를 조절한다. |

## 비교한 선택지

| 선택지 | 장점 | 제외한 이유 |
| --- | --- | --- |
| Grafana 내장 Canvas | 플러그인이 필요 없고 기존 대시보드에 쉽게 붙는다. | 요청량에 따른 선 애니메이션과 SVG 아이콘 기반 표현을 유지하기 어렵다. |
| ACE.SVG panel | SVG와 JavaScript로 표현 자유도가 높다. | 커스텀 JavaScript가 운영 대시보드 유지보수 부담을 키운다. |
| Business Charts | ECharts 기반으로 복잡한 시각화를 만들 수 있다. | 커스텀 JavaScript가 필요하고, 현재 Grafana 13.2.3과의 호환성을 이 작업에서 확인하지 않았다. |
| Flow panel | 선언형 SVG/YAML로 값, 색, fill, animation을 연결할 수 있다. 로컬 Grafana 13.2.3에서 설치와 렌더링을 확인했다. | 자동 서비스 탐색은 제공하지 않으므로 topology node와 edge를 저장소에서 직접 관리해야 한다. |

## 데이터 의미

토폴로지는 다음 의미만 약속한다.

| 화면 요소 | 데이터 의미 |
| --- | --- |
| 백엔드 노드 색 | 최근 앱 health probe 결과. 지표 수집 상태는 별도 문구로 표시 |
| DB 노드 색 | 앱의 `/actuator/health/database` 결과와 최근 앱 지표 수집 상태 |
| HTTP 선 속도 | `/actuator.*`를 제외한 최근 2분 평균 HTTP 요청률 |
| DB 선 속도 | Tempo service graph가 만든 최근 2분 평균 DB client span 호출률 |
| HTTP p95/p99 | Micrometer HTTP histogram bucket으로 계산한 최근 2분 분위수 추정치 |
| DB p95 | Tempo service graph client histogram bucket으로 계산한 최근 2분 분위수 추정치 |
| DB 연결 풀 | 앱 프로세스의 HikariCP active, idle, max, pending, usage |

DB 노드 색은 DB 머신의 생존 여부가 아니다. 앱에서 DB 연결 검사를 통과했는지 보여준다. DB 연결 풀도
PostgreSQL 서버 내부 상태가 아니라 앱의 JDBC pool 상태다.

## 실시간성 기준

요구사항의 "실시간"은 이벤트 단위 push가 아니라 운영자가 기다리지 않고 변화를 확인할 수 있는
근실시간으로 해석한다. 현재 기준은 다음과 같다.

- Grafana 화면은 5초마다 갱신된다.
- 앱 메트릭 scrape는 5초마다 실행된다.
- 지표와 trace batch는 1초 단위로 전송된다.
- 호출량, p95, p99는 최근 2분 rolling window로 계산한다.
- health probe는 60초, host 지표는 30초 주기다.

따라서 요청 하나하나를 화면에 즉시 그리는 구조는 아니다. 호출량과 지연 시간은 짧은 구간의 집계
추정치이고, 트래픽이 없을 때는 지연 시간을 `0`으로 표시하지 않는다.

## 수용 기준

### 커넥션 이동 표현

기존 Flow 토폴로지의 아이콘, 배치와 색을 유지한다. 파란색 `#76b4ff`는 유휴,
초록색 `#4dd7ba`는 사용 중, 노란색 `#f6ba6a`는 집계된 최근 사용의 재생이다.
사용자가 제공한 세로 포트와 수렴하는 곡선 간선 이미지를 기준으로, 연결 자리마다 전용 간선을 둔다.
고정된 빈 자리(`stroke: #536880`, 최대 반지름 5.2px)를 x=782에 세로로 배치한다.
자리 간격은 최대 12px이고 전체 높이는 108px 이내다. DB 내부의 종점은 x=994,
간격 최대 8px, 전체 높이 72px 이내로 모인다. 두 열 모두 중심은 y=160이다.
점의 반지름은 최대 3.5px이고 큰 풀에서는 간격에 맞춰 점과 테두리를 줄인다.

각 간선은 3차 베지어 곡선 두 개로 이어진다. x=782에서 출발해 x=862를 수평으로 향한 뒤
`(916, 160)`을 거쳐 DB 입구 `(966, 160)`으로 모인다. DB 안에서는 `(978, 160)`과
각 종점의 y좌표에 있는 x=982 제어점을 거쳐 서로 다른 자리에 도착한다.
점은 자기 간선을 따라 DB에 접근하고 잠시 머문 뒤 같은 간선을 거슬러 자기 자리로 복귀한다.
곡선을 transform 키프레임으로 샘플링하며 간선과 이동에 같은 제어점을 사용한다.
유휴 간선은 파란색 불투명도 0.55, 사용 중 간선은 초록색 0.95, 미생성은 회색 점선이다.
간선 두께는 기본 1.5px, 30개를 넘으면 0.7px다. 현재 점유를 간선 색으로 표현하고
최근 사용 재생은 노란 점으로만 표시한다.
DB 호출값은 y=115, DB p95 제목/값은 y=211/235에 두어 경로와 겹치지 않게 한다.
HikariCP 제목과 설명은 y=232/248, 점유 막대는 y=258에 둔다.
왕복은 3.2초이고 36~58% 구간에 DB에서 머문다. 점은 위아래 자리를 번갈아 선택하고
최대 0.24초 간격으로 출발하며 전체 출발 지연은 1.2초 이내로 제한한다.
OS 동작 줄이기와 Flow 일시정지에서는 이동 없이 현재 점유 상태를 표시한다.
숫자는 실제 수집값이며 이동 시간·순서·자리는 개별 연결의 실시간 기록이 아니다.

- 대시보드 UID는 `jarihana-canvas`, 제목은 `자리하나 · 서비스 토폴로지`다.
- Flow panel 플러그인은 Compose에서 `andrewbmchugh-flow-panel@1.20.1`로 고정한다.
- SVG 원본은 `infra/monitoring/grafana/topology/map.svg`, 매핑 원본은
  `infra/monitoring/grafana/topology/panel-config.yaml`이다.
- 브라우저, API, PostgreSQL은 각각 독립 아이콘으로 보인다.
- HTTP p95, HTTP p99, DB p95, DB pool active/max/pending/usage가 한 화면에 보인다.
- HTTP와 DB 선의 animation duration은 최근 2분 평균 호출량에 따라 바뀐다.
- 호출량이 0이거나 확인 불가이면 해당 선은 멈춘다.
- DB 상태 문구는 앱의 DB health probe 의미를 넘어서 DB 머신 장애로 단정하지 않는다.
- 토폴로지에서 상세 분석 화면으로 이동할 수 있다.
- 로컬 Compose에서 플러그인 설치와 렌더링이 확인되어야 한다.

## 검증 범위

확인된 범위는 로컬 Compose다. Grafana `13.2.3`에서 Flow panel `1.20.1` 설치와 렌더링을 확인했고,
실제 API 요청 뒤 HTTP p95·p99, DB p95, 호출량 기반 애니메이션이 표시되는 것을 확인했다.

로컬 PostgreSQL을 잠시 중단했을 때 앱·DB 연결 실패가 빨간색으로 표시되고 두 흐름이 멈추는 것도 확인했다.
데이터가 없는 환경은 회색과 `—`로 표시되며 흐름이 멈춘다. 노드를 클릭하면 환경과 시간 범위를 유지한 상세 대시보드가 새 탭으로 열린다.

아직 AWS 배포, 운영 부하, 장시간 보관 비용은 검증하지 않았다. 이 문서는 현재 저장소 구현과
로컬 검증 결과를 설명하며, 운영 배포 완료 보고가 아니다.
