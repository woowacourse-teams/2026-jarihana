# 현재 운영 EC2의 CloudWatch 수집

기존 EC2의 Spring Boot와 PostgreSQL 컨테이너를 유지하고 호스트에 CloudWatch Agent를
설치한다. 작업 브랜치는 `feat/cloudwatch-observability-develop` 하나를 사용한다.

```text
Spring Boot :8081 → 호스트 127.0.0.1:8081 → CloudWatch Agent
                                          ├─ EMF 로그 → Jarihana (environment=prod)
                                          └─ 호스트 메모리·디스크 → Jarihana (InstanceId)
EC2 기본 모니터링 → AWS/EC2 (CPUUtilization·StatusCheckFailed 계열, InstanceId)
```

애플리케이션과 호스트 커스텀 지표는 `Jarihana` 네임스페이스 하나에 모은다. 애플리케이션은
environment 차원으로 prod/dev를 구분하고, EC2 자원은 InstanceId별 공통 지표로 한 번만
수집한다. 기존 `Jarihana/Application`, `Jarihana/Host`, `Jarihana/prod` 데이터는 옮겨지지
않고 설정 적용 이후 데이터부터 새 네임스페이스로 전송된다.

EC2 CPU는 기본 `AWS/EC2/CPUUtilization`을 조회하며 Agent의 `cpu_usage_active`는
수집하지 않는다. 기본 모니터링의 5분 CPU와 무료 1분 상태 검사 지표를 그대로 사용하며,
유료 상세 모니터링을 활성화하거나 기본 지표를 커스텀 네임스페이스로 재전송하지 않는다.

현재 활성 수집 대상은 `127.0.0.1:8081` 운영 컨테이너 하나다. 대상 labels에 environment=prod를
지정하고 honor_labels=false를 사용하므로, 아직 environment=current인 기존 배포판도
CloudWatch에는 prod로 전달된다. 원래 값은 exported_environment에 남을 수 있지만
CloudWatch 차원으로 사용하지 않는다. 백엔드 prod 프로필도 environment=prod로 맞췄으며
다음 백엔드 배포부터 원본 메트릭에 반영된다.

## 같은 EC2에 dev 컨테이너를 추가할 때

dev 컨테이너의 관리 포트는 호스트 `127.0.0.1:8082` 등 운영과 다른 포트로 연결한다.
컨테이너 내부 관리 포트는 같은 8081을 사용해도 된다. API·DB 연결과 별도로 관리 포트를
localhost에만 공개하고, dev 애플리케이션의 environment 태그도 dev로 설정한다.
실제 기동 후 기존 job의 static_configs에 두 번째 대상 그룹을 추가한다.

```yaml
static_configs:
  - targets: [127.0.0.1:8081]
    labels:
      environment: prod
  - targets: [127.0.0.1:8082]
    labels:
      environment: dev
```

위 예시의 dev 대상은 아직 활성 설정에 넣지 않았다. Agent 선언은 prod/dev 모두 허용하며
모든 애플리케이션 지표의 environment 차원을 유지한다. 대시보드와 경보도 환경별로
선택한다. 전체 응답 시간·heap 사용량을 합산할 때도 prod와 dev를 섞지 않는다.
EC2 CPU·메모리·디스크는 컨테이너별 값이 아니므로 양쪽 대시보드에서 같은 지표를 참조한다.
같은 종류의 dev 애플리케이션 지표가 추가되면 별도 시리즈로 과금되며, EC2 공통 지표는
중복 전송하지 않는다. 현재 verify.sh는 prod 환경과 EC2 공통 지표만 확인한다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `prometheus.yaml` | 60초마다 로컬 메트릭을 읽고 필요한 시리즈만 수집 |
| `agent.json` | 전송할 메트릭, 차원, 네임스페이스 설정 |
| `inspect.sh` | OS, sudo, 인스턴스 역할, 메트릭 종류 확인 |
| `prepare-aws.sh` | 전용 로그 그룹 생성 및 7일 보존 설정 |
| `install.sh` | 서명을 검증한 Ubuntu ARM64 패키지 설치와 Agent 시작 |
| `verify.sh`, `verify.py` | 실제 CloudWatch 로그 및 메트릭 데이터 수신 확인 |
| `validate.py` | Agent JSON의 지표 선택 및 차원 제한 확인 |
| `dashboard-prod.json` | prod 전용 앱 지표와 EC2 공통 자원의 대시보드 정의 |
| `create-dashboard.sh` | 기본은 생성만 수행하고, 명시적 `--update`에서는 기존 JSON 백업 후 갱신 |

`backend-build.yml`의 수동 실행에서 `operation`을 선택한다. 기본값 `backend-deploy`는
기존 배포이고, `cloudwatch-*` 작업에서는 백엔드 배포 job을 건너뛴다.

- `cloudwatch-inspect`: 환경 확인만 수행한다.
- `cloudwatch-prepare`: 설정 검사, 로그 그룹 생성, 보존 기간 설정을 수행한다.
- `cloudwatch-install`: prepare 후 sudo 설치와 실제 전송 확인까지 수행한다.
- `cloudwatch-verify`: 이미 설치한 Agent의 실제 전송을 확인한다.

inspect 외 작업에는 확인한 EC2 ID를 `expected_instance_id`에 입력한다. 설치 과정에서
인스턴스 ID를 IMDSv2로 비교하고, 다른 Agent 설정이 있으면 덮어쓰지 않고 중단한다.

## 지표와 비용 관리

| 대상 | 지표 | CloudWatch 차원과 읽는 방법 |
| --- | --- | --- |
| HTTP | 상태 범주별 요청 수와 응답 시간 합계 | application/environment/status_class별 `Sum` |
| JVM 메모리 | heap·nonheap 풀별 사용량과 최대량 | application/environment/area/id별 `Average` |
| JVM 스레드 | 전체 활성 수와 상태별 수 | 전체는 application/environment별, 상태별은 state 차원을 추가한 `Average` |
| GC | pause 횟수·시간, GC overhead | 횟수·시간은 application/environment별 `Sum`, overhead는 `Average` (0~1 비율) |
| DB 커넥션 풀 | active·idle·max·pending, timeout 횟수, 연결 획득 횟수·시간 | application/environment/pool별 연결 수는 `Average`, 횟수·시간은 `Sum` |
| 프로세스 CPU | 애플리케이션 CPU 사용 비율 | application/environment별 `Average`, 0~1 비율 |
| EC2 커스텀 | 메모리 사용률, 루트 디스크 사용률 | Jarihana의 InstanceId별 60초 `Average`, 백분율 |
| EC2 기본 CPU | `CPUUtilization` | AWS/EC2의 InstanceId별 300초 `Average`, 백분율 |
| EC2 기본 상태 검사 | `StatusCheckFailed`, `_Instance`, `_System`, `_AttachedEBS` | AWS/EC2의 InstanceId별 60초 `Maximum`, 0=통과 / 1=실패 |

HTTP는 `2xx`, `4xx`, `5xx` 등 상태 범주로 합친다. 실제 URI, method, exception 등의
원래 라벨은 Agent가 counter 증가분을 계산할 때 유지하고 EMF 로그에도 남지만, CloudWatch
메트릭 차원에는 넣지 않는다. 여러 경로의 증가분을 합산하므로 HTTP에는 `Average`가 아닌
`Sum`을 사용한다. 전체 평균 응답 시간은 `모든 상태 범주의 Sum(시간) 합 / 모든 상태 범주의 Sum(요청 수) 합`
이다. 특정 상태 범주의 평균도 같은 범주의 시간 합계를 요청 수로 나눈다. 요청 수가 0인
기간은 제외한다. 경로별 그래프와 p95는 포함되지 않는다.

메모리 gauge는 풀별 `id`를 유지해 서로 다른 메모리 풀의 값이 같은 시리즈에 섞이지 않게
한다. 전체 heap 사용량은 각 heap 풀의 `Average`를 더한다. id 라벨을 제거해서 전체 heap
gauge가 되는 것은 아니다. 최대량이 -1인 풀은 최대량을 정의하지 않은 것이므로 사용률
계산에서 제외한다. EC2 전체 메모리 사용률은 별도로 수집한다. Hikari max는 해당
애플리케이션의 풀 크기이며 DB 전체의 연결 제한과는 다르다.

커스텀 구성은 애플리케이션 지표 이름 17개와 EC2 메모리·디스크 이름 2개다.
이전 약 41개 구성에서 EC2 커스텀 CPU 시리즈 1개를 제외했다.
HTTP 상태 범주 2개, 메모리 풀 8개, 스레드 상태 6개, Hikari 풀
1개를 가정하면 HTTP 4개 + 메모리 16개 + 스레드 7개 + GC 3개 + Hikari 7개 + 프로세스 CPU
1개 + EC2 2개 = 40개다. 모든 HTTP 상태 범주(1xx~5xx)가 생기면 같은 가정에서 46개다.
시리즈 수는 `2 × 상태 범주 수 + 2 × 메모리 풀 수 + 1(전체 스레드) + 스레드 상태 수 + 3(GC) + 7 × Hikari 풀 수 + 1(프로세스 CPU) + 2(EC2)`다.
실제 개수는 JVM 풀·스레드 상태, GC 발생, HTTP 상태 범주 등에 따라 달라져 40개로 고정되지 않는다.
서울 리전 첫 10,000개 구간의 개당 월 $0.30을 적용하면 40개를 한 달 내내 보낼 때
메트릭 비용은 약 $12.00이며, 46개라면 $13.80이다. 무료 한도, 로그·API 요금, 세금은 별도다.
전송을 중단한 지표도 기존 데이터 때문에 목록에 남을 수 있다.
네임스페이스 하나가 메트릭 하나인 것은 아니며, 메트릭 이름과 차원 조합마다 비용 대상이 된다.
커스텀 지표는 60초 주기이고, Agent가 보내는 EMF 로그는 `/jarihana/current/prometheus`에서 7일 보존한다.
애플리케이션 요청 본문·회원 ID를 수집하는 설정은 포함하지 않는다.

## 권한과 설치

Agent는 EC2에 연결된 인스턴스 역할을 사용한다. AWS 콘솔에 로그인한 IAM 사용자의 권한을
자동으로 사용하지 않는다. 필요한 전송 권한은 `CloudWatchAgentServerPolicy`를 기준으로
확인한다. 7일 보존 설정에는 `logs:PutRetentionPolicy`가 추가로 필요하다. 검증 스크립트에는
`logs:FilterLogEvents`, `cloudwatch:GetMetricStatistics` 읽기 권한도 필요하며, 이 읽기 권한이
없다고 Agent의 전송 권한까지 없다고 판단하지 않는다.

현재 runner 계정은 sudo 권한이 없다. sudo 가능한 SSH 사용자로 저장소의 해당 커밋에 있는
파일을 전달한 뒤 다음처럼 설치한다. 기존 EC2 역할을 다른 역할로 교체하지 않는다.

```bash
EXPECTED_INSTANCE_ID=<확인한-EC2-ID> bash infra/cloudwatch/prepare-aws.sh
sudo env EXPECTED_INSTANCE_ID=<확인한-EC2-ID> bash infra/cloudwatch/install.sh
EXPECTED_INSTANCE_ID=<확인한-EC2-ID> bash infra/cloudwatch/verify.sh
```

설치한 패키지의 서명, 체크섬, 버전은 설치 출력에서 확인한다. 기존 자리하나 Agent 설정을
갱신할 때는 `/var/lib/jarihana-cloudwatch/backups/`에 백업하고, 새 설정 시작에 실패하면
이전 설정을 복구한다. 패키지 설치와 Agent 시작 성공만으로 전송 성공을 선언하지 않는다.
검증은 EMF 로그와 HTTP/JVM/GC overhead/Hikari/프로세스 CPU/호스트 메모리·디스크의
대표 데이터 및 AWS/EC2 기본 CPU·상태 검사 4종의 데이터 포인트를 확인한다.
GC pause는 실제 GC가 발생해야 나타날 수
있으므로 검증을 위해 운영 GC나 오류를 강제로 발생시키지 않는다.

## 다음 알림 단계에서 해결할 사항

CloudWatch Agent는 counter와 summary의 count/sum을 이전 수집과의 차이로 전송한다.
새 시리즈의 첫 수집 값은 기준값으로 사용하고 두 번째 수집부터 전송한다. 따라서 현재 HTTP
메트릭만으로 새 5xx 시리즈의 첫 오류까지 모두 알린다고 보장할 수 없다. 다음 알림 단계에서
전용 오류 지표 또는 오류 로그를 포함해 이 요구사항을 보완한 후 5xx 알림을 구성한다.
수집 시작 전 이벤트와 Agent 중단 구간도 별도로 고려해야 한다.

알림과 애플리케이션 로그 수집은 후속 단계다.

## 운영 대시보드

`DASHBOARD-jarihana-prod`는 3열 × 4행의 12개 그래프, 하단 EC2 상태 검사 그래프와
안내문으로 구성한다. 총 13개 그래프다.
모든 애플리케이션 지표는 application=jarihana, environment=prod로 제한한다.
EC2 공통 지표는 현재 운영 인스턴스 `i-0a1245eb20f7998b8`를 참조한다.
dev 대상을 수집에 추가해도 이 대시보드의 앱 지표에 섞이지 않는다.

| 그래프 | 통계·계산 |
| --- | --- |
| HTTP 상태별 요청 수 | 각 상태 범주의 60초 `Sum` |
| HTTP 전체 평균 응답 시간 | 모든 상태 범주의 시간 `Sum` / 요청 수 `Sum` × 1,000 (ms) |
| HTTP 5xx 요청 수·오류율 | 5xx `Sum`, 5xx / 전체 요청 수 × 100 (%) |
| CPU 사용률 | AWS/EC2 CPU 300초 `Average`, prod 프로세스 CPU 60초 `Average` × 100 (%) |
| EC2 메모리·루트 디스크 사용률 | 호스트 `Average` (%) |
| JVM heap·nonheap 사용량 | 해당 영역의 풀별 `Average` 합계 / 1,048,576 (MiB) |
| JVM 전체·상태별 스레드 수 | `Average`, 상태별 시리즈는 따로 표시 |
| GC pause 횟수·시간 | 60초 `Sum`, 시간은 ms로 변환해 오른쪽 축에 표시 |
| GC overhead | `Average` × 100 (%) |
| DB active·idle·max·pending | 풀별 `Average`, Hikari max는 앱 풀의 한도 |
| DB 연결 획득·timeout 횟수 | 풀별 60초 `Sum` |
| DB 전체 평균 연결 획득 시간 | 모든 prod 풀의 시간 `Sum` / 횟수 `Sum` × 1,000 (ms) |
| EC2 상태 검사 | 기본 상태 검사 4종의 60초 `Maximum`, 0=통과 / 1=실패 |

EC2 상태 검사에 데이터가 없으면 중지·수집 지연 등으로 확인이 필요한 상태다. 빈 구간을
0으로 채우지 않으며 최신 데이터가 없을 때 과거의 0을 현재 정상으로 해석하지 않는다.
정확한 running/stopped/terminated 상태는 EC2 콘솔에서 확인한다. 기본 상태 검사는
호스트·인스턴스·EBS의 상태이며 Spring 프로세스나 HTTP 응답의 정상 여부를 보장하지 않는다.
이 구성은 무료 기본 지표를 조회하는 대시보드이며 추가 CloudWatch 경보나 SNS는 생성하지 않는다.

나눗셈 그래프는 분모가 0인 구간을 표시하지 않는다. 미수집 구간을 정상으로 보이지 않게
`FILL(...,0)`로 그래프의 빈 값을 채우지 않는다. 새 HTTP 상태 시리즈의 첫 counter 값은
기준값이므로, 5xx 그래프도 위에 기록한 첫 오류 누락 가능성을 그대로 가진다.
GC·timeout 등 이벤트가 아직 없거나 SEARCH의 신규 지표 검색이 반영되지 않았으면
관련 그래프는 비어 있을 수 있다. 메모리 최대량은 수집하지만 이 대시보드에는 풀별 사용률
그래프를 추가하지 않는다. p95와 실제 PostgreSQL 서버 지표도 포함하지 않는다.

대시보드는 기존 수집 지표를 조회하며 새로운 커스텀 지표를 전송하지 않는다.
KST 표시는 콘솔 상단 `UTC 시간대` 메뉴에서 `현지 시간대`를 선택한다.
컴퓨터 시간대가 한국이면 KST(UTC+9)로 표시되며, 수집 시각이나 집계 주기는 변경하지 않는다.
2026-09-29 운영 API 확인에서 그래프의 `timezone` 속성은 무시된다는 검증 경고가 반환되어,
대시보드 JSON에는 넣지 않는다. 시간대는 콘솔 표시 설정으로 선택한다.
대시보드 무료 한도는 같은 AWS 계정 전체에서 공유한다. 무료 한도가 이미 사용된 경우
표준 사용자 지정 대시보드 하나의 요금은 월 $3이며, 지표·로그·조회 API 요금은 별도다.

사용자 확인 후 해당 EC2 역할로 실행한다. 이 단계는 애플리케이션이나 Agent를
재시작하지 않는다. 필요한 권한은 `cloudwatch:GetDashboard`, `cloudwatch:PutDashboard`다.
기존 같은 이름의 대시보드가 있거나 조회 권한이 없으면 생성 전에 중단한다.
기존 운영 대시보드를 변경할 때는 저장된 JSON과 변경 내용을 검토하고 사용자 확인 후
`--update`로 실행한다. 기존 JSON은 sudo를 사용해
`/var/lib/jarihana-cloudwatch/backups/dashboard-<백업시각>.<임의문자>/existing.json`에
보존하며, 갱신 응답과 저장된 JSON을 확인한다. 백업 삭제는 실제 수신을 확인한 후 사용자
요청에 따라 해당 백업 경로만 대상으로 수행한다.

```bash
EXPECTED_INSTANCE_ID=i-0a1245eb20f7998b8 bash infra/cloudwatch/create-dashboard.sh

# 기존 대시보드를 검토한 후 명시적으로 갱신
EXPECTED_INSTANCE_ID=i-0a1245eb20f7998b8 bash infra/cloudwatch/create-dashboard.sh --update
```

성공 후 콘솔의 대시보드 목록에서 `DASHBOARD-jarihana-prod`를 연다. 생성 응답에 검증
메시지가 없고 저장된 JSON이 원본과 일치하는 것을 확인해도 실제 그래프 렌더링과 수신은
별도로 확인한다. 이 단계에서 운영 오류나 GC를 강제로 발생시키지 않는다.

## 참고

- [EC2 Prometheus 수집 설정](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-PrometheusEC2.html)
- [Agent metric 변환과 첫 counter 수집](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights-Prometheus-metrics-conversion.html)
- [Agent 권한](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/prerequisites.html)
- [패키지 서명 검증](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/verify-CloudWatch-Agent-Package-Signature.html)
- [서울 리전 공식 가격 데이터](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-northeast-2/index.json)
- [대시보드 JSON 구조](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Dashboard-Body-Structure.html)
- [지표 검색 표현식](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/search-expression-syntax.html)
- [지표 수식](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/using-metric-math.html)
- [CloudWatch 대시보드 요금](https://aws.amazon.com/cloudwatch/pricing/)
- [EC2 기본 CPU와 무료 상태 검사 지표](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/viewing_metrics_with_cloudwatch.html)
- [EC2 상태 검사의 의미](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-system-instance-status-check.html)
