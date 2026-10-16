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
- 인증 쿠키와 작성·수정·숨김 요청의 CSRF 요구 사항은 [API 공통 계약](../common-contract.md)을 따른다.

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
`cursor`가 없거나 공백이면 첫 페이지로 처리하며, `nextCursor`는 다음 페이지가 있을 때만
마지막 항목을 기준으로 반환한다. 마지막 페이지는 `nextCursor: null`, `hasNext: false`다.

`id`, `group.id`는 Long, `canModify`와 `hasNext`는 Boolean이다. `caption`은 String 또는
`null`이며 나머지 항목 필드는 항상 포함한다. `group.type`은 `CLUB`, `STUDY`, `SESSION`,
`group.status`는 `ACTIVE`, `ENDED` 중 하나다. `imageUrl`은 공개 기본 URL이 설정되어
있으면 그 URL과 이미지 키를 연결하고, 설정되지 않았으면 저장된 이미지 키를 그대로 반환한다.

## 작성·수정·숨김

### `POST /api/groups/{groupId}/activity-posts`

- 권한: `MEMBER`
- 요청: `imageKey` 필수(최대 255자), `caption` 선택(최대 50자), `activityDate` 선택(`yyyy-MM-dd`).
- `imageKey`와 `caption`은 String, `activityDate`는 날짜 문자열이다. `imageKey`는 공백일 수 없다.
- 응답: `201 Created`, `{ "id": 101 }`.
- 그룹은 `ACTIVE`여야 하고 요청 회원의 `GroupMember`가 있어야 한다.
- 이미지 키는 만료되지 않은 이미지 업로드 기록과 실제 스토리지 객체를 확인한다.
- 다른 활동 기록에서 사용 중인 이미지 키는 재사용할 수 없다. 숨긴 게시물의 사진도 이 검사에 포함한다.
- `caption`은 앞뒤 공백을 제거해 저장하며, `null`·생략·공백 문자열은 `null`로 저장한다. 요청 길이 검증(최대 50자)은 공백 제거 전에 적용한다.
- 성공 응답은 공통 봉투의 `data: { "id": 101 }`이며 `id`는 Long이다. `Location` 헤더는 반환하지 않는다.

### `PUT /api/activity-posts/{postId}`

- 권한: `MEMBER`
- 작성자 또는 현재 그룹 모임장이 수정할 수 있다. 작성자는 그룹 탈퇴 후에도 수정할 수 있다.
- 요청 필드는 작성과 같은 타입·길이 제한을 사용하되 모두 선택 값이다.
- `imageKey`가 생략·`null`·공백이면 기존 사진을 유지한다. `activityDate`가 생략·`null`이면 기존 날짜를 유지한다.
- 다른 이미지 키로 교체할 때만 만료되지 않은 업로드 기록·스토리지 객체·다른 게시물의 키 사용 여부를 검증한다. 기존 사진을 유지하면 업로드 만료 여부를 다시 검증하지 않는다.
- `caption`이 `null`·생략·공백이면 캡션을 비우고, 다른 값은 앞뒤 공백을 제거해 저장한다.
- 그룹이 종료된 후에도 작성자 또는 현재 모임장은 기존 기록을 수정할 수 있다.
- 응답: `200 OK`, `data: null`.

### `DELETE /api/activity-posts/{postId}`

- 권한: `MEMBER`
- 작성자 또는 현재 그룹 모임장이 수행할 수 있다. 물리 삭제 대신 `deletedAt`으로 숨긴다.
- 그룹 삭제 전에도 연결을 끊고 숨김 처리하므로 공개 피드에서 조회되지 않는다.
- 이미 숨겨진 게시물에 다시 수정·숨김을 요청하면 `ACTIVITY_POST_NOT_FOUND`로 응답한다.
- 응답: `200 OK`, `data: null`.

## 주요 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 작성·수정·숨김의 인증 정보 없음, 또는 `mine=true`인데 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 변경 요청의 CSRF 토큰 없음·불일치 | `ACCESS_DENIED` | 403 |
| 그룹별 조회·작성 대상 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 작성 회원 조회 실패 | `MEMBER_NOT_FOUND` | 404 |
| 그룹에 속하지 않은 회원의 작성 | `GROUP_ACCESS_DENIED` | 403 |
| 종료된 그룹에 작성 | `GROUP_ENDED` | 409 |
| 다른 작성자의 수정·숨김 | `ACTIVITY_POST_ACCESS_DENIED` | 403 |
| 게시물 없음 또는 이미 숨겨짐 | `ACTIVITY_POST_NOT_FOUND` | 404 |
| 이미지·업로드 기록 없음, 업로드 만료 또는 스토리지 확인 실패 | `IMAGE_NOT_FOUND` | 400 |
| 필수 이미지 키 누락·공백, 이미지 키·캡션 길이, 미래 날짜, 다른 게시물의 이미지 키 재사용, 잘못된 커서·크기·mine·날짜 형식 | `INVALID_PARAMETER` | 400 |
