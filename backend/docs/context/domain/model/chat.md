# 모임 채팅

모임 하나에 방 하나이며 외부 방 식별자는 groupId다. 현재 소속만 접근한다.
빈 방 조회는 영속 행을 만들지 않는다.

- chat_room: group_id PK/FK, last_sequence
- chat_message: id, group_id, sequence, sender_id, client_message_id, content, created_at
- chat_read_state: (group_id, member_id) PK, last_read_sequence

(group_id, sequence), (group_id, sender_id, client_message_id)는 유일하다.
DB 순번은 커밋된 방 쓰기 순서다. 메시지와 순번 변경은 함께 롤백된다.
본문은 원본 plain text이며 화면 HTML로 해석하지 않는다.

기존 회원의 읽음 기준은 0, 신규 소속의 읽음 기준은 가입 트랜잭션 시점의 마지막 순번이다.
본인이 보낸 메시지는 unread에 포함하지 않는다.
종료 뒤 이력 조회와 읽음 갱신은 가능하고 신규 쓰기만 차단한다.
모임 물리 삭제 시 관련 채팅 행도 물리 삭제한다.
회원 탈퇴 익명화·보관 기한과 탈퇴/강퇴 API는 별도 결정 대상이다.

[API](../../api/endpoints/chats.md), [백엔드 ADR 0028](../../../adr/0028-durable-group-chat-and-postgres-notify.md)
