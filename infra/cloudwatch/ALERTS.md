# CloudWatch 알림

## 구성

```text
CloudWatch 알람 상태 조회 ← self-hosted GitHub Actions runner
                         └→ Discord Webhook → 자리하나 알림 채널
```

Discord 웹훅은 지정한 채널에 메시지를 보낸다. 웹훅 URL은 채널에 메시지를 보낼 수 있는 비밀
값이므로 저장소의 GitHub Actions secret `DISCORD_WEBHOOK_URL`에 저장한다. 메시지나 코드에 URL을
넣지 않는다.

`infra/cloudwatch/alerts.py`는 CloudWatch 알람과 로그 기반 지표 필터만 CloudFormation으로 만든다.
Discord 전송은 `infra/cloudwatch/discord-monitor.py`가 self-hosted runner에서 5분마다
`cloudwatch:DescribeAlarms`로 상태를 조회하고, 상태 전환이 있을 때 Discord 웹훅을 호출한다.
EventBridge Connection, API Destination, SQS DLQ와 그에 필요한 Secrets Manager 권한은 사용하지
않는다. 웹훅 URL은 GitHub Actions secret에서만 읽으며 코드나 workflow 입력에 넣지 않는다.

GitHub Actions 스케줄은 최대 약 5분 지연될 수 있고, runner나 Actions가 중단된 동안의 짧은
상태 전환은 놓칠 수 있다. 모니터의 첫 실행은 현재 상태를 기준선으로 저장하고 메시지를 보내지
않는다. 이후 `[PROD]`, `[DEV]`, `[EC2]` 알람이 `ALARM`으로 진입하거나 `ALARM`에서 `OK`로
복구될 때만 메시지를 보낸다.

## 알람 기준

| 이름 접두사 | 알람 | 초기 기준 |
| --- | --- | --- |
| `[PROD]`, `[DEV]` | HTTP 5xx | ECS JSON 요청 완료 로그가 1분 동안 1건 이상 |
| `[PROD]`, `[DEV]` | 애플리케이션 CPU | 80% 이상이 5분 연속 |
| `[PROD]`, `[DEV]` | JVM GC overhead | 10% 이상이 최근 5분 중 3회 |
| `[PROD]`, `[DEV]` | 애플리케이션 지표 미수집 | `process_cpu_usage`가 3분 연속 없음 |
| `[EC2]` | 인스턴스 상태 검사 실패 | 2분 중 1회 이상 실패 |
| `[EC2]` | EC2 CPU | 70% 이상이 5분 단위 2회 연속 |
| `[EC2]` | EC2 메모리 | 70% 이상이 1분 단위 5회 연속 |
| `[EC2]` | 루트 디스크 | 80% 이상이 1분 단위 5회 연속 |

알람이 `ALARM`으로 바뀔 때와 `ALARM`에서 `OK`로 복구할 때 Discord에 보낸다.
`INSUFFICIENT_DATA`와 새 알람 생성 직후의 초기 `OK` 상태는 보내지 않는다. `[PROD]`, `[DEV]`,
`[EC2]` 접두사가 붙은 알람만 전달한다. 임계치는 첫 운영 기준이며 실제 부하를 보면서 조정할 수
있다. 메시지에는 알람 이름, 변경된 상태, 발생 시각을 담는다.

dev 애플리케이션 알람은 별도 스위치로 제어한다. 현재 dev 지표 수신을 확인했으므로
`EnableDevApplicationAlarms`의 기본값은 `true`다. dev 서버를 분리하거나 중단하는 동안에는
workflow에서 `false`로 바꿀 수 있다. 같은 EC2의 CPU·메모리·디스크·상태 알람은 환경에 관계없이
계속 동작한다.

Prometheus counter는 Agent의 첫 수집값을 기준값으로 쓰므로 새 5xx counter 시리즈의 첫 오류를
놓칠 수 있다. 이 경보는 해당 counter 대신 환경별 CloudWatch 로그 그룹에 수집되는 한 줄 ECS
JSON을 사용한다. HTTP 요청 완료 이벤트의 상태 코드는 JSON 숫자이며 다음 고정 구성을 사용한다.

| 환경 | 로그 그룹 | 필터 패턴 |
| --- | --- | --- |
| prod | `/jarihana/prod/application` | `{ $.event.action = "http.request.completed" && $.http.response.status_code >= 500 }` |
| dev | `/jarihana/dev/application` | `{ $.event.action = "http.request.completed" && $.http.response.status_code >= 500 }` |

배포 스크립트는 prod 로그 그룹과, dev 알람이 켜졌다면 dev 로그 그룹이 실제로 존재하는지 먼저
확인한다. 그룹이 없으면 `CloudWatch Manage`의 `cloudwatch-prepare`를 해당 환경에 실행하라는
메시지와 함께 중단한다. 로그 기반 경보는 필터를 만든 뒤 들어오는 새 로그부터 집계한다.

현재 지표 구성은 p95 응답시간 알람이나 DB의 특정 Hikari pool 알람에 필요한 확정 차원값을
제공하지 않아 포함하지 않았다. Hikari `pool` 차원 이름과 운영 기준을 확인하면 추가할 수 있다.

## 사전 준비

1. Discord 서버에서 대상 채널의 `통합 → 웹후크`로 웹훅을 만든다. 만들 권한은 Discord의
   `웹후크 관리` 권한이다.
2. GitHub 저장소의 **Settings → Secrets and variables → Actions**에서 repository secret
   `DISCORD_WEBHOOK_URL`을 추가한다. URL을 이 대화, 코드, workflow 입력에 붙여 넣지 않는다.
3. `CloudWatch Manage`의 `cloudwatch-prepare`를 prod와 dev에 각각 실행하고, 로깅이 포함된
   백엔드 컨테이너를 배포해 두 로그 그룹에 ECS JSON이 들어오는지 확인한다.
4. GitHub Actions workflow가 기본 브랜치에 반영되면 `CloudWatch Alerts`에서 `test-webhook`으로
   Discord 채널에 테스트 메시지가 오는지 확인하고, `validate`로 템플릿을 확인한다.
5. `deploy`는 EC2 self-hosted runner에서 실행한다. `expected_instance_id`는 확인한 대상 EC2와
   runner가 같은지 검사하는 값이다. 현재 EC2 ID는 `i-0a1245eb20f7998b8`이다. 이 단계는
   CloudWatch 알람만 생성하며 EventBridge나 IAM 역할을 만들지 않는다.
   이전 시도가 `ROLLBACK_COMPLETE`로 남아 있으면 스크립트가 그 실패 스택을 삭제한 뒤 다시 만든다.
6. `CloudWatch Discord Monitor`는 기본 브랜치에서 5분마다 자동 실행된다. 첫 실행은 기준선을
   저장하므로, 배포 뒤 workflow를 한 번 수동 실행해 기준선을 먼저 만든다.

현재 EC2 역할에는 CloudWatch 알람 배포와 `cloudwatch:DescribeAlarms` 권한이 필요하다. Discord
웹훅 호출은 AWS API가 아니라 runner의 HTTPS 요청으로 수행하므로 EventBridge Connection과
Secrets Manager 권한은 필요하지 않다. URL이 노출되면 Discord에서 해당 웹훅을 삭제하고 새
URL로 GitHub secret을 교체한다.

## 배포와 확인

workflow `CloudWatch Alerts`에서 `operation=deploy`를 고른다. dev 앱 알람의 기본값은 `true`다.
스크립트는 EC2 ID, 서울 리전과 필요한 애플리케이션 로그 그룹을 검사하고 루트 파일시스템 형식을
자동 확인한 다음 `jarihana-alerts` CloudFormation stack을 생성하거나 갱신한다.

배포 후 CloudWatch 콘솔에서 `[PROD]`/`[DEV]`/`[EC2]` 알람을 확인하고, `CloudWatch Discord
Monitor`의 workflow 로그에서 조회한 알람 수와 전송 건수를 확인한다. 경보가 실제로 `ALARM` 또는
`OK`로 바뀔 때 Discord 메시지를 검증한다. 운영 환경에 강제 오류나 부하를 발생시켜 테스트하지
않는다. Discord가 일시적으로 실패하면 다음 모니터 실행에서 같은 상태 전환을 다시 시도할 수
있지만, 모니터가 중단된 동안 ALARM과 OK가 모두 지나간 상태 전환은 복구할 수 없다.

dev 로그 그룹이나 지표 수신을 중단할 계획이면 먼저 `EnableDevApplicationAlarms=false`로 stack을
갱신한다. 템플릿 검증과 Discord 웹훅 테스트는 애플리케이션 로그 수신 여부와 독립적으로 실행된다.
