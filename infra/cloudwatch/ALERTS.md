# CloudWatch 이메일 알림

## 구성

```text
CloudWatch 알람 ─→ SNS Topic ─→ 확인된 팀 이메일 구독
       └ ALARM 진입과 OK 복구 상태를 모두 전달
```

`infra/cloudwatch/alerts.py`가 환경별 CloudWatch 알람, 로그 기반 지표 필터, SNS Topic과
이메일 구독을 하나의 `jarihana-alerts` CloudFormation stack으로 관리한다. GitHub Actions
스케줄과 self-hosted runner polling을 거치지 않으므로 runner가 배포로 점유되거나 중단돼도
CloudWatch가 SNS로 알림을 전달한다.

이메일 주소는 저장소의 GitHub Actions secret `ALERT_EMAIL`에 저장한다. CloudFormation의
`AlertEmail` parameter도 `NoEcho`로 선언한다. SNS 구독을 처음 만들면 AWS가 확인 메일을 보내며,
수신자가 **Confirm subscription** 링크를 눌러야 실제 알림이 전달된다.

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

모든 알람은 `AlarmActions`와 `OKActions`에 같은 SNS Topic을 사용한다. `ALARM` 진입 이메일과
`OK` 복구 이메일을 보내며 `INSUFFICIENT_DATA`에는 이메일을 보내지 않는다. 임계치는 첫 운영
기준이며 실제 부하를 보면서 조정한다. SNS 이메일은 AWS가 생성한 제목과 알람 상태 JSON을
사용한다.

dev 애플리케이션 알람은 별도 스위치로 제어한다. 현재 dev 지표 수신을 확인했으므로
`EnableDevApplicationAlarms`의 기본값은 `true`다. dev 서버를 분리하거나 중단하는 동안에는
workflow에서 `false`로 바꿀 수 있다. 같은 EC2의 CPU·메모리·디스크·상태 알람은 환경에 관계없이
계속 동작한다.

## HTTP 5xx 데이터

Prometheus counter는 Agent의 첫 수집값을 기준값으로 쓰므로 새 5xx counter 시리즈의 첫 오류를
놓칠 수 있다. 이 경보는 해당 counter 대신 환경별 CloudWatch 로그 그룹에 수집되는 한 줄 ECS
JSON을 사용한다.

| 환경 | 로그 그룹 | 필터 패턴 |
| --- | --- | --- |
| prod | `/jarihana/prod/application` | `{ $.event.action = "http.request.completed" && $.http.response.status_code >= 500 }` |
| dev | `/jarihana/dev/application` | `{ $.event.action = "http.request.completed" && $.http.response.status_code >= 500 }` |

배포 스크립트는 prod 로그 그룹과, dev 알람이 켜졌다면 dev 로그 그룹이 실제로 존재하는지 먼저
확인한다. 그룹이 없으면 `CloudWatch Manage`의 `cloudwatch-prepare`를 해당 환경에 실행하라는
메시지와 함께 중단한다. 로그 기반 경보는 필터를 만든 뒤 들어오는 새 로그부터 집계한다.

현재 지표 구성은 p95 응답시간 알람이나 DB의 특정 Hikari pool 알람에 필요한 확정 차원값을
제공하지 않아 포함하지 않았다. Hikari `pool` 차원 이름과 운영 기준을 확인하면 추가할 수 있다.

## 사전 준비와 배포

1. GitHub 저장소의 **Settings → Secrets and variables → Actions**에서 repository secret
   `ALERT_EMAIL`에 팀이 확인할 수 있는 이메일 주소를 저장한다. 이메일을 workflow 입력이나 코드에
   넣지 않는다.
2. `CloudWatch Manage`의 `cloudwatch-prepare`를 prod와 dev에 각각 실행하고, 두 로그 그룹에
   ECS JSON이 들어오는지 확인한다.
3. `CloudWatch Alerts`에서 `check-sns-permissions`를 실행한다. 대상 EC2 ID를 입력한다.
   CloudFormation이 임시 SNS Topic을 만들고 삭제해 Topic 생성·삭제 권한을 실제로 확인한다.
   이메일 구독 권한은 다음 배포에서 확인된다.
4. `validate`로 CloudFormation template과 단위 테스트를 확인한다.
5. `deploy`에 대상 EC2 ID를 입력해 실행한다. 이 단계가 알람과 SNS Topic을 갱신하고 이메일
   구독을 만든다.
6. AWS에서 온 **AWS Notification - Subscription Confirmation** 메일의 확인 링크를 누른다.
7. `test-email`에 대상 EC2 ID를 입력해 실행한다. workflow는 현재 `OK`인 dev 5xx 알람과 SNS
   action 연결을 확인한 뒤 AWS의 테스트 API로 상태를 잠시 `ALARM`으로 바꾼다. 해당 제목의
   CloudWatch ALARM 메일이 오는지 확인한다. 지표 알람은 실제 지표에 따라 곧 원래 상태로
   재평가된다.
8. dev DB 장애 실험으로 `[DEV] HTTP 5xx`의 `ALARM`과 `OK` 이메일을 확인한다.

현재 대상 EC2 ID는 `i-0a1245eb20f7998b8`이다. 권한 확인·배포·테스트는 이 ID와 self-hosted
runner의 실제 EC2가 같은지 IMDSv2로 검사한다. SNS와 CloudWatch는 `ap-northeast-2`에서만
관리한다.

필요한 SNS 권한은 `sns:CreateTopic`, `sns:Subscribe`, `sns:GetTopicAttributes`,
`sns:ListSubscriptionsByTopic`, `sns:DeleteTopic`이다. 기존 CloudWatch와 CloudFormation 권한도
계속 필요하며 테스트에는 `cloudwatch:SetAlarmState`를 사용한다. 이 구성은 IAM Role,
EventBridge, Lambda, Secrets Manager를 새로 만들지 않는다.

## 확인과 운영

배포 직후 구독이 `PendingConfirmation`인 것은 정상이다. 확인 링크를 누르기 전에는 CloudWatch가
Topic에 발행해도 이메일을 받을 수 없다. `test-email`은 dev 5xx 알람을 테스트 목적으로 잠시
`ALARM`으로 바꿔 SNS 전달을 검증한다. 실제 장애 감지는 dev 장애 실험의
`OK → ALARM → OK` 전환으로 확인한다.

배포 후 CloudWatch 콘솔에서 `[PROD]`, `[DEV]`, `[EC2]` 알람의 작업에
`jarihana-cloudwatch-alerts` Topic이 연결되었는지 확인한다. dev 장애 실험의 preflight도 확인된
이메일 구독과 dev 5xx 알람의 `AlarmActions`·`OKActions`를 검사한다.

dev 로그 그룹이나 지표 수신을 중단할 계획이면 먼저 `EnableDevApplicationAlarms=false`로 stack을
갱신한다. 운영 환경에는 강제 오류나 부하를 발생시켜 테스트하지 않는다.
