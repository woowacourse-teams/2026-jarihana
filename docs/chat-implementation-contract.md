# 모임 채팅 구현 계약

채팅방은 모임과 일대일이며 현재 GroupMember만 접근한다.
모임 종료 즉시 새 메시지는 금지하고 이력 조회와 읽음 갱신은 허용한다.
새 참여자는 이전 이력을 볼 수 있으며 가입 전 메시지는 미확인 수에서 제외한다.

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
서버는 인증/Origin/CSRF를 검증한다. SEND/MESSAGE는 금지하며 내부 queue/topic 및 다른 사용자 구독도 금지한다.
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

## 정합성 검증

메시지 저장과 방 종료/삭제는 같은 group 행 잠금 순서를 지킨다.
순번·멱등·LISTEN/NOTIFY는 실제 PostgreSQL로 검증한다. 운영 배포는 이 구현 작업에 포함하지 않는다.
