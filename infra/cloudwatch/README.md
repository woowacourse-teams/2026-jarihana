# 현재 운영 EC2의 CloudWatch 수집

기존 EC2의 Spring Boot와 PostgreSQL 컨테이너를 유지하고 호스트에 CloudWatch Agent를
설치한다. 작업 브랜치는 `feat/cloudwatch-prod-check` 하나를 사용한다.

```text
Spring Boot :8081 → 호스트 127.0.0.1:8081 → CloudWatch Agent
                                          ├─ EMF 로그 → Jarihana/Application
                                          └─ 호스트 지표 → Jarihana/Host
```

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
| HTTP | 요청 수, 응답 시간 합계 | application/environment/status_class별 `Sum` |
| JVM 메모리 | 사용량, 최대량 | application/environment/area/id별 `Average` |
| JVM 스레드 | 전체 활성 수, 상태별 수 | application/environment 및 state별 `Average` |
| GC | 중단 횟수·시간 합계, GC overhead | 횟수·시간은 `Sum`, overhead는 `Average` |
| DB 커넥션 풀 | active/idle/max/pending, timeout, 연결 획득 횟수·시간 | pool별 gauge는 `Average`, counter는 `Sum` |
| 애플리케이션 CPU | process_cpu_usage | application/environment별 `Average`, 0~1 비율 |
| EC2 | 메모리 사용률, 루트 디스크 사용률, 전체 CPU 사용률 | InstanceId별 `Average`, 백분율 |

HTTP는 `2xx`, `4xx`, `5xx` 등 상태 범주로 합친다. 실제 URI, method, exception 등의
원래 라벨은 Agent가 counter 증가분을 계산할 때 유지하고 EMF 로그에도 남지만, CloudWatch
메트릭 차원에는 넣지 않는다. 여러 경로의 증가분을 합산하므로 HTTP에는 `Average`가 아닌
`Sum`을 사용한다. 평균 응답 시간은 같은 상태 범주의 `Sum(시간 합계) / Sum(요청 수)`이며,
요청 수가 0인 기간은 제외한다. 경로별 메트릭 그래프와 p95는 이 설정에 포함되지 않는다.

메모리 gauge는 풀별 `id`를 유지해 서로 다른 메모리 풀의 값이 같은 시리즈에 섞이지 않게
한다. 전체 heap 사용량은 각 heap 풀의 `Average`를 더한다. JVM이 제한을 제공하지 않아
최대량이 -1인 풀은 사용률 계산에서 제외한다. Hikari 풀의 max는 DB 서버의 전체 허용
커넥션 수가 아니라 애플리케이션 풀의 설정값이다.

현재 확인한 메모리 풀 8개, 스레드 상태 6개, 커넥션 풀 1개 기준으로 최대 약 47개의
커스텀 메트릭 시리즈가 생긴다. JVM 종류나 풀이 늘면 개수도 달라진다. 네임스페이스 하나가
메트릭 하나인 것은 아니며, 메트릭 이름과 차원 조합마다 비용 대상이 된다. 모든 지표는
60초 주기이고, Agent가 보내는 EMF 로그는 `/jarihana/current/prometheus`에서 7일 보존한다.
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
검증은 EMF 로그와 HTTP/JVM/GC/Hikari/프로세스 CPU/호스트 메모리·디스크·CPU의 실제
CloudWatch 데이터 포인트를 확인한다. GC pause는 실제 GC 발생 후 나타날 수 있다.

## 다음 알림 단계에서 해결할 사항

CloudWatch Agent는 counter와 summary의 count/sum을 이전 수집과의 차이로 전송한다.
새 시리즈의 첫 수집 값은 기준값으로 사용하고 두 번째 수집부터 전송한다. 따라서 현재 HTTP
메트릭만으로 새 5xx 시리즈의 첫 오류까지 모두 알린다고 보장할 수 없다. 다음 알림 단계에서
전용 오류 지표 또는 오류 로그를 포함해 이 요구사항을 보완한 후 5xx 알림을 구성한다.
수집 시작 전 이벤트와 Agent 중단 구간도 별도로 고려해야 한다.

대시보드, 알림, 애플리케이션 로그 수집은 후속 단계다.

## 참고

- [EC2 Prometheus 수집 설정](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-PrometheusEC2.html)
- [Agent metric 변환과 첫 counter 수집](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights-Prometheus-metrics-conversion.html)
- [Agent 권한](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/prerequisites.html)
- [패키지 서명 검증](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/verify-CloudWatch-Agent-Package-Signature.html)
