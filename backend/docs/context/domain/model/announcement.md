# Announcement

모임장은 활동 중인 모임에 제목과 일반 텍스트 본문을 가진 공지를 등록한다. 공지는 모임 상세의 공지 탭에서 최신순으로 조회한다.

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 공지 식별자 |
| `groupId` | Long | NOT NULL, FK, 모임 삭제 시 cascade | 공지를 소유한 모임 |
| `authorMemberId` | Long | NOT NULL, FK | 등록 당시 모임장 |
| `title` | String | NOT NULL, 1~100자 | 공지 제목 |
| `content` | String | NOT NULL, 1~10,000자 | 일반 텍스트 본문 |
| `scope` | enum | NOT NULL, `MEMBERS` 또는 `PUBLIC` | 조회할 수 있는 사용자 범위 |
| `createdAt` | LocalDateTime | NOT NULL | 등록 시각이며 목록 정렬에 사용한다 |
| `updatedAt` | LocalDateTime | NOT NULL | 공통 감사 필드 |
| `deletedAt` | LocalDateTime | NULL | 숨긴 시각. 목록·상세 조회에서는 제외한다 |

## 권한과 생명주기

- 현재 `GroupMember.role = LEADER`인 회원만 `ACTIVE` 모임에 등록할 수 있다. 모임 종료와 등록이 겹치지 않도록 모임 행 잠금 안에서 상태를 확인한다.
- 현재 모임장 또는 해당 공지 작성자는 `ACTIVE` 모임에서 공지를 수정하거나 숨길 수 있다. 관리 권한 확인과 변경도 모임 행 잠금 안에서 처리한다.
- `MEMBERS` 공지는 현재 `GroupMember`와 해당 공지의 작성자에게 노출한다. 작성자는 탈퇴 후에도 본인이 작성한 공지를 확인해 관리할 수 있다.
- `PUBLIC` 공지는 비로그인 방문자를 포함해 누구나 읽을 수 있다.
- 모임 종료 후 기존 공지는 읽을 수 있고 등록·수정·삭제는 거부한다.
- 공지 삭제는 소프트 삭제다. 알림함과 푸시 전송 이력은 유지하고, 공지 목록·상세에서는 숨긴다.
- 모임 hard delete 때 공지도 FK cascade로 물리 삭제한다.

## 조회

- 목록 정렬은 `createdAt DESC, id DESC`이며 커서 기반 페이지네이션을 사용한다.
- 비구성원은 `PUBLIC` 행만 조회한다. 상세에서 `MEMBERS` 공지를 요청한 비구성원에게는 공지 존재 여부를 숨겨 `ANNOUNCEMENT_NOT_FOUND`를 반환한다.
- 목록에는 제목·공개 범위·작성자 닉네임·등록 시각을 제공하고, 본문은 상세에서만 제공한다.
- 공개 범위에 따라 응답이 달라지므로 목록과 상세 API는 `Cache-Control: no-store`를 사용한다.

## 등록 알림

공지 등록은 `AnnouncementCreatedEvent`를 발행한다. BEFORE_COMMIT 알림 리스너가 같은 트랜잭션에서 작성자를 제외한 모든 현재 구성원의 알림함 행을 만들고, 당시 공지 지원 버전(`clientVersion=2`)의 활성 브라우저 구독별 `NotificationDelivery`를 만든다. 구독이 없어도 알림함 행은 저장하며, 나중에 구독한 브라우저에 과거 공지를 다시 보내지 않는다.

## 스키마 적용

공지는 회원 소속 V11과 구독 지원 V12 이후의 `V13__group_announcements.sql`로 추가한다.
소프트 삭제 필드는 `V18__announcement_soft_delete.sql`로 추가하며 기존 앱의 INSERT가 계속 동작하도록 nullable로 둔다.
기존 촬영용 공지 V9 적용 DB의 데이터 보존과 이력 정정은
[모임 공지 마이그레이션 적용](../../../operations/announcement-migration-rollout.md)을 따른다.
