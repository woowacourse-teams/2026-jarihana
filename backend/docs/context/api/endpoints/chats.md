# 모임 채팅 API

필드별 정식 계약은 [공통 구현 계약](../../../../../docs/chat-implementation-contract.md)을 따른다.
모든 API는 인증 쿠키와 현재 GroupMember를 요구하며 승인 대기자는 접근할 수 없다.
HTTP 응답은 기존 success/data/error 봉투다. ID와 순번은 10진수 문자열이다.

| 메서드 | 경로 | 성공 |
| --- | --- | --- |
| GET | /api/chats?cursor=&size=20&query= | items / nextCursor / hasNext |
| GET | /api/groups/{groupId}/chat/messages?beforeSequence=&size=50 | 오름차순 items와 snapshot 순번 |
| GET | /api/groups/{groupId}/chat/messages?afterSequence=&size=100 | 순번 이후 가장 오래된 페이지 |
| POST | /api/groups/{groupId}/chat/messages | 신규 201 / 동일 요청 200 |
| PUT | /api/groups/{groupId}/chat/read | groupId / lastReadSequence / latestSequence / unreadCount |

size 범위는 1~100이다. beforeSequence와 afterSequence를 동시에 지정하면 400이다.
목록 커서는 모임 생성 시각과 groupId를 인코딩한다. 새 메시지가 와도 조회 중인 페이지 경계는 유지된다.
화면은 모든 페이지를 모은 뒤 응답의 updatedAt과 groupId로 최근 활동순으로 정렬한다.
검색은 모임 이름의 부분 일치다.
시간은 Asia/Seoul 기준 LocalDateTime이다. 빈 방의 활동 시각은 모임 생성 시각이다.
각 목록 항목의 `representativeImageUrl`은 모임 목록과 동일한 이미지 공개 접근 URL이다.
대표 이미지가 없으면 `images/default-group.png`를 반환하며, 업로드 이미지는 기존 이미지 접근·서명 전달 경로를 이용한다.

메시지의 `avatarUrl`은 작성자의 GitHub 프로필 이미지 URL이며 이력, 전송 응답, 목록의 마지막 메시지와 실시간 이벤트에 동일하게 포함된다.

POST는 clientMessageId(UUID), content를 받는다. 원문을 보존하며 공백 본문과 UTF-16 2,000단위 초과는 400이다.
동일 키의 다른 본문은 CONCURRENT_MODIFICATION 409, 종료 후 새 메시지는 GROUP_ENDED 409다.
현재 소속이 없거나 모임이 삭제되면 GROUP_ACCESS_DENIED 403이다.
읽음 입력은 lastReadSequence 문자열이며 0 이상 최신 저장 순번 이하만 허용한다.
지난 커서로 갱신해도 서버 커서는 감소하지 않는다.
읽음 응답과 READ_STATE_UPDATED의 latestSequence는 unreadCount와 동일한 DB 스냅샷의 상한이다.
클라이언트는 이 순번 이하의 메시지를 다시 미읽음 수에 더하지 않는다.

WebSocket handshake는 /api/ws/chat이며 STOMP CONNECT의 X-XSRF-TOKEN에 CSRF 쿠키를 보낸다.
구독은 /user/queue/chat-events 하나다. 사용자 prefix에 회원 ID를 클라이언트가 붙이지 않는다.
MESSAGE_CREATED, ROOM_CLOSED, ROOM_REMOVED, READ_STATE_UPDATED, RESYNC_REQUIRED의 version은 1이다.
메시지 전송은 REST만 사용한다. 실제 서버 수신 보장은 저장 이력과 catch-up으로 확인한다.

검증: ChatAcceptanceTest, ChatPersistenceTest, ChatWebSocketTest.
