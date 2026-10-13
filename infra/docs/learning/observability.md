# 모니터링을 이해하기 위한 학습 노트

모니터링 도구를 고르다 보면 이름보다 역할이 먼저 헷갈린다. Alloy도 수집기라고 하고
OpenTelemetry Collector도 수집기라고 한다. Prometheus와 Grafana를 연결하면 메트릭이
보인다는데, 서비스 사이의 선을 그리려면 Tempo와 트레이스까지 필요하다는 설명이 따라온다.

이 노트는 그 관계를 자리하나의 예로 풀어낸다. 도구 선택의 확정 기록은
[인프라 ADR 0001](../adr/0001-local-alloy-observability.md),
실제 연결·전환 설계는 [아키텍처 문서](../observability/ARCHITECTURE.md)에 있다.
여기의 숫자와 요청 처리 시간은 이해를 위한 예시이며 실제 측정값이 아니다.

## 질문에서 출발하기

질문을 다시 찾을 때는 아래 순서로 읽으면 된다.

| 궁금했던 내용 | 연결되는 절 |
| --- | --- |
| 텔레메트리가 무엇이고 로그·메트릭·트레이스는 어떻게 다른가 | [관측 데이터의 세 가지 형태](#관측-데이터의-세-가지-형태) |
| OTel·OTLP·Collector·Alloy는 각각 무엇인가 | [표준과 프로그램을 구분하기](#표준과-프로그램을-구분하기) |
| Spring과 쉽게 연결되는 것은 Prometheus인가, Loki인가 | [Spring에서 데이터가 나오는 과정](#spring에서-데이터가-나오는-과정) |
| 로컬 Alloy가 필수인가, 중앙 Alloy의 이점은 무엇인가 | [수집기를 어디에 둘 것인가](#수집기를-어디에-둘-것인가) |
| 호스트가 꺼질 때 로그 유실과 헬스체크는 무슨 관계인가 | [장애 감지와 데이터 보존](#장애-감지와-데이터-보존) |
| 메모리 제한을 넘으면 무슨 일이 생기는가 | [메모리 제한과 역압력](#메모리-제한과-역압력) |
| RPS·오류율·p95는 어떻게 계산하는가 | [요청 수와 응답시간 읽기](#요청-수와-응답시간-읽기) |
| 샘플링과 span은 무엇인가 | [트레이스와 샘플링](#트레이스와-샘플링) |
| 서비스 그래프·Node Graph·Canvas는 어떻게 다른가 | [관계를 보여주는 화면](#관계를-보여주는-화면) |
| SigNoz·ClickHouse·Datadog·Kiali는 어디에 들어가는가 | [다른 도구의 위치](#다른-도구의-위치) |
| micro가 성능 테스트를 버틸 수 있는가 | [모니터링 서버의 용량 판단](#모니터링-서버의-용량-판단) |
| 스케일 아웃과 무중단 배포 때 무엇이 달라지는가 | [배포와 확장](#배포와-확장) |

## 관측 데이터의 세 가지 형태

**텔레메트리(telemetry)는 시스템의 상태와 동작을 외부에서 관찰하도록 내보내는 데이터다.**
모니터링에서 자주 다루는 세 종류가 메트릭·로그·트레이스다.

자리하나의 그룹 목록 API가 평소보다 느려졌다고 생각해 보자.

| 신호 | 예시 | 답하기 좋은 질문 |
| --- | --- | --- |
| 메트릭 | 최근 5분 p95 800ms, 5xx 비율 2%, JVM heap 사용량 | 얼마나 자주, 얼마나 크게 문제가 생겼는가 |
| 로그 | 특정 요청의 완료 상태·소요 시간·오류 코드 | 그때 애플리케이션이 어떤 사건을 기록했는가 |
| 트레이스 | HTTP 요청 안의 JDBC 호출과 외부 API 호출 시간 | 이 요청의 시간이 어느 작업에서 쓰였는가 |

메트릭은 여러 요청을 숫자로 집계한다. 로그는 사건을 개별 기록으로 남긴다. 트레이스는 같은
요청에 속한 작업의 관계와 시간을 연결한다. 어느 하나가 나머지 둘을 모두 대신하지는 않는다.

보통 메트릭에서 이상을 발견하고 같은 시간대의 로그를 보거나 느린 요청의 트레이스를 연다.
다만 트레이스가 없어도 요청 ID와 구조화된 로그로 조사할 수 있다. 지금 자리하나가
메트릭과 로그부터 시작하는 이유도 여기에 있다.

## 표준과 프로그램을 구분하기

### OTel과 OTLP

OpenTelemetry, 줄여서 OTel은 관측 데이터를 만들고 수집·처리·내보내는 API·SDK·자동 계측·
Collector·규약을 포함하는 프로젝트다. 그 자체가 대시보드나 영구 저장소는 아니다.

OTLP는 OpenTelemetry Protocol이다. 메트릭·로그·트레이스를 주고받는 데이터와 통신 규약이며
gRPC나 HTTP를 사용한다. **OTel은 전체 도구·규약 체계이고 OTLP는 그 안의 전송 규약**이다.
[OpenTelemetry 소개](https://opentelemetry.io/docs/),
[OTLP 명세](https://opentelemetry.io/docs/specs/otlp/)

OTLP와 OLTP는 철자가 비슷하지만 다른 용어다. OLTP는 가입·신청처럼 개별 업무 트랜잭션을
처리하는 데이터베이스 작업 유형을 말한다. 관측 데이터를 전송하는 프로토콜은 OTLP다.

### Collector와 Agent

Collector는 데이터를 받아 가공하고 목적지로 내보내는 프로그램이다.

```text
Receiver → Processor → Exporter
받기        가공하기       내보내기
```

예를 들어 OTLP로 받은 trace에서 필요 없는 속성을 지우고 여러 span을 묶어 Tempo로 보낼 수
있다. 구성에 따라 receiver에서 exporter로 바로 연결할 수도 있다.

OpenTelemetry Collector는 실제로 설치하고 실행하는 프로그램이다. Grafana Alloy도 별도의
프로그램이며 OpenTelemetry Collector 배포판으로 OTel과 Prometheus 계열 구성 요소를 지원한다.
둘을 OTel 지원 여부로 나누면 안 된다.
[OTel Collector](https://opentelemetry.io/docs/collector/),
[Alloy 소개](https://grafana.com/docs/alloy/latest/introduction/)

Agent는 주로 관측 대상 가까이에 배치한 역할을 부르는 말이다. 로컬 Alloy와 중앙 Alloy는
서로 다른 제품이 아니다. 같은 Alloy를 호스트 옆에 두느냐, 여러 호스트의 데이터를 받는 곳에
두느냐에 따라 역할이 달라진다.

OTel Java Agent의 Agent는 또 다르다. JVM에 붙어서 지원하는 라이브러리를 계측하는 프로그램이다.
호스트 옆에서 수집·전달하는 Alloy와 구분해야 한다.

### 저장소와 화면

| 구성 요소 | 주된 역할 | 자동으로 해 주지 않는 일 |
| --- | --- | --- |
| Micrometer | 애플리케이션 메트릭 계측 | 중앙 저장소 운영 |
| OTel Java Agent | 지원하는 Java 라이브러리의 자동 계측 | 모든 업무 메서드의 의미 파악 |
| Alloy | 수집·가공·전송 | 모든 데이터의 영구 보관 |
| Nginx | HTTP 수집 API와 Grafana 화면·WebSocket 전달 | 신호 가공·영속 큐·저장 |
| Prometheus | 시계열 메트릭 수집·저장·조회 | JSON 로그 검색, trace 저장 |
| Loki | 로그 수집 경로의 목적지·저장·조회 | 앱 내부 호출의 span 생성 |
| Tempo | trace 저장·조회, 설정에 따른 trace 기반 메트릭 생성 | 계측 없는 앱의 요청 흐름 생성 |
| Grafana | 여러 데이터 소스의 조회·시각화·설정한 알림 | 저장소에 없는 데이터의 생성 |

Grafana 대시보드에서 로그가 보이는 것은 Grafana가 Loki를 조회하기 때문이다. Alloy에서 로그를
보냈다고 Grafana가 자동으로 저장하는 구조는 아니다.

## Spring에서 데이터가 나오는 과정

### 메트릭은 Micrometer와 Actuator에서 시작한다

Spring Boot에서는 Micrometer가 HTTP·JVM·커넥션 풀 등의 지표를 계측하고 Actuator가 관리용
endpoint를 제공한다. Prometheus registry를 연결하고 endpoint를 노출하면 수집기가 값을 읽을
수 있다. 자리하나에는 이 의존성과 dev/prod 관리 endpoint가 이미 있다.
[현재 설정](../../../backend/src/main/resources/application-prod.yaml),
[의존성](../../../backend/build.gradle)

메트릭을 밖에서 주기적으로 읽는 일을 **scrape**라고 한다. 수집 요청의 방향은 Alloy에서
Spring으로 향하고 응답 데이터는 Spring에서 Alloy로 돌아온다.

```text
Spring의 메모리에 누적된 카운터
       ↑ Alloy가 endpoint에 조회 요청
       ↓ Spring이 현재 값을 응답
Alloy → Prometheus
```

Alloy가 Prometheus 저장소에 보내는 경로는 **remote write**다. 이 설계에서 scrape와 remote
write는 서로 다른 구간이다. Prometheus가 직접 Spring을 scrape하는 구성도 가능하지만
선택한 1번 구조에서는 로컬 수집을 Alloy가 맡는다.

Prometheus 서버가 remote write를 받으려면 수신 기능을 켜야 한다. endpoint만 알고 보내면
자동으로 받아 주는 것이 아니다. 공식 문서는 이 수신 방식을 특정 저용량 사례로 제한해
설명하므로 부하가 커지면 배치를 다시 검토한다.
[Prometheus 수신 API](https://prometheus.io/docs/prometheus/latest/querying/api/#remote-write-receiver)

### 로그는 의미 있는 사건을 애플리케이션이 기록한다

Loki가 Spring의 업무 흐름을 알아서 로그로 만들지는 않는다. Spring이 어떤 사건과 필드를
남길지 정하고 수집기가 이를 가져와 저장소로 보낸다.

자리하나는 ECS JSON을 stdout으로 출력한다. ECS는 **Elastic Common Schema**이며 AWS의
컨테이너 실행 서비스 Amazon ECS와 다른 이름이다. 요청 ID·상태 코드·소요 시간·업무 action을
구조화해서 기록한다.
[애플리케이션 로깅 가이드](../../../backend/docs/operations/application-logging.md)

현재 요청 ID는 서버가 생성한 값이며 응답의 `X-Request-Id`와 대응한다. 같은 요청의 여러
로그를 찾는 데 쓴다. 이것만으로 다른 서비스까지 이어지는 분산 trace가 생기는 것은 아니다.

### 트레이스에는 계측이 하나 더 필요하다

현재 기본 구성은 trace를 저장하지 않는다. HTTP와 JDBC의 집계 지표는 Micrometer와 Datasource
Micrometer가 만든 Prometheus metric으로 본다. 요청 하나의 내부 span을 따라가야 할 때만 OTel Java Agent와
Tempo를 선택 구성으로 켠다. 연결과 검증 방법은 [Tempo 가이드](../observability/TRACING.md)를 따른다.

자동 계측이 모든 Controller·Service 메서드마다 span을 만든다고 가정하면 안 된다. 실제 지원
라이브러리와 버전을 확인하고 필요한 업무 구간에만 별도 계측을 넣는다. 이미 있는 계측과
겹쳐 같은 요청을 두 번 기록하는지도 확인한다.
[OTel Java Agent](https://opentelemetry.io/docs/zero-code/java/agent/)

## 수집기를 어디에 둘 것인가

### 네 가지 배치의 차이

| 배치 | 얻는 점 | 맡아야 할 일 |
| --- | --- | --- |
| **① 로컬 Alloy → 저장소** | 로컬 로그·호스트 수집을 묶고 중앙 수집 계층을 생략 | 호스트별 Alloy 배포와 자원·목적지 설정 관리 |
| **② 앱 → 중앙 Alloy → 저장소** | 저장소 주소·인증·가공 정책을 중앙에서 관리 | 앱의 원격 exporter와 중앙 Collector 용량·장애, 별도 호스트 수집 |
| **③ 로컬 Alloy → 중앙 Alloy → 저장소** | 로컬 접근과 중앙 정책을 함께 사용 | 두 계층의 배포·큐·장애·중복 수집 관리 |
| **④ 앱 → 저장소** | 중간 Collector를 생략 | 앱 가까이에서 신호별 목적지·인증·재시도를 관리 |

중앙 Alloy는 다른 EC2의 로컬 파일을 저절로 읽을 수 없다. 파일이 있는 서버의 프로그램이
읽어서 보내거나, 앱이 처음부터 OTLP로 내보내는 경로가 필요하다. 호스트 지표도
node_exporter 같은 별도 호스트 수집기로 수집할 수 있다.

따라서 로컬 Alloy는 필수가 아니다. **로컬 로그·호스트 메트릭·앱 메트릭을 하나의 수집기에서
다루겠다는 선택**이다. 로그는 Fluent Bit이나 Vector, 호스트는 node_exporter로 나누는 방식도
가능하다. 도구가 적다고 설정과 장애 처리가 자동으로 쉬워지는 것도 아니다.

### 책임 분리는 중앙 방식에도 있다

앱이 Loki 주소를 모르고 Collector 주소만 알아도 된다는 점은 로컬·중앙에 공통인 이점이다.
차이는 로컬 파일과 호스트에 누가 접근하는지, 원격 네트워크 장애를 어느 구간에서 처리하는지,
설정을 몇 곳에 배포하는지에 있다.

중앙 방식도 앱의 exporter가 메모리·CPU·네트워크와 큐를 사용한다. 로컬 Alloy 프로세스가
없다는 것을 애플리케이션의 관측 비용이 0이라는 뜻으로 읽으면 안 된다.

수집 책임을 나눠도 데이터 생성 책임은 남는다. 특정 신청이 왜 거절됐는지, 업무상 중요한
상태가 무엇인지는 애플리케이션만 안다. 수집기가 JSON을 가공한다고 그 업무 의미까지 자동으로
알아내지는 못한다.

### 전송 프로토콜도 별도로 구분한다

선택한 초기 구조에서 메트릭은 Prometheus scrape·remote write, 로그는 Docker API·Loki push를
사용한다. 앱 Alloy는 Nginx `8080`의 `/prometheus/api/v1/write`, `/loki/api/v1/push`로 기본 두 신호를 보낸다.
Nginx는 `/prometheus` 접두사를 제거해 저장소의 `/api/v1/write`로 전달하고 Loki 경로는 그대로 유지한다.
trace 선택 구성을 켤 때만 Agent → Alloy와 Alloy → Nginx → Tempo 구간에 OTLP HTTP를 사용한다.
이때 `TEMPO_OTLP_ENDPOINT`는 `http://<monitoring-private-ip>:8080/tempo`이며
`otelcol.exporter.otlphttp`가 `/v1/traces`를 추가한다. 전체 그림의 화살표를 모두 OTLP로 적으면 실제 연결이 틀어진다.

Nginx는 HTTP 요청을 정해진 저장소로 전달하는 진입점이다. `80`은 Grafana 루트 경로·WebSocket,
`8080`은 정확히 일치하는 기본 두 POST 수집 경로만 제공한다. Tempo 선택 구성에서는 trace POST 경로가 하나 더 생긴다.
신호를 가공하거나 영속 큐에 보관하는
중앙 Collector와는 역할이 다르다. Nginx 장애 중에는 앱 Alloy가 재시도하며 보관 한도에 따라 유실될 수 있다.

중앙 Collector를 추가할 때도 각 프로토콜을 받을 receiver와 필요한 변환을 준비해야 한다.
Alloy가 여러 규격을 지원한다는 사실이 아무 endpoint끼리 연결해도 된다는 뜻은 아니다.

## 장애 감지와 데이터 보존

“애플리케이션 서버에 Alloy를 두면 서버가 내려갈 때 어떻게 되는가”에는 두 문제가 들어 있다.

**장애 감지**는 서버가 멈췄다는 사실을 알아내는 일이다. 외부 HTTP 확인, AWS 상태 검사,
데이터가 일정 시간 들어오지 않는지 확인하는 방식이 여기에 해당한다.

**데이터 보존**은 서버가 멈추기 직전에 만든 로그나 span을 나중에도 읽을 수 있는지의 문제다.
헬스체크를 늘려도 이미 사라진 데이터를 복원하지는 못한다.

```text
로그 생성 → 로컬 기록 → Alloy 읽기 → 전송 대기 → Loki 수신
               A             B                     C

A: 로그 원본이 디스크에 남아 있는가
B: 읽은 데이터가 메모리에만 있는가, 전송용 디스크 큐에도 있는가
C: 저장소가 수신한 뒤 영속화·복구를 어떻게 보장하는가
```

앱 프로세스만 재시작되는 상황, Alloy 프로세스가 죽는 상황, EC2가 꺼지는 상황,
디스크까지 소실되는 상황은 서로 다르다. 다른 서버의 Loki에 이미 도착한 로그는 App EC2의
중단과 분리되지만 로컬 메모리에만 있던 데이터는 잃을 수 있다.

### 버퍼·큐·재시도·WAL·positions

| 용어 | 의미 | 한계 |
| --- | --- | --- |
| 버퍼·큐 | 처리나 전송을 기다리는 데이터를 잠시 담는 공간 | 용량과 보관 시간에 한계가 있다 |
| batch | 여러 데이터를 묶어 전송하는 처리 | 묶어 기다리는 동안 메모리·지연 비용이 생긴다 |
| retry | 실패한 전송을 다시 시도 | 무한 재시도나 무손실을 뜻하지 않는다 |
| WAL | 복구에 쓸 데이터를 디스크에 먼저 남기는 기록 | 디스크 소실·보존 한도·구현 조건까지 해결하지는 않는다 |
| positions | 로그 원본을 어디까지 읽었는지 저장한 위치 | 로그 본문 백업이나 최종 저장소의 수신 확인이 아니다 |

파일을 읽었다는 위치가 저장됐어도 전송 중이던 batch가 메모리에서 사라질 수 있다.
재시도 과정에서 중복이 생길 수도 있다. 로컬 파일·positions·전송 큐가 각각 어떤 시점에
갱신되는지 확인해야 한다.
[Alloy 파일 수집](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.file/)

현재 공식 문서에서 Alloy의 메트릭 remote write는 WAL을 사용하지만 로그 `loki.write`의
WAL·queue 기능은 실험 기능이다. 로그와 메트릭에 같은 내구성을 가정하지 않는다.
[메트릭 전송](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/),
[로그 전송](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/)

`up=0`과 데이터 없음도 다르다. `up=0`은 수집기가 대상을 읽으려다 실패했다는 관찰이다.
수집기 자체가 꺼졌으면 그 관찰조차 새로 오지 않을 수 있다. 그래프의 마지막 값이 정상이어도
오래된 값이면 현재 건강 상태의 근거가 되지 않는다.

## 메모리 제한과 역압력

Docker나 systemd의 메모리 상한은 자원 사용을 제한하는 장치다. Alloy가 한도를 넘으면 OOM으로
종료될 수 있고 다시 시작되더라도 메모리에만 있던 데이터를 복구한다고 보장할 수 없다.

**역압력(backpressure)은 받는 쪽이 처리하지 못할 때 보내는 쪽에 속도를 늦추거나 재시도하도록
신호를 주는 방식**이다. 큐가 차거나 데이터 수신이 거절되면 upstream이 다시 시도할 수 있지만
그쪽의 큐·재시도 한도까지 넘으면 데이터가 버려질 수 있다.

OTel의 `memory_limiter`는 자신을 통과하는 데이터 처리를 메모리 사용량에 따라 제한한다.
Alloy 전체의 만능 메모리 제한기가 아니다. 초기의 `prometheus.*`와 `loki.*` 경로가 이
processor를 통과하지 않으면 해당 큐를 대신 제어하지 않는다.
[Alloy memory limiter](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.processor.memory_limiter/)

관측 데이터의 완전 보존보다 서비스 응답을 우선하도록 상한을 둘 수 있다. 대신 버린 데이터,
재시도, 전송 지연을 따로 보아야 한다. 관측 경로가 포화됐는데 오류 그래프가 조용하다는 이유로
서비스가 정상이라고 결론 내리면 안 된다.

## 요청 수와 응답시간 읽기

### Counter·Gauge·Histogram

Counter는 요청 수처럼 누적해서 증가하는 값이다. 프로세스 재시작 때 초기화될 수 있다.
Gauge는 현재 메모리 사용량처럼 오르내리는 값이다. Histogram은 관찰한 값의 분포를 구간별로
집계한다.

예를 들어 10초 동안 요청 카운터가 1,000에서 1,200으로 증가했다면 단순 계산의 요청량은
초당 20건이다. PromQL의 `rate`는 시간 구간의 샘플을 이용해 초당 증가율을 추정하고 카운터
초기화를 처리한다. 요청 200개의 원문을 전송해야 이 계산을 할 수 있는 것은 아니다.

### RPS와 오류율

RPS는 requests per second, 초당 요청 수다. 다음은 **전환 후 시계열과 라벨을 확인하고 적용할
PromQL 학습 예시**다. 현재 운영 Prometheus에서 실행한 결과가 아니다. 동일한 prod 범위에서
관리 endpoint를 제외한다.

```promql
sum(
  rate(http_server_requests_seconds_count{
    application="jarihana",
    environment="prod",
    uri!~"(/api)?/actuator(/.*)?"
  }[5m])
)
```

`[5m]`는 최근 5분을 보고 증가율을 계산한다는 뜻이다. 지표를 5분마다 수집한다는 뜻은 아니다.
수집 주기와 계산 구간은 별개다.

5xx 비율은 같은 범위의 전체 요청 증가율을 분모로 둔다.

```promql
100 *
sum(rate(http_server_requests_seconds_count{
  application="jarihana", environment="prod",
  uri!~"(/api)?/actuator(/.*)?", status=~"5.."
}[5m]))
/
sum(rate(http_server_requests_seconds_count{
  application="jarihana", environment="prod",
  uri!~"(/api)?/actuator(/.*)?"
}[5m]))
```

이 식에는 운영 화면에서 처리할 조건이 남는다. 아직 5xx 시계열이 한 번도 생기지 않았다면
분자가 빈 결과일 수 있고 트래픽이 없으면 분모가 0이 된다. 수집이 멈춰도 결과가 비거나 오래된
값만 남을 수 있다. 다음 세 상태를 구분해야 한다.

- **정상 수집 + 요청 있음 + 오류 없음**: 0%로 표시할 수 있다.
- **정상 수집 + 요청 없음**: 무트래픽으로 표시한다.
- **수집 실패 또는 데이터 없음**: 알 수 없는 상태 또는 수집 장애로 표시한다.

모든 빈 값을 일괄 0으로 바꾸면 수집 장애도 정상 오류율처럼 보인다. 알림 규칙에는
`up`, 수집 시각·결측 확인과 최소 요청량 조건을 함께 설계한다. HTTP 4xx는 요청 거절·검증
실패 등 별도 관심사이므로 5xx와 나눠 본다.

### 평균과 p95

평균은 시간 합계를 요청 수로 나눈 값이다. 대부분 빠르지만 일부가 매우 느릴 때 평균만 보면
불편을 놓치기 쉽다. p95는 정렬된 응답시간 분포에서 약 95%의 요청이 그 이하에 있는 경계다.
가장 느린 요청의 시간이거나 평균의 95%라는 뜻이 아니다.

Micrometer timer의 `count`와 `sum`만으로는 p95를 복원할 수 없다.
Prometheus에서 여러 인스턴스의 p95를 함께 구하려면 histogram bucket을 모아 계산하는 방법을
사용한다. 인스턴스별 p95의 평균은 전체 p95가 아니다.
[Micrometer histogram과 percentile](https://docs.micrometer.io/micrometer/reference/concepts/histogram-quantiles.html)

classic histogram을 노출한 뒤의 예시는 다음과 같다.

```promql
1000 * histogram_quantile(
  0.95,
  sum by (le) (
    rate(http_server_requests_seconds_bucket{
      application="jarihana",
      environment="prod",
      uri!~"(/api)?/actuator(/.*)?"
    }[5m])
  )
)
```

`le`는 bucket의 상한이다. `histogram_quantile`은 bucket 분포로 분위수를 추정하므로 경계
설계가 정확도에 영향을 준다. 시간 단위가 초인 지표를 밀리초로 표시하려고 1,000을 곱했다.
[Prometheus 함수](https://prometheus.io/docs/prometheus/latest/querying/functions/)

앱에서 HTTP histogram을 켜고 Alloy가 bucket을 전달해야 이 계산이 가능하다.
현재 설정만으로 bucket이 노출된다고 가정하지 말고 앱 endpoint와 저장된 시계열을 대조한다.

### 카디널리티가 왜 중요한가

시계열은 메트릭 이름과 라벨 조합으로 구분한다. 라벨 조합의 수가 많아지는 것을 높은
카디널리티라고 부른다.

```text
좋은 경로 예: uri="/api/groups/{groupId}"
주의할 경로: uri="/api/groups/12345"

request_id, user_id를 메트릭 라벨로 추가
→ 요청·회원마다 새 조합
→ 시계열 수와 메모리·저장 비용 증가
```

메서드·정규화된 경로·상태 코드·환경처럼 범위가 제한된 라벨을 사용한다.
histogram은 bucket별 시계열도 만들므로 태그와 bucket을 함께 계산해야 한다.
Loki의 인덱스 라벨도 값의 종류가 제한된 것부터 사용하고 요청 ID는 JSON에서 검색한다.

메트릭이 모든 계측 요청을 집계하도록 만들 수는 있어도 항상 완전한 기록은 아니다. 프로세스가
scrape 전에 죽거나 수집이 장시간 끊기면 일부 구간을 잃을 수 있다. 모니터링 카운터를 결제나
정산의 원장처럼 취급하지 않는다.

## 트레이스와 샘플링

### Trace와 Span

Trace는 하나의 요청을 따라 연결한 작업 기록의 묶음이고 span은 그 안의 개별 작업 단위다.

```text
Trace: 그룹 목록 요청                         120ms
└─ HTTP server span                           120ms
   ├─ JDBC SELECT span                         35ms
   └─ 외부 HTTP client span                    50ms
```

각 span은 시작·종료 시각, trace ID, span ID, 부모 span ID, 작업명과 속성을 가진다.
HTTP server span 아래에 JDBC client span이 있으면 요청 처리 중 DB를 호출했음을 알 수 있다.
예시의 남은 시간은 앱 처리나 span으로 나누지 않은 구간일 수 있다.

부모 span이 자식 시간을 포함하거나 자식끼리 병렬로 실행될 수 있으므로 모든 span의 duration을
더하면 요청 총시간이 된다고 생각하면 안 된다. trace가 완전하지 않으면 관계도 일부만 보인다.
[OTel 트레이스](https://opentelemetry.io/docs/concepts/signals/traces/)

현재의 `http.request.id`는 로그 상관관계용이다. Agent가 만드는 trace ID·span ID와는 별개이며
로그 필드의 이름과 Grafana에서 이동하는 연결은 별도로 검증해야 한다.

### 샘플링이 줄이는 것과 놓치는 것

트레이스 샘플링은 일부 요청의 trace만 선택해 기록·전송·보관하는 정책이다.
초당 1,000개 요청에서 요청당 평균 5개 span이 생긴다면 전체 계측량은 초당 5,000 span이다.
요청 trace를 일정 확률로 10% 선택한다면 장기 평균으로 약 500 span/s를 기대할 수 있다.
실제 수치는 요청별 span 수와 표본 선택에 따라 달라진다.

| 방식 | 결정 시점 | 비용과 한계 |
| --- | --- | --- |
| Head sampling | 요청 초기에 결정 | 적게 기록하기 쉽지만 뒤에서 발생한 오류를 보고 선택할 수 없다 |
| Tail sampling | 일정 시간 span을 모아 결과를 보고 결정 | 느린 요청·오류를 우선 선택할 수 있지만 모으는 메모리와 시간이 필요하다 |

Head 단계에서 이미 버린 span을 나중의 tail sampler가 되살릴 수는 없다. Tail 정책을
오류 우선으로 설정해도 큐 초과·전송 실패·판단 시간 이후 도착한 span까지 모두 보존한다는 뜻은
아니다. 로컬 tail sampling은 여러 서비스에 걸친 trace가 여러 수집기로 갈라지는 문제도
고려해야 한다.
[OTel Sampling](https://opentelemetry.io/docs/concepts/sampling/),
[Tail sampling 구성](https://grafana.com/docs/opentelemetry/collector/sampling/tail/)

### RPS를 trace로만 계산하지 않는 이유

요청의 10% trace만 저장했는데 남은 span의 개수를 전체 요청 수로 사용하면 실제 요청량보다
작게 나온다. 느린 요청과 오류를 우선 보관했다면 그 표본의 오류율·p95도 전체 분포와 다르다.
확률 기반 보정이나 샘플링 전 메트릭 생성 방식이 있지만 정책과 전제를 알아야 한다.

자리하나에서는 HTTP의 전체 흐름을 Micrometer 메트릭으로 보고 DB 호출량·DB p95는 JDBC 메트릭으로 본다.
trace는 선택 구성에서 개별 요청의 원인을 조사하는 역할로 나눈다. 샘플링을 바꿔도 HTTP·JDBC 메트릭
수집 정책까지 같이 바꾸지 않는다. trace 기반 서비스 그래프의 수치에는 별도의 측정 범위와 표본 조건을 붙인다.

## 관계를 보여주는 화면

원하는 화면에는 사실 서로 다른 데이터가 들어간다.

| 화면의 수치·관계 | 필요한 관측 |
| --- | --- |
| 백엔드 노드의 전체 HTTP RPS·5xx·p95 | HTTP 메트릭 |
| EC2 노드의 CPU·메모리 | 호스트 메트릭 |
| 백엔드 → DB 호출 관계 | 현재 토폴로지에서는 명시한 앱→DB 관계와 health 검사. 선택 구성에서는 client span 관계 |
| 백엔드 → DB 호출 횟수·시간·오류 | JDBC query 메트릭. 선택 구성에서는 trace 기반 메트릭도 보조로 사용 가능 |
| 백엔드 → DB 실제 bytes/s | 해당 연결을 식별할 네트워크 관측 |
| DB CPU·락·서버 내부 상태 | DB 자체 모니터링 경로 |
| 특정 요청의 상세 기록 | 로그와 trace |

백엔드 전체 HTTP p95를 DB 간선의 p95로 붙이면 측정 대상을 바꾼 것이다.
EC2 전체 네트워크 송수신량에도 DB 외의 트래픽이 섞이므로 DB 간선의 전송량으로 사용할 수 없다.

### Tempo를 빼도 지금 대시보드를 유지할 수 있는 이유

이번에는 모니터링 EC2의 메모리가 부족해 Tempo를 기본 실행에서 제외했다.
현재의 노드와 연결선 배치는 Grafana Flow·Canvas 설정에 들어 있고, 화면의 수치와 움직임은 메트릭을 읽어 바뀐다.
따라서 Tempo 없이도 같은 토폴로지를 그릴 수 있다.

다만 기존 DB 호출량·DB p95는 Tempo가 만든 지표에 의존했으므로, 저장소만 끄면 그 두 값은 더 이상 갱신되지 않는다.
대신 앱에서 JDBC 실행 횟수와 시간 분포를 계측해 Actuator → Alloy → Prometheus로 보낸다.
HTTP req/s·p95·p99, CPU·메모리와 HikariCP 풀 상태는 이미 다른 메트릭으로 수집하므로 계속 볼 수 있다.
개별 요청의 HTTP span과 DB span을 따라가는 trace 조회는 기본 구성에서 사용할 수 없다.
[인프라 ADR 0004](../adr/0004-disable-tempo-by-default.md)에 이 결정과 측정 범위의 차이를 기록했다.

### Tempo Service Graph

Tempo는 선택 구성의 trace 저장소이고 서비스 그래프 기능은 span 관계에서 서비스 간 호출 관계와 관련
메트릭을 만든다. metrics-generator와 `service-graphs` processor, Prometheus 호환
전송 목적지, Grafana의 데이터 소스 연결을 구성해야 한다. 설치만으로 모두 켜지는 기능은 아니다.

```text
지원되는 span·속성
  → 서비스 관계와 호출 통계 생성
  → Prometheus에 저장
  → Grafana가 관계를 표시
```

DB 서버에 OTel을 설치하지 않아도 앱의 DB client span 속성으로 DB 노드가 나타날 수 있다.
이는 DB 호출을 관찰했다는 뜻이며 DB 내부 CPU·락까지 수집했다는 증거가 아니다.
서비스별 노드가 보이는 화면도 EC2 인스턴스별 지도를 자동으로 대신하지 않는다.
현재 기본 토폴로지는 Tempo service graph 없이 `jdbc_query_seconds_*`와 HikariCP 지표를 사용한다.
[Tempo 서비스 그래프](https://grafana.com/docs/tempo/latest/metrics-from-traces/service_graphs/),
[활성화 절차](https://grafana.com/docs/tempo/latest/metrics-from-traces/service_graphs/enable-service-graphs/)

### Node Graph와 Canvas

**Node Graph는 노드와 간선 데이터를 그림으로 보여주는 Grafana 패널**이다.
정해진 nodes/edges 형태의 데이터가 필요하다. 관계 데이터에 새 노드가 들어오면 표시할 수 있지만
패널 자체가 서버나 DB 연결을 조사하는 것은 아니다. 일반 PromQL 결과를 연결했다고 필요한
토폴로지가 저절로 완성되지는 않는다.
[Grafana Node Graph](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/node-graph/)

**Canvas는 요소와 연결선을 배치하고 쿼리 값을 연결하는 화면**이다.
서버 박스를 원하는 위치에 두고 CPU나 오류율에 따라 값·색상 등을 바꾸는 데 쓸 수 있다.
값이 동적으로 바뀌는 것과 새 EC2의 도형·배치가 자동으로 생성되는 것은 별개의 요구다.
[Grafana Canvas](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/canvas/)

초기 Prometheus·Loki·Grafana만으로도 고정된 시스템 관계에 지표를 얹는 화면은 설계할 수 있다.
자동 호출 관계와 개별 요청 추적은 추가 계측이 필요하다. bytes/s까지 보려면 eBPF 등의
네트워크 관측을 별도 검토하고 전송량을 호스트·인터페이스·연결 중 어느 단위로 표시할지부터 정한다.

## 다른 도구의 위치

### 수집기의 대안

| 도구 | 검토할 이유 | 비교할 때 주의할 점 |
| --- | --- | --- |
| Alloy | Prometheus·Loki·OTel 구성 요소를 한 프로그램에서 연결 | Grafana Cloud 가입이 필수는 아니다 |
| OTel Collector | OTel 중심의 수집·가공·전송 구성 | 선택한 배포판에 필요한 receiver·exporter가 있는지 확인 |
| Fluent Bit | 로그 전달을 중심으로 시작할 때 | 로그만 지원한다고 단정하지 말고 필요한 신호·플러그인을 확인 |
| Vector | 로그·이벤트 가공과 전송 구성이 중요할 때 | 가공 기능과 운영 자원을 실제 파이프라인으로 비교 |
| node_exporter 등 개별 exporter | 호스트 지표처럼 역할을 좁힐 때 | exporter가 로그 저장소나 trace 수집기를 대신하지는 않는다 |

어느 도구가 항상 더 가볍다는 순위를 정하지 않는다. 입력량, 가공, batch, 큐와 목적지가 다른
상태의 메모리 숫자로 비교하면 선택 근거가 약해진다.
[Fluent Bit 소개](https://docs.fluentbit.io/manual/about/what-is-fluent-bit),
[Vector 소개](https://vector.dev/docs/introduction/)

### SigNoz와 ClickHouse

SigNoz는 메트릭·로그·트레이스와 APM 화면을 함께 제공하는 관측 플랫폼이다. Community 자체
호스팅과 Cloud·Enterprise 상품을 구분해야 한다. 자체 호스팅 소프트웨어를 사용할 수 있다는
것이 EC2·저장소·백업·업데이트 운영까지 비용이 없다는 뜻은 아니다.
[SigNoz 상품 구분](https://signoz.io/pricing/)

ClickHouse는 SigNoz의 관측 데이터를 저장·분석하는 컬럼 기반 데이터베이스다. 컬럼 단위
처리는 많은 레코드에서 일부 필드의 합계·분포를 계산하는 분석 작업에 어울린다. 자리하나의
가입·신청 트랜잭션을 저장하는 PostgreSQL을 무조건 교체해야 한다는 이야기는 아니다.
두 데이터베이스에 맡기는 작업이 다르다.
[SigNoz 아키텍처](https://signoz.io/docs/architecture/),
[ClickHouse 소개](https://clickhouse.com/docs/intro)

### Datadog·Kiali·Netdata

Datadog의 Service Map도 APM 등의 관측 데이터를 바탕으로 서비스 관계를 보여준다.
관찰한 outbound 호출에서 DB나 외부 서비스를 추론할 수 있지만 모든 네트워크 연결을 빠짐없이
발견한 지도라고 해석해서는 안 된다.
[Datadog Service Map](https://docs.datadoghq.com/tracing/services/services_map/)

Kiali는 Istio 서비스 메시의 관측·관리 콘솔이다. 일반 EC2·Docker 구성에 서비스 그래프 하나를
추가하려고 고르면 Kubernetes·Istio 등 전제가 크게 늘어난다. Grafana와 함께 사용할 수 있어도
Grafana의 임의 패널 하나처럼 취급하는 도구는 아니다.
[Kiali 설치 전제](https://kiali.io/docs/installation/installation-guide/prerequisites/)

Netdata도 시스템·네트워크 시각화 후보로 언급할 수 있지만 특정 topology 기능의 제공 범위,
라이선스·클라우드 조건은 도입할 때 확인해야 한다. 화면 예시만으로 무료 자체 호스팅에서
원하는 모든 기능이 된다고 결론 내리지 않는다.
[Netdata 문서](https://learn.netdata.cloud/)

실제 제품 화면, 설명용 그림, 직접 만들고 싶은 화면도 구분한다. 멋진 예시 이미지가 있다는
사실은 그 제품의 기본 기능이 동일한 화면을 제공한다는 증거가 아니다.

## 모니터링 서버의 용량 판단

### 요청 수가 늘 때 신호마다 증가 방식이 다르다

라벨 조합이 고정돼 있다면 요청이 10배 늘어도 scrape마다 가져오는 메트릭 샘플 수가 반드시
10배 늘지는 않는다. 앱 안의 카운터가 더 빨리 증가하고 수집기는 같은 시계열의 새 값을
가져온다. 다만 계측 자체의 처리 비용이나 새로운 라벨 조합은 별도로 영향을 준다.

로그와 trace는 요청마다 여러 기록이 생길 수 있다.

```text
로그 원본량 ≈ RPS × 요청당 로그 줄 수 × 한 줄 평균 바이트
메트릭 수집량 ≈ 활성 시계열 수 ÷ scrape 간격
트레이스 발생량 ≈ RPS × 요청당 평균 span 수
```

예를 들어 1,000 RPS에서 요청당 로그 2줄, 한 줄 500바이트라면 원본 로그가 약
1,000,000바이트/s다. 이 상태가 하루 내내 유지된다는 가정의 원본량은 약 86.4GB다.
압축·인덱스·전송 overhead·보관 정책을 반영한 청구량이나 실제 디스크 사용량은 아니다.

메트릭도 10,000개 시계열을 15초마다 수집하면 평균 약 667 samples/s가 된다.
이는 설명용 계산이며 자리하나의 현재 시계열 수나 수집 주기를 뜻하지 않는다.

### micro를 판단할 때 필요한 증거

`t3.micro`는 2 vCPU·1 GiB이며 burstable CPU를 사용한다.
[EC2 T3 사양](https://aws.amazon.com/ec2/instance-types/t3/)
Prometheus·Loki·Grafana가 모두 실행됐다는 사실만으로 충분한 메모리가 남거나 성능 테스트를
버틴다고 결론 내릴 수 없다.

부하 테스트 중에는 요청 증가로 로그가 늘고 동시에 Grafana에서 넓은 시간의 로그를 조회할
수 있다. 수집 부하와 조회 부하가 겹친 상태를 봐야 한다. Alloy의 전송 실패·재시도·폐기,
Loki 수집 지연, Prometheus 메모리·디스크와 모니터링 호스트의 OOM·CPU credit·swap을 함께
확인한다.

swap은 메모리가 부족할 때 디스크를 이용할 수 있게 하지만 지연과 I/O 부담을 만들 수 있다.
micro 유지의 증거를 대신하지 않는다. 필요하면 로그 정책·보관 기간·쿼리 범위를 조정하거나
인스턴스를 키운다. 앱 처리량과 관측 데이터의 수집 완전성은 따로 보고한다.

## 배포와 확장

### Docker Compose에서 로컬 Alloy를 실행한다는 뜻

자리하나는 Alloy와 모니터링 스택을 모두 Compose로 실행하도록 구성했다. 로컬 Alloy라는 이름에서
로컬은 **관측할 대상과 같은 EC2에 있다**는 뜻이다. 앱 EC2에는 앱과 호스트를 수집하는
Alloy 컨테이너를 둔다. 별도 모니터링 EC2에는 Prometheus·Loki·Grafana와 호스트·자체 메트릭을
수집하는 Alloy 컨테이너를 둔다.

Compose 프로젝트는 컨테이너를 관리하는 묶음이다. dev·prod는 서로 다른 EC2에서 실행하고
모니터링 스택도 별도 EC2에 둔다. dev/prod 앱 Compose 파일에 Alloy 서비스와 `alloy-data`
볼륨을 각각 직접 적고 앱·Alloy를 같은 프로젝트에서 관리한다. DB는 dev·prod 모두 RDS PostgreSQL을 사용한다. include·extends보다
각 앱 파일 하나에서 배포 구성을 읽는 단순함을 택했다. 서비스 선언은 두 번 적지만
수집 규칙은 공통 `monitoring/alloy/config.alloy`를 마운트해 사용한다.
각 EC2에서 Compose를 실행하며 서비스 이름만으로 서버 사이 네트워크가 생기지는 않는다.

backend는 Alloy가 started이면 시작한다. RDS는 Compose 서비스가 아니므로 dev·prod 모두 별도 접속 검증이
필요하다. 그래서
`up -d --no-build backend` 한 번으로 의존 서비스까지 올린다. Alloy started는 저장소 전송까지
성공했다는 뜻이 아니므로 실제 메트릭·로그 조회는 따로 확인한다. 프로젝트 전체 `down`은
Alloy도 중단한다. backend만 갱신하면 변경이 없는 정상 Alloy를 매번 재시작할 필요는 없다.
`depends_on`에 `restart: true`를 추가하지 않는 구성이다.

프로필은 각 앱 Compose에 직접 적는다. `SPRING_PROFILES_ACTIVE`를 dev Compose의
backend·Alloy에는 모두 `dev`, prod Compose에는 모두 `prod`로 고정한다. 셸이나
`--env-file`의 값으로 치환하지 않는다. Alloy는 자기 컨테이너 환경변수를 읽어
`environment` 라벨을 만든다. YAML 앵커는 쓰지 않는다. Docker에는 로그 수집 허용용
`com.jarihana.monitoring.logs=true`만 선택적으로 붙인다.

주소는 접속하는 위치를 기준으로 읽어야 한다. 일반 컨테이너의 `localhost`는 자기 자신이다.
이번 Linux EC2의 Alloy는 host 네트워크를 공유한다. dev·prod 각 Compose는
`APP_METRICS_TARGET`을 `127.0.0.1:8081`로 고정해 Alloy 컨테이너에 전달한다. 셸이나 `.env`에서
입력하지 않는다. 호스트 `8081` 포트는 backend 컨테이너의 관리 포트 `8081`로 연결하며
호스트·Alloy 자체 메트릭도 계속 수집한다.
모니터링 Compose 안의 Grafana는 같은 bridge에 있는 `prometheus:9090`과 `loki:3100`을 읽는다.
Tempo 선택 구성을 켜면 Tempo 데이터 소스도 `tempo:3200`으로 직접 조회한다. 앱 Alloy는 모니터링 서버의 사설 주소와
Nginx `8080`으로 보낸다. 수집용 도메인·DNS·`extra_hosts`는 추가하지 않는다.
앱 배포 workflow는 기존 `MONITORING_BIND_ADDRESS`와 신호별 경로로 목적지 URL을 만든다.
기본 메트릭·로그 수집 주소용 새 변수·시크릿은 필요 없으며 같은 `MONITORING_BIND_ADDRESS`는 Nginx
`80`·`8080` bind에 사용한다. Tempo 선택 구성에서는 `TEMPO_OTLP_ENDPOINT`와 백엔드 OTel 변수도
함께 켠다.
Prometheus `9090`, Loki `3100`, Grafana `3000`은 loopback 관리 포트로 유지한다. Tempo 선택 구성의
조회 포트 `3200`도 loopback으로 둔다.
모니터링 호스트의 Alloy는 `http://127.0.0.1:9090/api/v1/write`로 직접 전송한다.
`8080`의 사설 IPv4·loopback 허용 규칙과 별개로 AWS 보안 그룹·라우팅도 확인해야 한다.
사설 주소에 bind했다는 사실만으로 인터넷 접근이 차단된다고 결론 내리지 않는다.
[Compose 네트워크](https://docs.docker.com/compose/how-tos/networking/)

컨테이너를 새로 만드는 것과 데이터를 지우는 것도 구분한다. WAL과 저장소 데이터를 영속
볼륨에 두면 컨테이너 교체 뒤에도 다시 읽을 수 있다. 볼륨 삭제나 EC2 디스크 소실까지
막아 주지는 않으므로 백업은 별도로 필요하다. `alloy-data`는 각 앱 Compose 파일에 직접 선언하며
해당 앱 프로젝트 소유다. 과거 독립 `jarihana-collector` 볼륨이 있었다면 새
앱 프로젝트에 자동 연결되지 않는다. 실제 이전 배포 여부부터 확인하고 상태 이관을 준비한다.
설정·주소·마운트의 세부 기준은 [아키텍처 문서](../observability/ARCHITECTURE.md#docker-compose-배포-단위)에 있다.

### DB와 앱 메트릭의 경계

dev·prod 배포 DB는 외부 RDS PostgreSQL이다. 로컬 개발·테스트 PostgreSQL은 그대로 사용한다.
EC2의 unix exporter는 앱 호스트를 관측하므로 DB 내부 CPU·디스크·락을 수집하지 않는다.
Hikari 지표도 앱 연결 풀의 상태다. DB 내부 상태와 느린 쿼리를 보려면 별도 DB 관측 경로를
정해야 하며 현재 모니터링 구성에 자동 포함된다고 보지 않는다.

### 서버 증설과 애플리케이션 재배포

새 EC2를 늘릴 때 앱과 Alloy를 함께 준비하는 절차를 자동화한다. 그렇다고 매번 앱을
재배포할 때 Alloy도 같이 재시작할 필요는 없다. 같은 프로젝트에서 backend만 갱신하면
변경이 없는 정상 Alloy와 영속 상태를 유지하고 새 컨테이너를 발견하게 만들 수 있다.
다만 이번 자동 배포는 `up -d --no-build --force-recreate backend alloy`로 두 서비스를
재생성한다. bind mount한 설정 파일의 내용만 바뀌면 일반 `up`이 컨테이너 변경으로 판단하지
않을 수 있어서다. `infra/docs/**`만 바뀌면 앱 자동 배포는 실행되지 않는다. backend 하위 문서 변경은
dev/prod workflow의 `backend/**` path에 포함되며, 수동 실행도 가능하다.
앱 런타임·빌드 변경과 함께 바뀌거나 이후 앱 배포가 실행되면 체크아웃된 Alloy 설정도 적용한다.
설정 버전의 고정이 아니라 자동 실행 조건의 제한이다. 배포 중 Alloy 수집은 잠시 멈춘다.
영속 볼륨 유지와 수집 무중단은 별개의 조건이다.

workflow는 dev runner를 `jarihana-dev`, prod runner를 `jarihana-prod` 라벨로 구분한다. 각각의 EC2에 올바른 라벨을 붙이는 준비가 필요하며
이번 작업에서 외부 runner를 설정하지는 않았다.
배포 후 Alloy `/-/ready`는 수집기 준비 상태를 확인하는 응답이다. Prometheus에 샘플이
들어왔는지, Loki에서 알려진 로그를 찾을 수 있는지는 별도로 검증한다.

Blue/Green처럼 구버전과 신버전이 동시에 뜨면 환경·서비스·인스턴스·버전을 구분해야 한다.
배포마다 바뀌는 컨테이너 ID만으로 수집 대상을 고정하면 새 컨테이너의 로그를 놓칠 수 있다.
반대로 같은 대상을 둘이 수집하면 지표나 로그가 중복될 수 있다.

기존 호스트를 내리기 전에 남은 로그와 전송 backlog를 확인하는 종료 절차도 필요하다.
갑작스러운 장애에서는 이 절차를 실행할 수 없다는 한계가 남는다. 중앙 Collector가 있다고
애플리케이션의 무중단 배포나 모든 데이터 보존이 자동으로 해결되는 것은 아니다.

중앙 계층은 호스트가 많아져 목적지·인증·가공 정책을 자주 바꿀 때 다시 검토한다.
1번 구조에서 시작한 선택은 향후 변경을 금지하는 결정이 아니다.

## 공부한 내용을 직접 확인하는 순서

아래는 이후 실습 계획이다. 이 문서를 작성하며 실행한 실험은 아니다. 로컬 또는 dev에서
진행하고 운영 서버를 멈추거나 부하를 넣는 실험은 별도로 계획한다.

1. **현재 데이터 읽기**: 준비된 dev 호스트에서 `/actuator/prometheus` 응답의 HTTP count·sum,
   JVM·Hikari 지표와 라벨을 찾는다. API를 여러 번 호출한 전후의 카운터를 비교한다.
2. **로그 연결하기**: API 응답의 `X-Request-Id`로 완료 로그를 찾는다. `event.duration`이
   나노초임을 확인하고 1,000,000으로 나눠 밀리초와 비교한다.
3. **전송 경로 따라가기**: 새 구성을 구현한 dev에서 Alloy 입력, remote write·Loki 전송,
   저장소 조회, Grafana 화면을 순서대로 대조한다. 화면만 보고 중간 구간을 통과했다고 추측하지 않는다.
4. **데이터 없음 경험하기**: dev 수집기를 잠깐 중단하고 `up=0`, 새 샘플 없음, 마지막 정상
   값이 남은 상태가 어떻게 다른지 확인한다. 복구 뒤 알림이 해제되는지도 본다.
5. **유실 범위 확인하기**: 테스트용 식별자가 있는 로그를 만든 뒤 목적지를 잠시 중단한다.
   복구 전후 건수·중복·누락을 비교하고 로컬 원본·큐·보관 한도와 연결해 설명한다.
6. **용량 비교하기**: 일정 부하와 로그 조회를 함께 실행해 수집 지연·메모리·재시도를 기록한다.
   앱의 RPS가 유지됐어도 로그가 누락됐는지 따로 확인한다.
7. **후속 trace 실습**: Tempo 선택 구성을 켠 뒤 HTTP와 JDBC span의 부모·자식 관계를 읽는다.
   샘플링을 바꾸어 trace 개수와 Micrometer 요청 수가 어떻게 달라지는지 비교한다.

이 과정을 마치면 도구 이름보다 데이터의 생성 위치, 수집 경로, 저장 위치와 손실 가능 구간을
설명할 수 있어야 한다. 그 설명이 가능해야 대시보드의 빈칸이 무트래픽인지 수집 장애인지,
느린 DB 간선이 실제 DB 호출을 잰 값인지도 판단할 수 있다.

## 스스로 설명해 볼 질문

- Grafana 화면이 정상이어도 수집기가 멈췄을 수 있는 이유는 무엇인가?
- 로컬 Alloy를 선택한 이유 중 중앙 Collector에도 똑같이 적용되는 것은 무엇인가?
- request ID와 trace ID는 무엇을 각각 연결하는가?
- HTTP 전체 p95를 DB 간선의 지연시간으로 쓰면 왜 잘못되는가?
- 로그 파일과 positions가 남아 있어도 전송 중이던 로그를 잃을 수 있는가?
- Tempo를 제외한 초기 구성에서 할 수 있는 일과 추가 계측이 필요한 일은 무엇인가?
- “micro에서 실행됐다”를 “성능 테스트도 버틴다”로 바꾸려면 어떤 측정이 더 필요한가?
