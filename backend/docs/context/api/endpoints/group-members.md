# 그룹 구성원

### `GET /api/groups/{groupId}/members`

- 설명: 그룹 구성원 목록 조회
- 권한: `PUBLIC`

#### Query Parameters
- `cursor`: 다음 페이지 커서
- `size`: 기본 20, 최소 1, 최대 100

`joinedAt DESC, groupMemberId DESC`로 정렬한다. 모임장을 별도로 먼저 배치하지 않는다.
빈 값·공백만 있는 `cursor`는 첫 페이지로 처리한다.
커서는 날짜·양의 ID 형식을 검증하며 요청한 그룹이나 실제 소속 존재 여부와 결합하지 않는다.

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
종료된 그룹도 조회할 수 있다. `memberType`은 `CREW` 또는 `COACH`이며, `COACH`의
`generation`과 `course`는 `null`이다. `CREW`의 `course`는 `BACKEND`, `FRONTEND`, `ANDROID` 중 하나다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 잘못된 cursor·size 또는 양수가 아닌 groupId | `INVALID_PARAMETER` | 400 |

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
| 대상 GroupMember 없음 또는 다른 그룹의 구성원 | `GROUP_MEMBER_NOT_FOUND` | 404 |
| 자기 자신 또는 이미 LEADER인 대상 | `GROUP_MEMBER_ALREADY_LEADER` | 422 |
| groupMemberId 누락 또는 양수가 아님 | `INVALID_PARAMETER` | 400 |
