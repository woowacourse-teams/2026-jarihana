# 사진 활동 기록

모임의 활동 사진을 그룹 단위 게시물로 공개한다. 자동 생성되는 도메인 이벤트나 PostHog 분석 이벤트와는 별개인 서비스 콘텐츠다.

## 공통 규칙

- 조회 API는 비로그인 방문자에게도 공개한다. 모든 게시물과 사진은 전체 공개다.
- 작성은 로그인한 활성 그룹 구성원만 가능하며, 종료된 그룹에는 새 기록을 작성할 수 없다.
- 작성자 표시는 회원의 `crewName`이다. 응답의 `canModify`는 현재 요청자의 수정·숨김 권한이다.
- 활동 날짜는 미입력 시 오늘이며 과거 날짜는 허용, 미래 날짜는 거부한다.
- 목록은 `activityDate DESC, id DESC` 순서다. `createdAt`은 작성 시각이며 정렬에 사용하지 않는다.
- 현재 게시물당 사진은 한 장이지만 `activity_post_photo` 테이블로 분리되어 있다.
- 그룹 삭제 시 게시물은 숨기고, 그룹 종료 시 게시물을 보존한다.

## 조회

### `GET /api/activity-posts`

- 권한: `PUBLIC`
- 설명: 전체 그룹의 사진 활동 기록을 활동 날짜 최신순으로 조회한다.

### `GET /api/groups/{groupId}/activity-posts`

- 권한: `PUBLIC`
- 설명: 특정 그룹의 사진 활동 기록을 활동 날짜 최신순으로 조회한다.
- 존재하지 않는 그룹은 `GROUP_NOT_FOUND`로 응답한다.

두 조회 API는 다음 query parameter를 받는다.

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `cursor` | String | X | 없음 | 직전 응답의 불투명 커서 |
| `size` | Integer | X | 20 | 페이지 크기, 1–100 |
| `mine` | Boolean | X | `false` | `true`이면 현재 회원 작성 기록만 조회하며 인증 필요 |

응답은 `{items, nextCursor, hasNext}` 구조다. `items` 각 항목은 그룹 요약, 작성자 닉네임,
이미지 URL, 선택 캡션, 활동 날짜, 작성 시각, 요청자의 `canModify`를 포함한다.

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 101,
      "group": {"id": 12, "name": "알고리즘 스터디", "type": "STUDY", "status": "ACTIVE"},
      "authorNickname": "크루A",
      "imageUrl": "https://cdn.example.test/images/activity.webp",
      "caption": "함께한 문제 풀이 모임",
      "activityDate": "2026-09-12",
      "createdAt": "2026-09-28T10:15:30",
      "canModify": false
    }],
    "nextCursor": "MjAyNi0wOS0xMnwxMDE",
    "hasNext": true
  },
  "error": null
}
```

커서는 URL-safe Base64로 인코딩한 `activityDate|id`이며 날짜와 ID를 함께 사용해 동률에서도
결정적인 페이지 순서를 유지한다.

## 작성·수정·숨김

### `POST /api/groups/{groupId}/activity-posts`

- 권한: `MEMBER`
- 요청: `imageKey` 필수(최대 255자), `caption` 선택(최대 50자), `activityDate` 선택(`yyyy-MM-dd`).
- 응답: `201 Created`, `{ "id": 101 }`.
- 그룹은 `ACTIVE`여야 하고 요청 회원의 `GroupMember`가 있어야 한다.
- 이미지 키는 만료되지 않은 이미지 업로드 기록과 실제 스토리지 객체를 확인한다.

### `PUT /api/activity-posts/{postId}`

- 권한: `MEMBER`
- 작성자 또는 현재 그룹 모임장이 수정할 수 있다. 작성자는 그룹 탈퇴 후에도 수정할 수 있다.
- `imageKey` 미입력 시 기존 사진을 유지한다. `activityDate` 미입력 시 기존 날짜를 유지한다.
- `caption`이 `null`이거나 생략되면 캡션을 비운다.
- 응답: `200 OK`, `data: null`.

### `DELETE /api/activity-posts/{postId}`

- 권한: `MEMBER`
- 작성자 또는 현재 그룹 모임장이 수행할 수 있다. 물리 삭제 대신 `deletedAt`으로 숨긴다.
- 그룹 삭제 전에도 연결을 끊고 숨김 처리하므로 공개 피드에서 조회되지 않는다.
- 응답: `200 OK`, `data: null`.

## 주요 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| `mine=true`인데 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 그룹에 속하지 않은 회원의 작성 | `GROUP_ACCESS_DENIED` | 403 |
| 종료된 그룹에 작성 | `GROUP_ENDED` | 409 |
| 다른 작성자의 수정·숨김 | `ACTIVITY_POST_ACCESS_DENIED` | 403 |
| 게시물·이미지 없음 또는 업로드 만료 | `ACTIVITY_POST_NOT_FOUND` 또는 `IMAGE_NOT_FOUND` | 404 |
| 미래 날짜, 캡션 길이, 잘못된 커서·크기 | `INVALID_PARAMETER` | 400 |
