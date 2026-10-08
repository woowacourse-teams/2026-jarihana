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
이미지 URL, 선택 캡션, 활동 날짜, 작성 시각, 요청자의 `canModify`, 숨기지 않은 댓글 수
`commentCount`, 이모지 반응 요약 `reactions`를 포함한다.

- `group.recruiting`: 그룹이 `ACTIVE`이고 지금 신청할 수 있는 모집 공고(시작했고 마감 전이거나 상시 모집)가 있으면 `true`다.
- `group.joined`: 요청자가 그룹 구성원이면 `true`다. 비로그인 요청은 항상 `false`다.
- `reactions`: 반응이 1개 이상인 이모지만 이모지 선언 순서(`THUMBS_UP`, `SAD`, `GRIN`, `HEART`, `EYES`, `FIRE`,
  `CHECK`, `QUESTION`, `EXCLAMATION`)로 담는다. `reacted`는 요청자가 남긴 반응인지다.

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 101,
      "group": {"id": 12, "name": "알고리즘 스터디", "type": "STUDY", "status": "ACTIVE", "recruiting": true, "joined": false},
      "authorNickname": "크루A",
      "imageUrl": "https://cdn.example.test/images/activity.webp",
      "caption": "함께한 문제 풀이 모임",
      "activityDate": "2026-09-12",
      "createdAt": "2026-09-28T10:15:30",
      "canModify": false,
      "commentCount": 2,
      "reactions": [{"emoji": "THUMBS_UP", "count": 3, "reacted": true}]
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

## 댓글

### `GET /api/activity-posts/{postId}/comments`

- 권한: `PUBLIC`
- 설명: 숨기지 않은 댓글을 대화 순서대로 `createdAt ASC, id ASC`로 조회한다.
- query parameter: `cursor`(선택), `size`(기본 20, 1 이상 100 이하). 커서는 URL-safe Base64로 인코딩한 `createdAt|id`다.
- 각 항목: `id`, `authorNickname`(작성자 `crewName`), `content`, `createdAt`, 요청자의 `canDelete`, 댓글 반응 요약 `reactions`.
- 숨겨진 기록이나 없는 기록은 `ACTIVITY_POST_NOT_FOUND`로 응답한다.

### `POST /api/activity-posts/{postId}/comments`

- 권한: `MEMBER`. 그룹 구성원이 아니어도 로그인 회원이면 쓸 수 있다.
- 요청: `content` 필수. 앞뒤 공백을 지운 뒤 1자 이상 200자 이하여야 한다.
- 종료된 그룹의 기록에도 댓글을 남길 수 있다.
- 응답: `201 Created`, `{ "id": 7 }`.

### `DELETE /api/activity-post-comments/{commentId}`

- 권한: `MEMBER`. 댓글 작성자 또는 기록 그룹의 현재 모임장이 지울 수 있다.
- 물리 삭제 대신 `deletedAt`으로 숨긴다. 숨긴 댓글은 목록과 `commentCount`에서 빠진다.
- 응답: `204 No Content`.

## 이모지 반응

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `PUT` | `/api/activity-posts/{postId}/reactions/{emoji}` | 기록에 반응 추가 |
| `DELETE` | `/api/activity-posts/{postId}/reactions/{emoji}` | 기록의 내 반응 취소 |
| `PUT` | `/api/activity-post-comments/{commentId}/reactions/{emoji}` | 댓글에 반응 추가 |
| `DELETE` | `/api/activity-post-comments/{commentId}/reactions/{emoji}` | 댓글의 내 반응 취소 |

- 권한: `MEMBER`. 그룹 구성원이 아니어도 로그인 회원이면 반응할 수 있고, 종료된 그룹의 기록에도 반응할 수 있다.
- `emoji`는 `THUMBS_UP`(👍), `SAD`(😢), `GRIN`(😄), `HEART`(❤️), `EYES`(👀), `FIRE`(🔥), `CHECK`(✅),
  `QUESTION`(❓), `EXCLAMATION`(❗) 중 하나다. 그 밖의 값은 `INVALID_PARAMETER`다.
- 같은 회원은 대상별로 같은 이모지를 하나만 남긴다. 추가와 취소는 모두 멱등이며 `204 No Content`로 응답한다.
- 숨겨진 기록과 댓글은 각각 `ACTIVITY_POST_NOT_FOUND`, `ACTIVITY_POST_COMMENT_NOT_FOUND`로 응답한다.

## 주요 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| `mine=true`인데 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 그룹에 속하지 않은 회원의 작성 | `GROUP_ACCESS_DENIED` | 403 |
| 종료된 그룹에 작성 | `GROUP_ENDED` | 409 |
| 다른 작성자의 수정·숨김 | `ACTIVITY_POST_ACCESS_DENIED` | 403 |
| 게시물·이미지 없음 또는 업로드 만료 | `ACTIVITY_POST_NOT_FOUND` 또는 `IMAGE_NOT_FOUND` | 404 |
| 미래 날짜, 캡션 길이, 잘못된 커서·크기 | `INVALID_PARAMETER` | 400 |
| 빈 댓글, 200자를 넘는 댓글, 지원하지 않는 이모지 | `INVALID_PARAMETER` | 400 |
| 다른 회원 댓글을 모임장이 아닌 회원이 삭제 | `ACTIVITY_POST_COMMENT_ACCESS_DENIED` | 403 |
| 댓글 없음 또는 이미 숨긴 댓글 | `ACTIVITY_POST_COMMENT_NOT_FOUND` | 404 |
