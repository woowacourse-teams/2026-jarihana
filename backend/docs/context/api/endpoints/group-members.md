# 그룹 구성원

### `GET /api/groups/{groupId}/members`

- 설명: 그룹 구성원 목록 조회
- 권한: `PUBLIC`

#### Query Parameters
- `cursor`: 다음 페이지 커서
- `size`: 기본 20, 최대 100

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [{
      "groupMemberId": 31,
      "memberId": 3,
      "crewName": "가온",
      "memberType": "CREW",
      "generation": 8,
      "avatarUrl": "https://avatars.githubusercontent.com/u/3",
      "course": "BACKEND",
      "role": "LEADER",
      "joinedAt": "2026-08-13T10:00:00"
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

현재 존재하는 `GroupMember`만 반환한다. 그룹에서 이탈한 구성원 관계는 Hard Delete되므로 목록에 포함되지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |

### `PUT /api/groups/{groupId}/leader`

- 설명: 모임장 역할 위임
- 권한: `LEADER`

#### 요청

```json
{
  "groupMemberId": 27
}
```

`groupMemberId`는 필수 양의 정수이며, 대상은 같은 그룹에서 `MEMBER` 역할을 가진
`GroupMember`여야 한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "groupId": 12,
    "previousLeaderGroupMemberId": 3,
    "leaderGroupMemberId": 27
  },
  "error": null
}
```

#### 부수 효과
기존 모임장의 역할을 `MEMBER`, 대상 구성원의 역할을 `LEADER`로 한 트랜잭션에서 교체한다. 일반 구성원 역할 수정 API로 노출하지 않아 한 그룹에 정확히 한 명의 `LEADER`가 존재한다는 불변식을 보호한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 현재 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| ENDED 그룹 | `LEADER_DELEGATION_NOT_ALLOWED_FOR_ENDED_GROUP` | 422 |
| 대상 GroupMember 없음 | `GROUP_MEMBER_NOT_FOUND` | 404 |
| 자기 자신 또는 이미 LEADER인 대상 | `GROUP_MEMBER_ALREADY_LEADER` | 422 |
