# 모임 채팅 구현 계약

채팅방은 모임과 일대일이며 현재 GroupMember만 접근한다.
모임 종료 즉시 새 메시지는 금지하고 이력 조회와 읽음 갱신은 허용한다.
새 참여자는 이전 이력을 볼 수 있으며 가입 전 메시지는 미확인 수에서 제외한다.

계정 활성 기준의 채팅 푸시 보류와 상태 저장소 선택은
[백엔드 ADR 0030](../backend/docs/adr/0030-account-activity-and-unlogged-chat-push.md)에 기록한다.
V23에서 `member_activity`만 UNLOGGED로 전환한다. 로컬 적용을 확인했으며 운영 배포는 별도다.
PostgreSQL 비정상 종료 후 재보고 전까지 잠깐 추가 푸시가 갈 수 있다는 영향은 결정자가 수용했다.

## HTTP

기존 `{success,data,error}` envelope를 사용한다. 아래는 data 필드다.
채팅 DTO의 ID와 sequence는 정밀도 보존을 위해 10진수 문자열이다.
시간은 기존 LocalDateTime 계약(Asia/Seoul, offset 없는 ISO 문자열)을 따른다.
메시지 content는 plain text이며 공백만 있는 본문을 거절하고 UTF-16 2,000단위 이하다.
원본 본문을 저장하고 멱등 키의 동일 본문 비교에도 원본을 사용한다.

### GET /api/chats?cursor=&size=20&query=

`{items: Room[], nextCursor: string|null, hasNext: boolean}`

Room:
`{groupId, name, type, description, representativeImageUrl, memberCount, status, latestSequence, lastReadSequence, unreadCount, lastMessage: Message|null, updatedAt}`

status와 type은 기존 Group enum 문자열이다. 빈 방도 포함한다.
representativeImageUrl은 모임 목록과 같은 이미지 공개 접근 URL이며, 대표 이미지가 없으면 `images/default-group.png`다.
API는 모임 생성 시각 내림차순, groupId 내림차순으로 조회하며 커서는 이 고정 정렬 키를 포함한다.
메시지 도착으로 페이지 경계가 바뀌지 않도록 활동 시각은 커서에서 제외한다.
화면은 전체 페이지를 모은 뒤 updatedAt 내림차순, groupId 내림차순으로 정렬한다.
updatedAt은 최근 메시지 시각이며 메시지가 없으면 모임 생성 시각이다.
query는 모임 이름 검색이다. 응답에 전체 메시지 배열은 넣지 않는다.

### GET /api/groups/{groupId}/chat/messages

최초/과거: `?beforeSequence=&size=50`, 이후 복구: `?afterSequence=&size=100`.
before와 after는 동시에 지정할 수 없다. size 최대 100.

`{items: Message[], nextCursor: string|null, hasNext: boolean, latestSequence: string, lastReadSequence: string, status: string}`

items는 항상 sequence 오름차순. 최초는 최신 N건, before는 지정 순번 미만의 최신 N건,
after는 지정 순번 초과의 가장 오래된 N건. nextCursor는 다음 요청에 넣을 sequence 문자열이다.
latestSequence와 items는 같은 DB snapshot을 사용한다. 최초 latestSequence로 동기화 기준을 잡고
이후 복구는 페이지를 끝까지 따라간다. WebSocket 이벤트만으로 누락 구간을 건너뛰지 않는다.

Message:
`{id, groupId, sequence, senderId, author, avatarUrl, clientMessageId, content, createdAt}`

### POST /api/groups/{groupId}/chat/messages

입력 `{clientMessageId: UUID string, content: string}`. 응답 Message.
처음 저장은 201, 동일 (groupId,senderId,clientMessageId)와 동일 본문 재시도는 200.
다른 본문 재사용은 409. 권한 확인 후 멱등 조회를 수행하여 종료 후에도 기존 결과를 재확인할 수 있다.

처음 저장한 메시지는 같은 트랜잭션에서 `CHAT_MESSAGE_RECEIVED` 알림과 푸시 전송 대기를 만든다.
보낸 사람과 서비스 탈퇴 회원을 제외한 현재 모임원에게 메시지당 알림함 기록을 남기고,
그 회원의 활성 `clientVersion=3` 구독마다 푸시를 예약한다. 웹소켓 접속 여부는 수신 조건에 넣지 않는다.
같은 회원이 어느 기기에서든 서비스를 활성 상태로 사용하면 모든 방의 채팅 푸시를 보류한다.
홈·모임 상세에서도 적용하며 그 기기의 푸시 구독·권한은 필요하지 않다. 다른 종류의 알림은 그대로 전송한다.
활성 상태는 로그인, 페이지 표시, 포커스, 최근 5분 이내 사용자 활동을 모두 요구한다.
기존 채팅 WebSocket으로 활성일 때만 10초마다 `/app/presence/active`를 보고하며,
서버가 기록한 마지막 보고는 15초 동안 유효하다. 화면 종료·숨김은 보고만 중단하며 계정 상태를 삭제하지 않는다.
모든 화면의 보고가 멈추고 15초가 지나면 미읽음 채팅 푸시를 다시 판단한다.
보류 중 원본 메시지를 읽었으면 취소하고, 같은 방의 누적 전송은 묶는다. 알림함의 메시지별 기록은 유지한다.
따라서 활성 중 받은 미읽음 메시지도 비활성 전환 후 푸시가 올 수 있다.
보류는 외부 전송 실패 횟수를 소진하지 않으며 기존 전송 유효기간을 연장하지 않는다.
10초 보고가 5초 이상 늦거나 유실되면 사용 중에도 일시적으로 푸시가 나갈 수 있다.
서버가 이미 외부로 보낸 푸시는 상태가 바뀌어도 회수하지 못한다.
같은 요청 재시도는 알림을 추가하지 않으며, 저장 실패 시 메시지·알림·전송 대기가 함께 롤백된다.
실제 외부 전송은 기존 푸시 워커가 커밋 이후 수행한다.
알림 payload는 모임 ID만 포함하며 푸시에 채팅 본문을 표시하지 않는다.
알림 클릭은 본인 알림과 현재 채팅 접근 권한을 확인한 뒤 해당 모임 채팅방으로 연결한다.
버전별 필터링과 구독 호환 규칙은 [알림 API 계약](../backend/docs/context/api/endpoints/notifications.md)을 따른다.

### PUT /api/groups/{groupId}/chat/read

입력 `{lastReadSequence: string}`.
응답 `{groupId: string, lastReadSequence: string, latestSequence: string, unreadCount: number}`.
0 이상 현재 저장된 latestSequence 이하이며 서버 커서는 감소하지 않는다.
unreadCount는 해당 커서 뒤의 다른 사람 메시지만 센다.
latestSequence는 해당 미확인 수를 계산한 DB snapshot의 마지막 순번이다.
클라이언트는 이 기준을 메시지 복구 커서와 분리하여 늦게 도착한 읽음 응답과 새 메시지를 중복 집계하지 않는다.

## WebSocket

인증 쿠키 handshake `/api/ws/chat`; STOMP 구독 `/user/queue/chat-events` 하나.
CONNECT native header `X-XSRF-TOKEN`은 기존 CSRF 쿠키 값을 사용한다.
서버는 인증/Origin/CSRF를 검증한다. SEND는 활성 보고 전용 `/app/presence/active`만 허용한다.
본문은 비우며 회원은 인증된 소켓에서, 시각은 서버의 주입 Clock에서 얻는다. 클라이언트 회원 ID·시각은 사용하지 않는다.
다른 SEND/MESSAGE와 내부 queue/topic 및 다른 사용자 구독은 금지한다.
토큰 만료 때 서버가 연결을 닫고, 클라이언트는 기존 HTTP 갱신 흐름 후 재연결한다.

Event 공통 `{version:1, type, groupId?:string, message?:Message, lastReadSequence?:string, latestSequence?:string, unreadCount?:number}`.

- MESSAGE_CREATED: groupId, message. 현재 모임 참여자의 로컬 접속 세션들.
- ROOM_CLOSED: groupId. 현재 모임 참여자의 로컬 접속 세션들.
- ROOM_REMOVED: groupId. 삭제 직전 참여자의 로컬 접속 세션들.
- READ_STATE_UPDATED: groupId, lastReadSequence, latestSequence, unreadCount. 해당 사용자 본인의 세션만.
- RESYNC_REQUIRED: 추가 필드 없음. listener 연결 복구 때 해당 서버 접속자.

모든 서버는 같은 PostgreSQL LISTEN 채널의 알림을 처리한다. 메시지/읽음/종료/삭제 쓰기와
pg_notify는 동일 트랜잭션이며 커밋 후 전달된다. 메시지 원문을 NOTIFY에 넣지 않는다.
삭제 이벤트는 사용자별 작은 알림으로 발행하여 삭제 후에도 대상 식별과 payload 크기를 보장한다.
현재 참여자 ID를 묶어 조회하고 로컬 SimpUserRegistry.getUser(memberId 문자열)가 있는 사용자에게만
convertAndSendToUser를 호출한다. 분산 사용자 registry/미해결 destination broadcast는 사용하지 않는다.

## 복구와 화면

기존 채팅 시안의 underline 입력, 기본 목록 너비, 드래그/키보드 너비 조절과 모바일 전환을 보존한다.
헤더·모임 상세 사이드바에서 현재 페이지 위의 모달로 연다. 좁은 화면에서는 상세의 모집 정보 액션 영역에 진입점을 둔다. `chat=inbox|모임ID` 쿼리로 상태를 표현하고 배경 페이지의 검색 조건과 스크롤을 유지한다. 데스크톱은 중앙 모달, 모바일은 전체 화면이다. 기존 `/chat`, `/chat/:roomId`는 `/home` 위의 모달로 연결한다.
실제 로그인 사용자의 ID로 mine을 판단한다. 메시지 ID로 병합하고 clientMessageId로 낙관적 항목을 치환한다.
전송 실패 시 원문과 키를 유지하여 동일 요청을 재시도한다.
구독 직후/재연결/online/탭 활성화와 활성 화면 30초 주기로 목록과 열린 방의 이후 메시지를 동기화한다.
로그인 세션당 하나의 웹소켓을 헤더와 채팅 모달이 공유한다. 모달이 닫혀 있어도 수신·읽음 이벤트로 헤더 미읽음 합계를 즉시 갱신하며, 모달과 방 전환은 연결을 재생성하지 않는다.
READ는 활성 방에서 실제 최신 메시지가 표시된 경우에만 갱신한다. 배경 수신으로 읽지 않는다.
로그아웃과 계정 변경 시 연결·채팅 캐시를 정리한다.

계정 활성 보고는 연결 유지용 heartbeat 및 메시지 복구와 별개다. 최초 진입과 활성 화면 복귀,
마우스 이동·클릭·키보드 입력·스크롤·터치를 로컬 활동으로 기록한다. 마우스 이동의 시각 갱신은 1초 간격으로 제한한다.
사용자 스크롤은 휠·터치·키보드·마우스 입력으로 감지한다. 새 메시지 자동 스크롤이나 레이아웃 변경에 따른 `scroll` 이벤트만으로는 활동 시각을 갱신하지 않는다.
활동 이벤트마다 서버에 보내지 않는다. 숨김·포커스 해제·5분 무활동이면 보고를 중단하고,
활동 재개 시 조건을 확인해 즉시 보고한다. 매 전송 직전에 조건을 다시 검사한다.
소켓 재연결은 활동 시각을 갱신하지 않으며 현재 활성일 때만 보고한다. 끊긴 동안의 신호는 저장하거나 재전송하지 않는다.
백그라운드에서도 배지 수신 연결은 유지한다. 활성 신호·배지 수신은 읽음으로 처리하지 않는다.

## 정합성 검증

메시지 저장과 방 종료/삭제는 같은 group 행 잠금 순서를 지킨다.
순번·멱등·LISTEN/NOTIFY는 실제 PostgreSQL로 검증한다. 운영 배포는 이 구현 작업에 포함하지 않는다.
