# 모집 공고

## 공통 규칙

- 모집 상태는 저장하지 않고 `startsAt`, `endsAt`, 현재 시각으로 계산한다.

### `GET /api/groups/{groupId}/recruitments`

- 설명: 그룹의 모집 공고 이력 조회
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
      "id": 45,
      "joinMethod": "APPROVAL",
      "capacity": 8,
      "approvedCount": 5,
      "startsAt": "2026-08-20T00:00:00",
      "endsAt": "2026-08-31T23:59:59",
      "recruitingStatus": "SCHEDULED",
      "createdAt": "2026-08-13T12:00:00"
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

#### 계산 상태

```plain text
endsAt == null             ALWAYS_OPEN
now < startsAt             SCHEDULED
startsAt <= now < endsAt   OPEN
endsAt <= now              CLOSED
```

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| size 범위 위반 | `INVALID_PARAMETER` | 400 |
| 잘못되거나 만료된 cursor | `INVALID_PARAMETER` | 400 |

### `POST /api/groups/{groupId}/recruitments`

- 설명: 새 모집 공고 등록
- 권한: `LEADER`

#### 요청

```json
{
  "joinMethod": "APPROVAL",
  "capacity": 8,
  "startsAt": "2026-08-20T00:00:00",
  "endsAt": "2026-08-31T23:59:59"
}
```

- `capacity`는 항상 1 이상이어야 한다.
- `endsAt = null`이면 상시 모집이다.
- `startsAt <= endsAt`이어야 한다.

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": 45,
    "groupId": 12,
    "joinMethod": "APPROVAL",
    "capacity": 8,
    "startsAt": "2026-08-20T00:00:00",
    "endsAt": "2026-08-31T23:59:59",
    "recruitingStatus": "SCHEDULED"
  },
  "error": null
}
```

```plain text
Location: /api/groups/12/recruitments/45
```

#### 부수 효과
- 같은 그룹의 기존 활성 공고를 현재 시각에 마감한다.
- 기존 공고의 `PENDING` 신청을 `SYSTEM` 주체로 즉시 `REJECTED` 처리한다.
- 가장 최신 공고만 마감되지 않은 상태로 남는다.
- 한 번 마감된 공고는 다시 활성화하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| capacity 1 미만 | `INVALID_PARAMETER` | 400 |
| 잘못된 모집 기간 | `RECRUITMENT_INVALID_PERIOD` | 400 |

### `GET /api/groups/{groupId}/recruitments/{recruitmentId}`

- 설명: 모집 공고 상세 조회
- 권한: `PUBLIC`

#### Path Parameters
- `groupId`: 모집 공고의 직접 소유자인 그룹 식별자
- `recruitmentId`: 모집 공고 식별자

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 45,
    "group": {"id": 12, "name": "알고리즘 스터디", "status": "ACTIVE"},
    "joinMethod": "APPROVAL",
    "capacity": 8,
    "approvedCount": 5,
    "remainingSeats": 3,
    "startsAt": "2026-08-20T00:00:00",
    "endsAt": "2026-08-31T23:59:59",
    "recruitingStatus": "SCHEDULED",
    "createdAt": "2026-08-13T12:00:00"
  },
  "error": null
}
```

`APPROVAL` 공고의 `PENDING` 수는 남은 자리에 포함하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 모집 공고 없음 또는 해당 그룹의 공고가 아님 | `RECRUITMENT_NOT_FOUND` | 404 |

### `PATCH /api/groups/{groupId}/recruitments/{recruitmentId}`

- 설명: 모집 공고 조기 마감
- 권한: `LEADER`

#### 요청

```json
{
  "recruitingStatus": "CLOSED"
}
```

`CLOSED` 이외의 값은 허용하지 않는다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 45,
    "endsAt": "2026-08-21T14:00:00",
    "recruitingStatus": "CLOSED"
  },
  "error": null
}
```

#### 부수 효과
- 미래의 `startsAt`보다 앞서 마감하는 경우 `startsAt = min(startsAt, now)`, `endsAt = now`로 `startsAt <= endsAt`을 유지한다.
- 수동 조기 마감의 `PENDING` 신청은 즉시 거절하지 않고 마감 후 2주 정책을 적용한다.
- 한 번 마감된 공고를 다시 활성화하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 해당 그룹의 모임장이 아님 | `RECRUITMENT_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 모집 공고 없음 또는 해당 그룹의 공고가 아님 | `RECRUITMENT_NOT_FOUND` | 404 |
| 이미 마감된 공고 | `RECRUITMENT_ALREADY_CLOSED` | 409 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| CLOSED 이외의 상태 요청 | `INVALID_PARAMETER` | 400 |
