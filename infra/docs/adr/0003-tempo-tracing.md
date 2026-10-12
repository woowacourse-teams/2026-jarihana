# ADR 0003. Java Agent와 로컬 Alloy로 수집한 트레이스를 Tempo에 저장한다

- 상태: 채택 — 저장소 구성 반영, AWS 미배포
- 날짜: 2026-10-09
- 보완: 2026-10-12 — 앱 Alloy의 원격 전송을 Nginx 경유 OTLP HTTP로 변경한다.
- 범위: 트레이스 생성·수집·저장과 trace 기반 메트릭 생성
- 대체 관계: [인프라 ADR 0001](0001-local-alloy-observability.md)의 트레이스 도입 보류를 해제한다.
- 관련 문서: [트레이스 실행 가이드](../observability/TRACING.md), [아키텍처](../observability/ARCHITECTURE.md)

## 배경

현재 메트릭은 요청량과 평균 응답 시간을 보여주고 로그는 개별 사건을 설명한다. 요청 하나가 느렸을 때
HTTP 처리와 DB 호출 중 어디에서 시간이 쓰였는지 확인하려면 span의 부모·자식 관계와 소요 시간이 필요하다.
자동 서비스 그래프와 인프라 지도는 나중에 결정하고, 먼저 실제 요청의 관측 데이터를 확보한다.

## 결정

Spring 이미지에 OpenTelemetry Java Agent `2.32.0`을 버전·체크섬을 고정해 넣고 dev·prod Compose에서
활성화한다. 앱은 기존 OTLP HTTP `4318`로 같은 EC2의 Alloy에 보내며 Alloy는 OTLP HTTP로
별도 모니터링 EC2의 Nginx `8080`을 거쳐 Tempo HTTP receiver `4318`에 전달한다.
기존 `TEMPO_OTLP_ENDPOINT` 이름을 유지하되 값은 `http://<monitoring-private-ip>:8080/tempo`로 바꾼다.
`otelcol.exporter.otlphttp`가 `/v1/traces`를 추가하고 Nginx는 정확히 일치하는 `POST /tempo/v1/traces`에서
`/tempo`를 제거해 Tempo의 `/v1/traces`로 전달한다. 수집 주소는 기존 `MONITORING_BIND_ADDRESS`로 만들며
수집용 도메인·DNS·`extra_hosts`나 새 변수·시크릿은 추가하지 않는다.
기존 Micrometer와 Docker 로그 전송을 유지하기 위해 Agent는 트레이스만 내보낸다.

OAuth callback의 인증 코드와 state가 URL 속성에 남지 않도록 Alloy에서 query·fragment를 제거한다.
업무 경로와 호출 시간은 유지하고 인증 값은 저장하지 않는다.

Tempo `2.10.8`을 모니터링 Compose에 추가한다. 기존 스택처럼 단일 EC2에서 운영할 수 있도록
Kafka 없는 단일 프로세스와 로컬 저장소를 선택했다. `tempo-data`에 WAL·블록을 저장하고 사용자 요청에 따라 7일을 보관한다.
metrics-generator는 span-metrics·service-graphs를 생성해 기존 Prometheus로 보낸다. 환경 dimension으로
dev·prod를 구분한다. Grafana에는 Tempo 데이터 소스와 내장 Canvas 화면을 파일 provisioning으로
등록한다. 별도 플러그인·feature toggle은 추가하지 않는다.

처음에는 부모 없는 요청을 전부 기록하고 부모가 있다면 그 샘플링 결정을 따른다. 수집량을 확인하기 전에
낮은 비율로 샘플링해 검증 요청이 사라지는 상황을 피하려는 선택이다. 실제 수용량을 보장하는 결정은 아니다.

## 검토한 대안

| 대안 | 이번에 선택하지 않은 이유 |
| --- | --- |
| Tempo만 실행 | 계측·전송이 없으면 실제 요청의 trace가 생기지 않는다 |
| 코드에 SDK와 수동 span부터 추가 | HTTP·JDBC 자동 계측으로 먼저 관측하고 업무 구간은 필요할 때 추가한다 |
| 앱에서 Tempo로 직접 전송 | 목적지와 전송 제어를 기존 로컬 Alloy에서 함께 관리한다 |
| 중앙 수집기 추가 | 현재 두 앱 EC2의 전송을 위해 수집 계층을 하나 더 운영할 필요는 없다 |
| Kafka·분산 저장소를 포함한 확장 구성 | 초기 수집·조회 검증에 필요한 범위를 넘으므로 부하와 복구 요구가 생기면 재검토한다 |

## 결과와 재검토 조건

Agent의 CPU·메모리, Tempo 저장 공간, metrics-generator의 시계열 비용이 추가된다. 모니터링 EC2는 여전히
단일 장애 지점이며 named volume은 백업이 아니다. Alloy의 OTLP 큐도 메모리에 있으므로 무손실을 보장하지 않는다.
저장량·지연·유실을 측정해 샘플링, 보관 기간, 호스트 크기, 객체 저장소 전환을 결정한다.

Nginx `8080`은 RFC1918 사설 IPv4와 loopback만 허용하고 AWS 보안 그룹·라우팅에서도 앱 EC2의
사설 접근만 허용한다. 사설 IP bind만으로 인터넷 차단을 보장하지 않는다. Tempo `4317`은 호스트에
publish하지 않으며 `3200` 조회 포트는 loopback으로 유지한다. Nginx 장애 시 Alloy가 재시도하므로
모니터링 스택을 먼저 배포하고 앱 Alloy를 갱신한다. DB client span은 앱에서 본 호출을 설명하며 RDS 내부 상태나
실제 네트워크 bytes/s를 대신하지 않는다. HTTP·JDBC가 같은 trace에 연결되고 재기동 후에도 조회되는지를
실제 요청으로 확인한다. AWS 보안 그룹·RDS TLS·운영 부하 검증은 로컬 테스트와 별도로 수행한다.
