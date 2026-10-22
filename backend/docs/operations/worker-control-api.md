# 내부 worker 제어 API

이 문서는 배포 runner가 한 EC2 안에서 push worker의 처리 권한을 제어하는 내부 계약이다.
사용자 API가 아니며, Spring Boot Actuator 관리 서버의 `workercontrol` endpoint를 사용한다.

## 노출과 인증

- 경로는 `http://127.0.0.1:8081/actuator/workercontrol`이다. 배포 runner는 대상 EC2에서 실행되어야 한다.
- Compose의 호스트 포트는 `127.0.0.1:8081`에만 게시한다. 공개 API 포트 8080에서는 이 경로를 거부한다.
- `X-Jarihana-Worker-Control-Token` 헤더에 `WORKER_CONTROL_TOKEN` 환경 변수로 주입한 32바이트 이상의 별도 비밀값을 보낸다. 사용자 JWT나 VAPID 값과 공유하지 않는다.
- 제어 endpoint는 `PUSH_WORKER_CONTROL_ENABLED=true`일 때만 등록된다. 현재 Compose/workflow에 이 변수를 전달하는 작업은 S3-03 범위이므로, 그 작업 전에는 실제 배포용 API로 사용할 수 없다.
- 토큰을 URL, 명령행 인자, 로그 또는 JSON 요청 본문에 넣지 않는다. `infra/scripts/deploy/app-operation.py`는 loopback 주소와 허용 명령을 고정하고 토큰을 환경 변수에서 읽는다.

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

예상 상태·대상·기한·revision 충돌은 HTTP 409 `WORKER_CONTROL_CONFLICT`, 잘못된 요청은 HTTP 400,
머신 토큰 누락·오류 또는 공개 포트 접근은 HTTP 403이다. 내부 예외 상세와 비밀값은 응답에 포함하지 않는다.

## 안전 범위

이 API는 현재 EC2 프로세스와 DB의 worker 권한만 제어한다. 다른 서버의 HTTP 트래픽, Nginx, EC2 상태,
15분 관찰, 자동 롤백, 프로세스 종료는 수행하지 않는다. workflow가 같은 명령을 무작정 새 ID로 재시도하면
상태 revision이 바뀌거나 인계 순서가 손상될 수 있으므로, 이후 coordinator는 명령 ID와 배포 상태를 보존해야 한다.
