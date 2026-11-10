# 모임 공지

모임장은 활동 중인 모임에 제목과 일반 텍스트 본문을 가진 공지를 등록한다. 모임장 또는 작성자는 공지를 수정하거나 숨길 수 있다. 공지는 모임 상세의 공지 탭에서 최신순으로 조회한다.

## 공통 규칙

- 읽기는 `PUBLIC`이며, 비로그인 방문자도 `PUBLIC` 공지를 읽을 수 있다.
- `MEMBERS` 공지는 해당 모임의 현재 구성원과 공지 작성자에게 보인다. 다른 비구성원이나 비로그인 방문자가 비공개 공지의 ID를 알아도 상세 API는 `ANNOUNCEMENT_NOT_FOUND`로 응답한다.
- 읽기 응답은 요청 회원의 구성원 여부에 따라 달라지므로 `Cache-Control: no-store`를 적용한다.
- `scope` 값은 `MEMBERS`, `PUBLIC`이다.
- 제목은 공백을 제거한 뒤 1~100자, 본문은 공백을 제거한 뒤 1~10,000자다. 본문은 Markdown을 해석하지 않는 일반 텍스트다.
- 모임이 종료된 뒤에도 기존 공지는 읽을 수 있지만, 종료된 모임에는 새 공지를 등록할 수 없다.
- 수정·삭제 권한은 현재 모임장 또는 공지 작성자에게 있다. 두 작업은 활동 중인 모임에서만 가능하다.
- 삭제는 소프트 삭제이며 알림 이력은 유지한다. 숨긴 공지는 목록과 상세 응답에서 제외한다.
- 모임이 물리 삭제되면 공지도 물리 삭제된다.

## 등록

### `POST /api/groups/{groupId}/announcements`

- 권한: `LEADER`
- 설명: 활동 중인 모임에 공지를 등록하고 현재 구성원에게 알림함 기록을 만든다. 작성자 자신은 수신 대상에서 제외한다. 공지 지원 버전(`clientVersion=2`)의 활성 브라우저 푸시 구독에만 Web Push 전송 대기를 만든다.
- 요청:

```json
{
  "title": "이번 주 모임 안내",
  "content": "토요일 오후 2시에 만나요.",
  "scope": "MEMBERS",
  "requestId": "b8f8b592-3303-4f2b-a3bd-1293f7945894"
}
```

- 응답: `201 Created`, `data: { "id": 101 }`.
- `requestId`는 선택 UUID다. 등록 권한을 다시 확인한 뒤, 같은 모임과 작성자가 같은 ID로 최초 요청의 제목, 내용, 공개 범위를 다시 보내면 공지가 수정됐더라도 기존 공지 ID와 `201`을 반환한다. 공지 저장과 등록 이벤트 발행은 최초 요청에만 실행한다. 최초 요청과 내용이 다르면 `409 ANNOUNCEMENT_REQUEST_CONFLICT`를 반환한다. 최초 요청 지문을 기록하기 전에 저장한 공지는 현재 제목, 내용, 공개 범위로 비교한다. ID를 생략하면 새 등록으로 처리한다.
- 저장과 알림함 기록, 구독별 전송 대기는 같은 트랜잭션에서 처리한다. 푸시 구독이 없는 구성원도 알림함에서 공지를 확인할 수 있다.

## 수정

### `PUT /api/groups/{groupId}/announcements/{announcementId}`

- 권한: 현재 모임장 또는 해당 공지 작성자
- 설명: 제목, 본문, 공개 범위를 모두 교체한다. 종료된 모임, 숨긴 공지, 다른 모임의 공지는 수정할 수 없다.
- 요청에는 `title`, `content`, `scope`를 넣는다.
- 응답: `200 OK`, `data: null`.
- 수정 시 알림함 기록이나 푸시 알림을 새로 만들지 않는다.

## 삭제

### `DELETE /api/groups/{groupId}/announcements/{announcementId}`

- 권한: 현재 모임장 또는 해당 공지 작성자
- 설명: 공지에 `deletedAt`을 기록해 숨긴다. 목록과 상세에서 즉시 제외하며 기존 알림과 전송 이력은 유지한다.
- 응답: `204 No Content`.
- 이전 버전은 `deleted_at`을 조회 조건에 사용하지 않으므로, 숨김 데이터가 생긴 뒤 이전 앱으로 롤백하면 해당 공지가 다시 보일 수 있다. 롤백 시 이 동작을 고려한다.

## 목록 조회

### `GET /api/groups/{groupId}/announcements`

- 권한: `PUBLIC`
- 설명: 접근 가능한 공지를 최신순(`createdAt DESC, id DESC`)으로 조회한다.
- Query Parameters:

| 이름 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `cursor` | X | 없음 | 직전 응답의 불투명 커서 |
| `size` | X | 20 | 페이지 크기, 1~100 |

- 비구성원에게는 `PUBLIC` 공지와 본인이 작성한 `MEMBERS` 공지만 반환한다. 현재 구성원에게는 두 공개 범위를 모두 반환한다.
- 응답은 `{items, nextCursor, hasNext}` 구조다. 마지막 페이지의 `nextCursor`는 `null`이다.
- 커서는 URL-safe Base64로 인코딩한 `createdAt|id`다.

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 101,
      "title": "이번 주 모임 안내",
      "scope": "MEMBERS",
      "authorNickname": "크루A",
      "createdAt": "2026-10-26T14:00:00"
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

## 상세 조회

### `GET /api/groups/{groupId}/announcements/{announcementId}`

- 권한: `PUBLIC`, 공개 범위에 따라 결과를 필터링한다.
- 설명: 제목, 본문, 공개 범위, 작성자와 등록 시각을 조회한다.
- 응답: `200 OK`, `{id, title, content, scope, authorNickname, createdAt}`. `includeManagement=true`를 지정하면 현재 모임장 또는 작성자에게만 `true`인 `canManage`를 추가한다. 기본 응답은 기존 프론트의 엄격한 스키마와 호환되도록 추가 필드를 생략한다.

## 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 잘못된 모임 ID, 커서 또는 페이지 크기 | `INVALID_PARAMETER` | 400 |
| 등록·수정·삭제 요청의 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 등록 권한이 없는 회원 또는 수정·삭제 권한이 없는 회원 | `GROUP_ACCESS_DENIED` | 403 |
| 모임 없음 | `GROUP_NOT_FOUND` | 404 |
| 공지 없음, 다른 모임의 공지 또는 비공개 공지에 대한 비구성원 접근 | `ANNOUNCEMENT_NOT_FOUND` | 404 |
| 종료된 모임에 등록·수정·삭제 | `GROUP_ENDED` | 409 |
| 같은 등록 요청 ID에 다른 내용 사용 | `ANNOUNCEMENT_REQUEST_CONFLICT` | 409 |

## 공지 등록 알림

알림 사건은 `GROUP_ANNOUNCEMENT_CREATED`다. payload에는 `groupId`, `announcementId`만 넣고, 목적지는 `/groups/{groupId}/announcements/{announcementId}`다. 작성자를 제외한 현재 구성원 전체에게 알림함 행을 만들며, 활성 구독이 있는 브라우저마다 전송 대기 행을 만든다. 공개 범위와 관계없이 알림 수신자는 모임 구성원으로 제한한다.
