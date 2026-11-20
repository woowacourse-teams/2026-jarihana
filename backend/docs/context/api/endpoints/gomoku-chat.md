# 오목 게임방 채팅

[오목 계약](gomoku.md), [API 공통 계약](../common-contract.md)을 따른다.
실제 계약은 Controller/DTO와 `GomokuChatAcceptanceTest`를 기준으로 확인한다.

## 권한과 수명

- `GOMOKU_CHAT_ENABLED`는 기본 false다. 비활성일 때 회원 요청에 `404 GOMOKU_CHAT_DISABLED`를 반환한다.
- 모임 소속과 독립적이다. 참가자는 `gomoku_seat`과 게임방의 현재 참가자를 확인하고, 관전자는 [관전 계약](gomoku-observation.md)의 본인 활성 입장을 확인한다.
- 대기, 대국, 결과와 재대결 중 사용할 수 있다. 재대결은 참가 회차와 대화를 초기화하지 않는다.
- 참가 시 최신 순번을 `chat_start_sequence`에 기록한다. 해당 순번 이하의 메시지는 API에서 제외한다. 대기 중 상대가 교체되어도 남아 있는 참가자의 기존 기록은 유지한다.
- 실제 퇴장과 재입장은 새 `participationId`를 발급한다. 다른 회차의 요청은 거절한다. 새로고침, SSE 재연결과 대기실 화면 이동은 회차를 바꾸지 않는다.
- 종료와 메시지 삭제는 같은 트랜잭션이다. 방의 순번 메타데이터는 남기지만 메시지 본문은 물리 삭제하며 종료 후 조회는 불가하다. DB 백업에서의 소급 삭제는 제공하지 않는다.

## GET /api/games/gomoku/rooms/{roomId}/chat/messages

인증 쿠키를 사용한다. 성공은 `200 OK`, 공통 `success/data/error` 봉투와 `Cache-Control: no-store`다.

| Query | 규칙 |
| --- | --- |
| participationId | 참가자의 최초 조회는 생략 가능하며 관전자는 최초부터 필수. 이후 요청에는 최초 응답의 UUID를 전달한다. 현재 참가 회차와 다르면 409 |
| beforeSequence | 지정 순번 미만의 최신 N건. 1 이상이며 afterSequence와 동시 지정 불가 |
| afterSequence | 지정 순번 초과의 가장 오래된 N건. 0 이상이며 beforeSequence와 동시 지정 불가 |
| size | 기본 50, 1~100 |

최초는 최신 N건이며 모든 `items`는 순번 오름차순이다. 커서를 조작하거나 회차를 생략해도 서버의 입장 순번 제한을 넘을 수 없다.

```json
{
  "participationId": "a25f96b4-17c3-4ea6-a95f-e721d91ab753",
  "latestSequence": "12",
  "items": [
    {
      "id": "20",
      "sequence": "12",
      "senderId": "3",
      "clientMessageId": "6d1a3754-dea4-4d86-8431-4b03273c7c66",
      "author": "가온",
      "senderRole": "PARTICIPANT",
      "content": "좋은 대국 해요!",
      "createdAt": "2026-11-05T12:00:00"
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

`latestSequence`와 메시지는 같은 PostgreSQL REPEATABLE READ snapshot에서 조회한다.
첫 조회의 latestSequence를 복구 기준으로 삼고, 이후에는 afterSequence의 모든 페이지를 따라간다.
hasNext가 true면 nextCursor를 같은 방향의 요청에 사용한다.

## POST /api/games/gomoku/rooms/{roomId}/chat/messages

인증 쿠키, CSRF 쿠키와 `X-XSRF-TOKEN` 헤더를 사용한다.

```json
{
  "participationId": "a25f96b4-17c3-4ea6-a95f-e721d91ab753",
  "clientMessageId": "6d1a3754-dea4-4d86-8431-4b03273c7c66",
  "content": "좋은 대국 해요!"
}
```

- 두 UUID는 필수다. 발신자 ID, 이름과 역할은 서버가 현재 참가/관전 정보에서 결정한다. senderRole은 PARTICIPANT 또는 SPECTATOR이며 클라이언트 입력으로 정하지 않는다. 기존 메시지는 PARTICIPANT다.
- 본문은 공백만 있으면 거절하며 Java String.length/UTF-16 기준 최대 2,000이다. 원문을 저장하고 HTML로 해석하지 않는다.
- 신규 저장은 `201 Created`, 동일 `(roomId, participationId, clientMessageId)`와 동일 원문 재시도는 `200 OK`다. 응답 data는 위 Message와 같다. 다른 원문으로 같은 키를 사용하면 409다.
- 참가 자격과 회차를 확인한 후 멱등 키를 조회한다. 퇴장한 사람은 과거 결과도 재조회할 수 없다.
- 게임방 잠금 아래 순번, 메시지와 활동 시각을 함께 저장한다. 실패하면 함께 롤백한다.
- 참가자의 새 메시지만 30분 활동 기한을 갱신한다. 관전자 메시지는 활동 시각도 변경하지 않는다. 판 revision, 착수 수, 차례 기한과 준비 상태는 바꾸지 않는다. 조회와 중복 재시도는 활동 기한도 바꾸지 않는다.
- 이미 만료된 판/방에는 만료 처리를 커밋하고 409를 반환한다. 시간패 후 결과 상태에서는 최신 상태를 확인한 뒤 재시도할 수 있다.

## 기존 SSE의 chat_changed

게임방 `/events` 연결 하나에 기존 snapshot과 다음 named event를 함께 전달한다.

```text
event: chat_changed
data: {"participationId":"a25f96b4-17c3-4ea6-a95f-e721d91ab753","latestSequence":"12"}
```

- 메시지 본문과 발신자 정보는 이벤트에 넣지 않는다. 최초 연결과 순번 변경에 알린다.
- 구독 서버가 500ms마다 방별로 변경을 확인한다. 같은 방 연결들의 조회를 공유하며, 별도 서버에서 커밋한 메시지도 감지한다.
- 참가 회차는 연결 시 고정한다. 자격 회수/회차 변경과 토큰 만료 시 닫는다.
- 채팅 순번은 판 revision과 독립적이다. chat_changed는 SSE id를 별도로 지정하지 않으며 Last-Event-ID를 메시지 복구 커서로 사용하지 않는다.
- 채팅 알림 조회 실패는 해당 회차 알림을 건너뛰고 다음 주기에 재시도한다. 최초 연결 준비 중 실패는 연결을 재시도한다. 메시지 REST 복구는 SSE 재연결, online과 화면 활성 복귀 시에도 수행한다.

## 오류

| 상황 | HTTP / code |
| --- | --- |
| 비인증 | 401 / UNAUTHENTICATED |
| CSRF, 현재 참가 자격 없음, 종료된 방 | 403 / ACCESS_DENIED 또는 보안 계층의 CSRF 거절 |
| 채팅 비활성 | 404 / GOMOKU_CHAT_DISABLED |
| 전송 대상 방 없음 | 404 / GOMOKU_NOT_FOUND |
| UUID/순번/크기/본문 형식 오류 | 400 / INVALID_PARAMETER |
| 회차 불일치 | 409 / GOMOKU_CHAT_PARTICIPATION_CHANGED |
| 조회 시 유휴 기한 만료 | 409 / GOMOKU_CHAT_CLOSED |
| 멱등 키 본문 불일치, 전송 시 만료 처리 | 409 / GOMOKU_CONFLICT |

읽기 대상이 없거나 참가 자격이 없으면 구분하지 않고 403으로 처리한다.
운영 활성화와 롤백은 [운영 가이드](../../../operations/gomoku-chat.md)를 따른다.
