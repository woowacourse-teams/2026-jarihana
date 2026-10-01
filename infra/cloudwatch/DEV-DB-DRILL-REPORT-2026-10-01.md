# 자리하나 CloudWatch dev DB 장애 실험 리포트 초안

기준: `develop` · 서울 리전 `ap-northeast-2` · 모든 시각 KST (UTC+09:00)

> **진행 상태: 사전 점검 완료, 실험 보류.** 2026-10-01 17:05 KST 기준 자리하나 알람을
> CloudWatch 콘솔에서 찾지 못했다. 현재 콘솔 사용자에게 CloudFormation 스택과 EventBridge
> 연결 목록 조회 권한도 없어 배포 상태를 확정할 수 없다. 따라서 dev DB 중단과 HTTP 500
> 발생은 아직 실행하지 않았다. 안전한 실행 workflow는 [PR #346](https://github.com/woowacourse-teams/2026-jarihana/pull/346)로
> `develop` 반영을 기다리고 있다. 아래의 장애 시각·알람 전환·복구 지표는 실험 뒤 실제 수치로
> 채워야 한다.

## 구성과 확인 화면

| 항목 | 구성 또는 확인 위치 | 현재 확인 결과 |
| --- | --- | --- |
| 실행 도구 | [CloudWatch Dev DB Drill workflow](../../.github/workflows/cloudwatch-dev-db-drill.yml), [주입·복구 스크립트](dev-db-drill.sh), [관측 스크립트](dev-db-drill-observe.py) | `feat/cloudwatch-dev-db-scenario`에 구현·푸시했고 [PR #346](https://github.com/woowacourse-teams/2026-jarihana/pull/346)로 `develop` 반영 대기. 구문·모의 안전성 검사 완료 |
| 로그 | CloudWatch Logs `/jarihana/dev/application`, `/jarihana/prod/application` | 환경별 ECS JSON 수집 설정 확인. 이번 실험의 500 로그는 아직 없음 |
| 지표 화면 | [dev 대시보드](https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#dashboards/dashboard/DASHBOARD-jarihana-dev), [prod 대시보드](https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#dashboards/dashboard/DASHBOARD-jarihana-prod) | 2026-10-01 16:54 KST 콘솔 목록에서 두 대시보드 이름 확인 |
| 5xx 알람 | [CloudWatch 알람 화면](https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#alarmsV2:) · `[DEV] HTTP 5xx detected (application log)` | 2026-10-01 16:52 KST 이름 및 `jarihana` 검색 결과 0건. 배포 여부 재점검 필요 |
| 알림 경로 | CloudWatch → EventBridge API Destination → Discord 웹훅, 실패 시 SQS DLQ. [설정 원본](ALERTS.md) | [템플릿 validate #1](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/36833226042) 성공(16:55 KST). [test-webhook #2](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/36833376375/job/110274895729#step:4:24)는 16:57 KST HTTP 200. EventBridge 콘솔은 `events:ListConnections` 권한 거부. Discord ALARM/OK 메시지는 아직 검증하지 못함 |

5xx 필터는 `event.action=http.request.completed`와
`http.response.status_code>=500`을 만족하는 **새 로그**를 집계한다. 기준은 1분의 합계
1건 이상이다. 대시보드의 `Jarihana` HTTP 5xx 그래프는 Prometheus counter의 첫 증가분을
놓칠 수 있어, 알람 판정은 별도의 `Jarihana/Alerts` 로그 지표로 확인한다.

## dev와 prod의 기존 동작 증거

| 환경 | 실제 확인한 결과 | 근거 |
| --- | --- | --- |
| dev | 2026-10-01 16:31 KST `cloudwatch-verify` 성공. EC2 `i-0a1245eb20f7998b8`, 로컬 API `127.0.0.1:80`, 앱 HTTP 요청·응답 시간, Hikari active/pending, JVM, CPU와 공용 EC2 메모리·디스크·상태 검사 지표의 실제 datapoint 확인 | [CloudWatch Manage #9](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/36830859991/job/110266894806#step:7:9), [dev 백엔드 배포 workflow](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/backend-dev-deploy.yml) |
| prod | 2026-10-01 15:04 KST `cloudwatch-verify` 성공. 같은 EC2의 prod API `127.0.0.1:8080`, prod 앱 HTTP·Hikari·JVM·CPU 및 공용 EC2 지표의 실제 datapoint 확인 | [CloudWatch Manage #3](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/36822872651/job/110242041749#step:7:8), [prod 백엔드 배포 workflow](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/backend-prod-deploy.yml) |

공용 EC2 지표는 두 환경의 개별 상태를 입증하지 않는다. 각 환경의 앱 지표는
`environment=dev`/`prod` 차원과 위 verify 결과로 구분한다. prod DB와 prod 컨테이너에는
장애를 주입하지 않았다.

## 배포 파이프라인 위치

| 환경 | 백엔드 | 프론트엔드 | 실행 브랜치 |
| --- | --- | --- | --- |
| dev | [Backend Development Deploy](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/backend-dev-deploy.yml) | [Frontend Development Deploy](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/frontend-dev-deploy.yml) | `develop` |
| prod | [Backend Production Deploy](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/backend-prod-deploy.yml) | [Frontend Production Deploy](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/frontend-prod-deploy.yml) | `main` |

CloudWatch 수집 점검은 [CloudWatch Manage](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/cloudwatch-manage.yml),
알람 배포·Discord 웹훅 테스트는 [CloudWatch Alerts](https://github.com/woowacourse-teams/2026-jarihana/actions/workflows/cloudwatch-alerts.yml)에서 수동 실행한다.

## 장애 시나리오 1건: dev PostgreSQL 연결 실패

| 항목 | 실제 관측값 |
| --- | --- |
| 발생 시각 | **미실행** — 알람 스택·Discord 경로 사전 점검 완료 뒤 기록 |
| 현상 | 미실행. 계획: `GET http://127.0.0.1:80/api/groups`에서 HTTP 500 1건 관측 |
| 원인 | 계획: `com.docker.compose.project=jarihana-dev` 및 `com.docker.compose.service=postgres` 라벨을 모두 만족하는 유일한 DB 컨테이너의 짧은 중단 |
| 조치 | 계획: 500 확인 즉시 `docker start`로 복구. 주입 **전에** 90초 독립 `systemd-run` 복구 타이머 등록, 셸 `EXIT` trap과 Actions `always()` 복구 단계 추가 |
| 조치 뒤 확인 | 미실행. dev DB `healthy`, `/api/groups` 200, `/jarihana/dev/application`의 500 로그, `Jarihana/Alerts/http-5xx-dev`, Hikari timeout/active/idle/pending, dev 알람 `ALARM → OK`, Discord 두 메시지를 KST로 기록 |

실험은 `develop`의 **dev 전용 수동 workflow**에서만 실행되며, EC2 ID와 컨테이너 라벨,
기존 dev API 200, dev 알람 `OK`, EventBridge 연결 상태를 모두 확인하지 못하면 DB를
중단하지 않는다. 500이 45초 안에 나오지 않아도 즉시 복구한다. Discord 알림을 기다리는
동안 DB 중단 시간을 연장하지 않는다. `docker compose down`, 볼륨 삭제, `prune`은 쓰지 않는다.

## 남은 검증

1. `jarihana-alerts` 스택이 실제로 배포되었는지 self-hosted runner 권한으로 확인하고,
   `[DEV] HTTP 5xx detected (application log)`가 `OK`인지 확인한다. 현재 콘솔 사용자는
   `cloudformation:ListStacks`와 `events:ListConnections` 권한이 없다.
2. Discord 웹훅 HTTP 200 이후 대상 채널 도착을 확인한다. HTTP 200만으로 ALARM/OK
   전환 메시지 전달을 입증하지 않는다.
3. [PR #346](https://github.com/woowacourse-teams/2026-jarihana/pull/346)을 `develop`에
   반영한 뒤 GitHub 수동 실행 UI에서 `expected_instance_id=i-0a1245eb20f7998b8`로
   실행한다. workflow는 `develop`에서만 동작하도록 제한되어 있다.
4. workflow artifact의 KST 타임라인과 CloudWatch JSON, Discord 화면을 바탕으로 위
   장애 표를 실제 시각·수치·링크로 교체한다.
