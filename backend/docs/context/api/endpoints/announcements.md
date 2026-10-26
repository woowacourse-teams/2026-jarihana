# 모임 공지

모임장은 활동 중인 모임에 제목과 일반 텍스트 본문을 가진 공지를 등록한다. 공지는 모임 상세의 공지 탭에서 최신순으로 조회한다.

## 공통 규칙

- 읽기는 `PUBLIC`이며, 비로그인 방문자도 `PUBLIC` 공지를 읽을 수 있다.
- `MEMBERS` 공지는 해당 모임의 현재 구성원에게만 보인다. 비구성원이나 비로그인 방문자가 비공개 공지의 ID를 알아도 상세 API는 `ANNOUNCEMENT_NOT_FOUND`로 응답한다.
- 읽기 응답은 요청 회원의 구성원 여부에 따라 달라지므로 `Cache-Control: no-store`를 적용한다.
- `scope` 값은 `MEMBERS`, `PUBLIC`이다.
- 제목은 공백을 제거한 뒤 1~100자, 본문은 공백을 제거한 뒤 1~10,000자다. 본문은 Markdown을 해석하지 않는 일반 텍스트다.
- 모임이 종료된 뒤에도 기존 공지는 읽을 수 있지만, 종료된 모임에는 새 공지를 등록할 수 없다.
- 모임이 물리 삭제되면 공지도 물리 삭제된다.

## 등록

### `POST /api/groups/{groupId}/announcements`

- 권한: `LEADER`
- 설명: 활동 중인 모임에 공지를 등록하고 현재 구성원에게 알림함 기록을 만든다. 작성자 자신은 수신 대상에서 제외한다. 활성 브라우저 푸시 구독이 있는 수신자에게만 Web Push 전송 대기를 만든다.
- 요청:

```json
{
  "title": "이번 주 모임 안내",
  "content": "토요일 오후 2시에 만나요.",
  "scope": "MEMBERS"
}
```

- 응답: `201 Created`, `data: { "id": 101 }`.
- 저장과 알림함 기록, 구독별 전송 대기는 같은 트랜잭션에서 처리한다. 푸시 구독이 없는 구성원도 알림함에서 공지를 확인할 수 있다.

## 목록 조회

### `GET /api/groups/{groupId}/announcements`

- 권한: `PUBLIC`
- 설명: 접근 가능한 공지를 최신순(`createdAt DESC, id DESC`)으로 조회한다.
- Query Parameters:

| 이름 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `cursor` | X | 없음 | 직전 응답의 불투명 커서 |
| `size` | X | 20 | 페이지 크기, 1~100 |

- 비구성원에게는 `PUBLIC` 공지만 반환한다. 현재 구성원에게는 두 공개 범위를 모두 반환한다.
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
- 응답: `200 OK`, `{id, title, content, scope, authorNickname, createdAt}`.

## 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 잘못된 모임 ID, 커서 또는 페이지 크기 | `INVALID_PARAMETER` | 400 |
| 등록 요청의 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 현재 모임장이 아닌 회원의 등록 | `GROUP_ACCESS_DENIED` | 403 |
| 모임 없음 | `GROUP_NOT_FOUND` | 404 |
| 공지 없음, 다른 모임의 공지 또는 비공개 공지에 대한 비구성원 접근 | `ANNOUNCEMENT_NOT_FOUND` | 404 |
| 종료된 모임에 등록 | `GROUP_ENDED` | 409 |

## 공지 등록 알림

알림 사건은 `GROUP_ANNOUNCEMENT_CREATED`다. payload에는 `groupId`, `announcementId`만 넣고, 목적지는 `/groups/{groupId}/announcements/{announcementId}`다. 작성자를 제외한 현재 구성원 전체에게 알림함 행을 만들며, 활성 구독이 있는 브라우저마다 전송 대기 행을 만든다. 공개 범위와 관계없이 알림 수신자는 모임 구성원으로 제한한다.
