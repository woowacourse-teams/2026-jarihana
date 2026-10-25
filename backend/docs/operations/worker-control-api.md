# 내부 worker 제어 API

이 문서는 배포 runner가 한 EC2 안에서 push worker의 처리 권한을 제어하는 내부 계약이다.
사용자 API가 아니며, Spring Boot Actuator 관리 서버의 `workercontrol` endpoint를 사용한다.

## 노출과 인증

- 경로는 `http://127.0.0.1:8081/actuator/workercontrol`이다. 배포 runner는 대상 EC2에서 실행되어야 한다.
- Compose의 호스트 포트는 `127.0.0.1:8081`에만 게시한다. 공개 API 포트 8080에서는 이 경로를 거부한다.
- `X-Jarihana-Worker-Control-Token` 헤더에 `WORKER_CONTROL_TOKEN` 환경 변수로 주입한 32바이트 이상의 별도 비밀값을 보낸다. 사용자 JWT나 VAPID 값과 공유하지 않는다.
- 제어 endpoint는 `PUSH_WORKER_CONTROL_ENABLED=true`일 때만 등록된다. Blue-Green용 Compose는 이 값과 기본 대기 설정을 전달한다. 기존 배포 방식의 앱에 자동으로 활성화됐다고 가정하지 않는다.
- 토큰을 URL, 명령행 인자, 로그 또는 JSON 요청 본문에 넣지 않는다. `infra/scripts/deploy/actions/app.sh`는 대상 호스트의 관리자 소유 파일에서 토큰을 읽고, curl의 표준입력 설정으로 loopback API에 전달한다.

## 코드 배치

worker 제어는 `notificationdelivery` 기능이 소유한다. 배포용이라는 이유로 별도 `control`
패키지에 계층을 섞지 않고 [아키텍처 컨벤션](../conventions/architecture.md)에 따라 나눈다.

- `command/controller/WorkerControlEndpoint`: Actuator 관리 API 어댑터
- `command/controller/dto`: 상태·명령 결과의 응답 record
- `command/service`: DB 처리 권한 변경과 현재 프로세스의 작업 진입 제어
- `command/service/dto/WorkerControlCommand`: 권한 변경 명령 입력
- `command/repository/WorkerAuthorityRepository`: 처리 권한 행의 조회·잠금·저장
- `domain`: 처리 권한·프로세스 신원·배포 단계의 값 모델
- `config`: worker 설정과 프로세스 신원 Bean 구성

`workercontrol`은 일반 업무 REST API와 달리 Actuator ID 하나에 상태 조회와 관리 명령을
등록하는 기술 어댑터다. 기존 `/actuator/workercontrol` 계약을 유지하기 위해 하나의 Endpoint를
두며, HTTP 경로나 JSON을 바꾸는 Controller 분리는 하지 않는다. 업무 API의 CQRS-lite 경계는
변경하지 않는다. 앱 전체의 HTTP·백그라운드 활동 계측은 특정 기능에 종속되지 않으므로
`common/deployment`에 유지한다.

## 상태 조회

```http
GET /actuator/workercontrol
X-Jarihana-Worker-Control-Token: <secret>
```

응답은 현재 프로세스의 `version`, `environment`, `identity.hostId`, `identity.bootId`,
로컬 worker 상태(`worker.state`, `worker.inFlight`, `worker.unresolved`)와 DB 권한 상태를 반환한다.
`authority`는 아직 배포 권한 행이 없으면 `null`이다. `lastCommandPayload`와 머신 토큰은 응답에 포함하지 않는다.

drain 완료는 `worker.state=PAUSED`, `worker.inFlight=0`, `worker.unresolved=0`일 때만 확인한다.
`pause` 응답 자체나 HTTP reload 완료를 drain 완료로 취급하지 않는다.
비동기 발송에서도 `processDue()`가 반환된 것만으로 종료되지 않는다. `worker.inFlight`는
선점 전에 확보한 처리 허가를 세며, 이미 승인한 묶음의 외부 응답과 결과 저장 트랜잭션 커밋이
모두 끝나야 줄어든다. 중단 이후 새 허가는 주지 않고 이미 승인한 작업은 끝까지 기다린다.

`activity`는 종료 판단에 필요한 현재 JVM의 활동을 반환한다.

```json
{
  "activity": {
    "httpInFlight": 0,
    "backgroundInFlight": 0,
    "backgroundDrained": true
  }
}
```

- `httpInFlight`: 앱 ServletContext에 진입해 아직 종료되지 않은 요청 수다. 비동기 요청은 최초
  Servlet 메서드 반환이 아니라 최종 요청 종료까지 센다. 별도 관리 서버의 조회는 포함하지 않는다.
- `backgroundInFlight`: 현재 실행 중인 push 스케줄러 회차 수다. 성공·예외 모두 회차가 반환돼야 줄어든다.
- `backgroundDrained`: worker가 PAUSED·inFlight 0·unresolved 0이고 스케줄러 회차도 0일 때만 true다.
  단순히 할 일이 없는 ACTIVE worker는 false다.

이 값은 조회 순간의 측정이지 신규 HTTP 유입을 차단하는 명령이 아니다. Nginx의 이전 worker 종료와
해당 앱의 worker 권한 반납을 함께 확인하고, 종료 직전에도 대상 boot와 상태를 다시 검사해야 한다.
HTTP 수치에는 Nginx에 남은 연결·네트워크 버퍼·업그레이드된 WebSocket 세션이 포함되지 않는다.
백그라운드 수치는 현재 업무 스케줄러인 push 회차 범위다. Spring Session 정리 등 프레임워크 내부 작업,
별도 executor에 남은 작업이나 이후 추가할 비동기 작업 전체의 종료를 보장하지 않는다.
새 업무 스케줄러·fire-and-forget 작업을 추가하면 계측과 종료 대기 계약도 함께 확장해야 한다.

실행 중 API의 수치로 `normal_exit=true`를 만들지 않는다. 앱 전용 Actions job의 Bash 실행기는
SIGTERM 이후 실제 Docker 종료 코드·OOM·컨테이너 세대를 확인해 종료 증거를 만든다.
결과는 native job output으로 coordinator job에 전달하며 누락된 증거를 0 또는 true로 대체하지 않는다.
실행 계약은 [서버별 배포 작업 계약](../../../infra/deploy/child-contract.md)을 따른다.

## 상태 변경

```http
POST /actuator/workercontrol/{operation}
Content-Type: application/json
X-Jarihana-Worker-Control-Token: <secret>
```

허용된 operation은 `begin`, `phase`, `pause`, `activate`, `release`다. 임의 shell, 경로, host,
Compose 명령은 받지 않는다. 요청 본문은 고정 필드만 허용한다.

```json
{
  "deploymentId": "a852fb21-f613-42ec-b960-b60d31519ee0",
  "epoch": 4,
  "commandId": "213ac97d-c281-47fd-bfc5-5891765eff17",
  "targetHostId": "prod-a",
  "targetBootId": "85c12362-617d-4fd9-a45e-6fcdde5e8e99",
  "expectedPhase": "HANDOFF",
  "deadline": "2026-10-22T19:30:00",
  "expectedRevision": 12
}
```

`phase`에만 `nextPhase` 필드를 추가한다. `deadline`은 시간대 오프셋 없는 ISO `LocalDateTime`이다.
host와 boot 값은 먼저 `GET`으로 조회한 현재 프로세스와 모두 일치해야 한다. 모든 명령은 deployment,
epoch, phase, revision, deadline을 검사한다. 정확히 같은 `commandId`와 본문의 마지막 명령 재시도는
중복 적용하지 않고 성공 상태를 돌려준다. 그 뒤 다른 명령이 적용되면 이전 명령은 stale 요청으로 거부된다.

| operation | 동작 |
| --- | --- |
| `begin` | 새 deployment ID를 등록하고 현재 epoch를 증가시켜 `PREPARE` 단계로 진입 |
| `phase` | 허용된 deployment phase로 이동. 실제 이동 가능 여부는 worker authority 서비스가 검증 |
| `pause` | 신규 작업 선점을 막는다. 진행 중인 작업이 있으면 `DRAINING`으로 남는다 |
| `activate` | 현재 프로세스를 DB 처리 권한 owner로 승인하고 worker를 재개 |
| `release` | 신규 선점 차단과 in-flight 0을 확인한 뒤 현재 프로세스의 DB 권한을 반납 |

### 권한 반납 후 시험 종료

`phase`의 `HANDOFF → COMPLETE`는 DB 권한이 `UNASSIGNED`, owner가 없고,
요청을 받는 프로세스가 `PAUSED`·inFlight 0·unresolved 0인 경우에만 허용한다.
먼저 기존 owner의 `pause → drain 확인 → release`를 끝내야 한다.
ACTIVE 또는 DRAINING owner가 남아 있는 상태에서 완료 단계로 건너뛸 수 없다.

종료와 다른 프로세스의 활성화가 겹치면 DB 행 잠금·expected revision으로 하나만 적용한다.
완료 후에는 `COMPLETE/UNASSIGNED`와 이전 deployment·epoch·revision 이력을 남긴다.
다음 시험은 새로운 `begin`으로 시작하며 DB 행 삭제나 직접 수정이 필요하지 않다.
정상 서비스의 `OBSERVE → COMPLETE`는 기존처럼 ACTIVE owner를 유지한다.

`COMPLETE/UNASSIGNED`는 worker를 멈춘 시험의 정리 결과다. 사용자 트래픽 전환이나
운영 배포 성공, 15분 관찰 완료를 뜻하지 않는다. 이전 바이너리는 이 종료 경로를
거부하므로 실제 시험 전에 A/B 모두 해당 계약을 지원하는 이미지인지 확인한다.

예상 상태·대상·기한·revision 충돌은 HTTP 409 `WORKER_CONTROL_CONFLICT`, 잘못된 요청은 HTTP 400,
머신 토큰 누락·오류 또는 공개 포트 접근은 HTTP 403이다. 내부 예외 상세와 비밀값은 응답에 포함하지 않는다.

## 안전 범위

이 API는 현재 EC2 프로세스와 DB의 worker 권한만 제어한다. 다른 서버의 HTTP 트래픽, Nginx, EC2 상태,
15분 관찰, 자동 롤백, 프로세스 종료는 수행하지 않는다. workflow가 같은 명령을 무작정 새 ID로 재시도하면
상태 revision이 바뀌거나 인계 순서가 손상될 수 있으므로, 이후 coordinator는 명령 ID와 배포 상태를 보존해야 한다.
