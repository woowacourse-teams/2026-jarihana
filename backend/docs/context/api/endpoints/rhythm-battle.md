# 행성이의 리듬 작살 1:1 대전

[API 공통 설계](../common-contract.md), [API 문서화 컨벤션](../../../conventions/api.md),
[1:1 대전 모델](../../domain/model/rhythm-battle.md)을 따른다.
실제 계약은 Controller, 요청/응답 DTO, ErrorCode와 인수 테스트(`RhythmBattleAcceptanceTest`, `RhythmBattleStreamTest`)를 기준으로 한다.

## 공통 규칙

- 아래 경로는 `/api`를 포함한 외부 경로이며 모두 `MEMBER` 권한이다. 회원 ID는 인증 정보에서 정한다.
- 변경 요청은 `XSRF-TOKEN` 쿠키와 `X-XSRF-TOKEN` 헤더를 검증한다.
- 한 회원은 한 번에 한 방에만 앉는다. 이미 앉은 방이 있으면 방 만들기와 참가가 `RHYTHM_BATTLE_CONFLICT`다.
- 방 조회, 채팅, 실시간 연결은 그 방의 참가자만 쓸 수 있다. 참가자가 아니면 `ACCESS_DENIED`다.
- `level`은 랭킹 도전과 같은 `EASY`, `MEDIUM`, `HARD`, `HARDEST`, `ANOTHER_HARD`, `ANOTHER_HARDEST`다.
- 시각 필드(`serverNow`, `startsAt`)는 epoch 밀리초다. 입력 시각과 진행 시각(`at`, `playedUntil`, `outAt`)은 공통 시작 시각을 곡 시작으로 한 초다.
- 판이 끝난 뒤 도착한 입력 묶음과 기권은 오류 대신 현재 상태를 `200 OK`로 돌려준다. 클라이언트는 응답의 `roomStatus`로 분기한다.

## API 목록

| Method | 경로 | 권한 | 성공 |
| --- | --- | --- | --- |
| `GET` | `/api/games/rhythm-battle/rooms` | `MEMBER` | `200 OK`, 상대를 기다리는 공개 방 커서 목록 |
| `GET` | `/api/games/rhythm-battle/rooms/me` | `MEMBER` | `200 OK`, 내가 앉은 방 ID(없으면 `null`) |
| `POST` | `/api/games/rhythm-battle/rooms` | `MEMBER` | `201 Created`, 방 ID |
| `POST` | `/api/games/rhythm-battle/rooms/{id}/join` | `MEMBER + 공개 방 또는 초대 토큰` | `200 OK`, 방 ID |
| `GET` | `/api/games/rhythm-battle/rooms/{id}` | `MEMBER + 참가자` | `200 OK`, 방과 지금 판의 모습 |
| `PUT` | `/api/games/rhythm-battle/rooms/{id}/ready` | `MEMBER + 참가자` | `200 OK`, 방 ID |
| `POST` | `/api/games/rhythm-battle/rooms/{id}/start` | `MEMBER + 방장` | `200 OK`, 방 ID |
| `POST` | `/api/games/rhythm-battle/rooms/{id}/batches` | `MEMBER + 참가자` | `200 OK`, 내 판의 서버 계산 결과 |
| `POST` | `/api/games/rhythm-battle/rooms/{id}/forfeit` | `MEMBER + 참가자` | `200 OK`, 내 판의 서버 계산 결과 |
| `POST` | `/api/games/rhythm-battle/rooms/{id}/leave` | `MEMBER + 참가자` | `200 OK`, 방 ID |
| `POST` | `/api/games/rhythm-battle/rooms/{id}/invite` | `MEMBER + 대기방 참가자` | `200 OK`, 초대 토큰 |
| `GET` | `/api/games/rhythm-battle/invitations/{token}` | `MEMBER` | `200 OK`, 초대한 방 미리보기 |
| `GET` | `/api/games/rhythm-battle/rooms/{id}/chat/messages` | `MEMBER + 참가자` | `200 OK`, 최근 채팅 |
| `POST` | `/api/games/rhythm-battle/rooms/{id}/chat/messages` | `MEMBER + 참가자` | `201 Created`, 저장한 채팅 |
| `GET` | `/api/games/rhythm-battle/rooms/{id}/events` | `MEMBER + 참가자` | SSE 연결 |
| `GET` | `/api/games/rhythm-battle/ranking` | `MEMBER` | `200 OK`, 승수 랭킹 커서 목록과 내 순위 |
| `GET` | `/api/games/rhythm-battle/history/me/summary` | `MEMBER` | `200 OK`, 내 승/패/무 |

## 방 응답

`GET /rooms/{id}`와 SSE `snapshot` 이벤트는 같은 형식이다.

| 필드 | 설명 |
| --- | --- |
| `id`, `revision` | 방 ID와 상태 판본. 클라이언트는 더 큰 `revision`만 받는다. |
| `serverNow` | 응답을 만든 서버 시각. 클라이언트는 이 값으로 시계 차이를 구해 공통 시작 시각에 음악을 맞춘다. |
| `status` | `WAITING`, `PLAYING`, `FINISHED`, `CLOSED` |
| `visibility`, `level`, `chartVersion` | 공개 여부, 방장이 고른 난이도와 그 난이도가 치는 채보 판본 |
| `gameNumber`, `seed`, `startsAt` | 마지막으로 시작한 판 번호(시작 전 0), 방향 섞기 시드, 공통 시작 시각(진행 중이 아니면 `null`) |
| `host`, `guest` | `{ memberId, name, avatarUrl, ready, scrollSpeed }`. 상대가 없으면 `guest`는 `null` |
| `winnerMemberId`, `endReason` | 마지막 판의 승자와 끝난 이유(`ELIMINATED`, `FORFEIT`, `DRAW`). 무승부면 승자는 `null` |
| `runs` | 지금 판의 두 사람 진행. 점수, 라이프, 콤보, 판정별 수, `status`(`PLAYING`, `OUT`), `outReason`, `outAt`, `playedUntil`, `lastSequence`, `scrollSpeed` |

## 엔드포인트 상세

### 방 만들기와 참가

방 만들기 요청은 `{ "visibility": "PUBLIC", "level": "HARD" }`이다. 만든 회원이 방장이 된다.
참가 요청은 공개 방이면 `{}`, 초대 전용 방이면 `{ "token": "..." }`이다. 이미 그 방에 앉아 있으면 그대로 성공한다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 공개 여부나 난이도 누락 | `INVALID_PARAMETER` | 400 |
| 초대 전용 방에 토큰 없이 참가 | `ACCESS_DENIED` | 403 |
| 다른 방에 이미 앉아 있음, 대기 중이 아닌 방, 자리가 찬 방 | `RHYTHM_BATTLE_CONFLICT` | 409 |

### 준비와 시작

준비 요청은 `{ "ready": true, "gameNumber": 1, "scrollSpeed": 1.5 }`이다. `gameNumber`는 준비할 다음 판 번호(`gameNumber + 1`)다.
`scrollSpeed`는 내 화면의 세균 이동 배속이며 1.0부터 3.0까지 0.25 단위다. 배속은 보이는 속도만 바꾸고 판정에는 영향이 없다.
시작 요청은 `{ "gameNumber": 1 }`이며 방장만 보낸다. 서버는 새 시드를 정하고 공통 시작 시각을 요청 시각 5초 뒤로 정한다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 배속 범위나 단위 위반 | `INVALID_PARAMETER` | 400 |
| 방장이 아닌 참가자의 시작 | `ACCESS_DENIED` | 403 |
| 상대가 없음, 두 사람 중 한 명이라도 준비 전, 진행 중인 방, 지난 판 번호 | `RHYTHM_BATTLE_CONFLICT` | 409 |

### 입력 묶음

요청 본문은 다음과 같다. 화면은 0.5초마다 보낸다. 시각은 입력 지연 보정을 적용한 값이고 `lane`은 left, down, right, up 순서의 순번이다.

```json
{
  "gameNumber": 1,
  "sequence": 3,
  "playedUntil": 1.52,
  "inputs": [{ "lane": 0, "at": 1.118 }],
  "finished": false
}
```

- 서버는 랭킹 도전과 같은 엔진으로 같은 시드의 판을 다시 계산한다. 라이프를 모두 잃은 판은 `OUT(ELIMINATED)`이며 `outAt`은 마지막 세균을 놓친 시각이다.
- 같은 순번을 다시 보내거나, 이미 끝난 내 판이나 끝난 방에 보내면 계산하지 않고 현재 상태를 돌려준다.
- 진행 시각이 공통 시작 시각부터 지난 시간보다 3초 넘게 앞서면 `CLOCK_AHEAD`, 15초 넘게 늦으면 `LAGGED`로 기권 처리한다.
- 계산할 때마다 승패를 다시 판정한다. 판이 끝나면 방은 `FINISHED`가 되고 대전 기록이 남는다.

응답은 `{ gameNumber, status, outReason, outAt, playedUntil, score, combo, lives, roomStatus, winnerMemberId, endReason }`이다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 무한대 시각, 앞선 묶음보다 이른 진행 시각, 순서가 뒤집힌 입력, 400개 초과 | `INVALID_PARAMETER` | 400 |
| 지난 판 번호, 순번 건너뛰기, 시작 뒤 규칙 판본 변경 | `RHYTHM_BATTLE_CONFLICT` | 409 |

### 기권과 나가기

기권 요청은 `{ "gameNumber": 1 }`이다. 내 판을 `OUT(ABANDONED)`로 끝내고 승패를 판정한다.
진행 중에 나가기를 보내면 먼저 기권으로 판을 끝낸 뒤 나간다. 대기 중에 손님이 나가면 자리만 비우고,
방장이 나가거나 판이 끝난 뒤 누가 나가면 방을 닫는다(`CLOSED`). 두 사람의 좌석은 방이 닫힐 때 풀린다.

### 초대

대기 중인 방의 참가자가 초대 토큰을 받는다. 다시 요청하면 새 토큰으로 바뀌고 이전 토큰은 쓸 수 없다.
`GET /invitations/{token}`은 `{ roomId, hostName, level, status, joinable }`을 돌려준다. 맞는 방이 없으면 `RHYTHM_BATTLE_NOT_FOUND`다.

### 채팅

요청 본문은 `{ "clientMessageId": "UUID", "body": "한 판 해요" }`이다. 본문은 앞뒤 공백을 지운 뒤 1자 이상 300자 이하다.
같은 `clientMessageId`로 다시 보내면 새로 저장하지 않고 처음 저장한 메시지를 돌려준다. 닫힌 방에는 보낼 수 없다(`RHYTHM_BATTLE_CONFLICT`).
`GET` 응답은 `{ items: [{ id, memberId, senderName, body, clientMessageId, createdAt }] }`이며 방에 들어온 뒤의 최근 100개를 오래된 순으로 준다.

### 실시간 연결

`text/event-stream`으로 다음 이벤트를 보낸다. 서버는 0.25초마다 방의 `revision`과 최신 채팅 ID를 확인하고 바뀐 것만 보낸다.

| 이벤트 | 내용 |
| --- | --- |
| `snapshot` | 방 응답과 같은 형식 |
| `batches` | `{ gameNumber, items: [{ id, memberId, sequence, playedUntil, inputs: [[lane, at]] }] }`. 지금 판에서 새로 저장된 두 사람의 입력 묶음. 화면은 상대 묶음으로 상대 판을 다시 그린다. |
| `chat` | `{ items: [...] }`. 채팅 응답과 같은 항목 |

처음 연결하면 지금 모습, 지금 판의 묶음 전체, 최근 채팅을 먼저 보낸다. 방이 닫히면 마지막 `snapshot`을 보내고 연결을 닫는다.
연결이 많으면 `RHYTHM_BATTLE_STREAM_BUSY`(503)로 거절하며 클라이언트는 잠시 뒤 다시 연결한다.

### 랭킹과 전적

랭킹은 끝난 판의 승수가 많은 순이며, 승수가 같으면 판 수가 적은 순, 회원 ID 순이다. 커서는 응답의 `nextCursor`를 그대로 보낸다.
응답 항목은 `{ rank, memberId, name, avatarUrl, wins, losses, draws, total }`이며 `me`는 내 순위(판이 없으면 `null`)다.
`history/me/summary`는 `{ total, wins, losses, draws }`다.

## 시간 제한

- 진행 중인 판에서 30초 동안 입력 묶음이 오지 않으면 `STALE`로 기권 처리한다.
- 대기 중이거나 판이 끝난 방에 30분 동안 활동(준비, 채팅 등)이 없으면 방을 닫는다.
- 두 처리는 `rhythm-battle.expiry.enabled`가 켜진 서버에서 1초마다 실행한다.
