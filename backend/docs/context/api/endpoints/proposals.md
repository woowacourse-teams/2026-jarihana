# 자유게시판 모임 제안

회원이 "이런 모임 같이할 사람?"을 묻는 글을 올리고, 다른 회원은 함께하고 싶어요 응답과 함께할 수 있는 조건을 남긴다.
응답은 모임 신청이 아니며 그룹 소속이나 모집 신청을 만들지 않는다. 모델은 [Proposal](../../domain/model/proposal.md)을 따른다.

## 공통 규칙

- 조회 API는 비로그인 방문자에게도 공개한다. 작성, 응답, 코멘트는 가입을 마친 회원만 할 수 있다.
- 작성자 표시는 회원의 `crewName`, 프로필 이미지는 GitHub 아바타 주소다.
- 목록은 `createdAt DESC, id DESC`, 코멘트는 `createdAt ASC, id ASC` 순서이며 커서 규칙은 [API 공통 설계](../common-contract.md)를 따른다.
- 지운 제안은 목록, 상세, 코멘트 조회와 모든 변경 요청에서 `PROPOSAL_NOT_FOUND`로 응답한다.

| 값 | 의미 |
| --- | --- |
| `category` | `STUDY`(스터디), `CULTURE`(문화), `SPORT`(운동), `ETC`(기타) |
| `timeSlot` | `WEEKDAY_MORNING`(평일 아침), `WEEKDAY_EVENING`(평일 저녁), `WEEKEND_MORNING`(주말 오전), `WEEKEND_AFTERNOON`(주말 오후) |
| `meetingMode` | `ONLINE`(온라인), `OFFLINE`(오프라인) |

## 제안

### `GET /api/proposals`

- 권한: `PUBLIC`
- 설명: 지우지 않은 제안을 최신순으로 조회한다.

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `category` | String | X | 없음 | 주면 그 분야만 조회한다 |
| `cursor` | String | X | 없음 | 직전 응답의 불투명 커서 |
| `size` | Integer | X | 20 | 페이지 크기, 1~100 |

`items` 각 항목은 `id`, `category`, `title`, `content`, `authorNickname`, `authorAvatarUrl`,
`interestCount`(함께하고 싶어요 응답 수), `commentCount`(지우지 않은 코멘트 수), `interested`(요청자가 응답했는지, 비로그인은 `false`), `createdAt`을 담는다.

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 42,
      "category": "CULTURE",
      "title": "각자 읽고 같이 나누는 독서 모임",
      "content": "완독하지 않아도 괜찮아요.",
      "authorNickname": "모카",
      "authorAvatarUrl": "https://avatars.githubusercontent.com/u/12345",
      "interestCount": 3,
      "commentCount": 1,
      "interested": true,
      "createdAt": "2026-10-27T10:00:00"
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

### `GET /api/proposals/{proposalId}`

- 권한: `PUBLIC`
- 설명: 제안 본문과 조건별 응답 인원을 조회한다.

| 필드 | 설명 |
| --- | --- |
| `moodOptions` | 제안자가 정한 분위기 선택지(0~3개) |
| `interestCount` | 함께하고 싶어요 응답 수. 조건 없이 마음만 보낸 응답도 포함한다 |
| `timeSlotCounts` | 모든 `timeSlot`의 `{timeSlot, count}`를 선언 순서로 담는다. 고른 사람이 없으면 0이다 |
| `meetingModeCounts` | 모든 `meetingMode`의 `{meetingMode, count}`를 선언 순서로 담는다 |
| `moodCounts` | `moodOptions`와 같은 순서의 인원 배열 |
| `myInterest` | 요청자의 응답 `{timeSlots, meetingModes, moodIndexes}`. 응답하지 않았거나 비로그인이면 `null` |
| `canDelete` | 요청자가 제안한 회원인지 |

한 응답이 여러 조건을 고를 수 있으므로 조건별 인원의 합은 `interestCount`와 다를 수 있다.

### `POST /api/proposals`

- 권한: `MEMBER`
- 요청: `{category, title, content, moodOptions}`. `title`은 1~50자, `content`는 1~1000자이며 앞뒤 공백을 지운다.
  `moodOptions`는 생략할 수 있고, 주면 서로 다른 한 줄짜리 1~20자 선택지 3개 이하다.
- 응답: `201 Created`, `{id}`
- 오류: 필드 검증 실패는 `INVALID_PARAMETER`, 비로그인은 `UNAUTHENTICATED`

분위기 선택지는 응답이 순번으로 가리키므로 작성 뒤에 바꾸는 API를 두지 않는다.

### `DELETE /api/proposals/{proposalId}`

- 권한: `MEMBER`, 제안한 회원
- 응답: `204 No Content`. 제안을 숨기며 응답과 코멘트 행은 남긴다.
- 오류: 다른 회원은 `PROPOSAL_ACCESS_DENIED`(403), 없거나 지운 제안은 `PROPOSAL_NOT_FOUND`(404)

## 함께하고 싶어요 응답

### `PUT /api/proposals/{proposalId}/interest`

- 권한: `MEMBER`
- 요청: `{timeSlots, meetingModes, moodIndexes}`. 모두 생략하거나 빈 배열로 보낼 수 있다. 목록에서 마음만 보낼 때는 `{}`를 보낸다.
- 응답: `204 No Content`. 회원의 응답이 없으면 만들고, 있으면 조건을 보낸 값으로 바꾼다.
- 오류: 모르는 시간이나 방식 값, 제안에 없는 `moodIndexes`는 `INVALID_PARAMETER`, 없거나 지운 제안은 `PROPOSAL_NOT_FOUND`

같은 회원의 동시 요청은 회원 행을 잠가 순서대로 처리하므로 응답이 둘 생기지 않는다.

### `DELETE /api/proposals/{proposalId}/interest`

- 권한: `MEMBER`
- 응답: `204 No Content`. 응답을 물리 삭제하며, 응답이 없어도 같은 결과다.
- 오류: 없거나 지운 제안은 `PROPOSAL_NOT_FOUND`

## 코멘트

### `GET /api/proposals/{proposalId}/comments`

- 권한: `PUBLIC`
- query: `cursor`, `size`(기본 20, 1~100)
- 응답 항목: `id`, `authorNickname`, `authorAvatarUrl`, `content`, `createdAt`, `canDelete`
- `canDelete`는 요청자가 코멘트 작성자이거나 제안한 회원이면 `true`다.

### `POST /api/proposals/{proposalId}/comments`

- 권한: `MEMBER`
- 요청: `{content}`. 앞뒤 공백을 지운 1~300자
- 응답: `201 Created`, `{id}`

### `DELETE /api/proposal-comments/{commentId}`

- 권한: `MEMBER`, 코멘트 작성자 또는 제안한 회원
- 응답: `204 No Content`. 숨김 시각만 기록한다.
- 오류: 그 밖의 회원은 `PROPOSAL_COMMENT_ACCESS_DENIED`(403), 없거나 지운 코멘트는 `PROPOSAL_COMMENT_NOT_FOUND`(404)
