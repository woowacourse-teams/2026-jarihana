# 모집 공고

## 공통 규칙

- 모집 상태는 저장하지 않고 `startsAt`, `endsAt`, 현재 시각으로 계산한다.
- `joinMethod`는 `AUTO`, `APPROVAL` 중 하나이며, `capacity`와 승인 인원·남은 자리 수는 정수다.
  목록·상세·생성·수정 응답의 `endsAt`은 `null`일 수 있으며, 조기 마감 응답에서는 마감 시각을 반환한다.
- 목록·상세의 `approvedCount`와 정원 수정의 현재 승인 인원은 해당 공고의 모집으로 가입한 인원(APPROVED·RECRUITMENT)이다. 초대 출처 승인은 제외한다.
- 상세의 `remainingSeats`는 `capacity - approvedCount`다. 모집 정원 10명·모집으로 가입한 9명·초대로 합류한 2명이면 남은 자리는 1명이다.

### `GET /api/groups/{groupId}/recruitments`

- 설명: 그룹의 모집 공고 이력 조회
- 권한: `PUBLIC`

#### Query Parameters
- `cursor`: 다음 페이지 커서
- `size`: 기본 20, 최소 1, 최대 100

`createdAt DESC, id DESC`로 정렬한다. 빈 값·공백만 있는 `cursor`는 첫 페이지로 처리한다.
커서는 날짜·양의 ID 형식을 검증하며 요청한 그룹이나 실제 공고 존재 여부와 결합하지 않는다.

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
now < startsAt                     SCHEDULED
startsAt <= now && endsAt == null   ALWAYS_OPEN
startsAt <= now < endsAt            OPEN
endsAt <= now                      CLOSED
```

시작 시각을 먼저 확인한다. 종료일이 없는 공고도 시작 전에는 `SCHEDULED`다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| size 범위 위반 | `INVALID_PARAMETER` | 400 |
| 형식이 잘못된 cursor 또는 양수가 아닌 groupId | `INVALID_PARAMETER` | 400 |

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

- `joinMethod`, `capacity`, `startsAt`은 필수다. `capacity`는 항상 1 이상의 정수여야 한다.
- `endsAt`은 생략하거나 `null`로 보낼 수 있다. 시작 시각 이후에는 상시 모집이다.
- `startsAt <= endsAt`이어야 한다.
- 시작·종료 시각을 과거로 지정하는 요청도 허용한다. 응답 상태는 요청 시점에 계산한다.

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
- 같은 그룹의 기존 마감되지 않은 공고를 모집 예정 공고까지 포함해 현재 시각에 마감한다.
- 기존 공고의 `PENDING` 신청을 `SYSTEM` 주체로 즉시 `REJECTED` 처리한다.
- 새 공고가 아직 마감되지 않았다면 그 공고만 마감되지 않은 상태로 남는다.
- 한 번 마감된 공고는 다시 활성화하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 필수 값 누락, 정의되지 않은 joinMethod 또는 capacity 1 미만 | `INVALID_PARAMETER` | 400 |
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
| groupId 또는 recruitmentId가 양수가 아님 | `INVALID_PARAMETER` | 400 |

### `PUT /api/groups/{groupId}/recruitments/{recruitmentId}`

- 설명: 현재 모집의 기간, 정원, 승인 방식 수정
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

- 수정 가능한 값은 `joinMethod`, `capacity`, `startsAt`, `endsAt`뿐이다.
- `joinMethod`, `capacity`, `startsAt`은 필수다. `endsAt`은 생략하거나 `null`로 보내면 종료일을 비운다.
- `capacity`는 1 이상이며 이미 승인된 인원 이상이어야 한다.
- `endsAt = null`이면 시작 시각 이후에 상시 모집이다.
- `startsAt <= endsAt`이어야 한다.
- 마감된 모집 공고는 수정할 수 없다.
- `capacity`를 현재 승인 인원과 같게 수정하면 아직 마감되지 않은 수정 결과를 현재 시각에 마감하고 기존 `PENDING` 신청은 유지한다. 요청한 종료 시각이 이미 지난 경우에는 그 종료 시각을 유지한다. 모임장이 대기 신청을 직접 처리한다.
- 종료 시각을 현재 또는 과거로 수정해 공고를 마감할 수도 있다. 이 경우에도 기존 `PENDING` 신청을 즉시 미승인하지 않는다.
- 수정 요청의 값이 현재 설정과 같더라도 `capacity`가 현재 승인 인원과 같으면 모집을 마감한다.
- 값이 같고 정원에 도달하지 않은 요청은 저장하지 않고 현재 모집 정보를 반환한다.

#### 응답 200

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

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 해당 그룹의 모임장이 아님 | `RECRUITMENT_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 모집 공고 없음 또는 해당 그룹의 공고가 아님 | `RECRUITMENT_NOT_FOUND` | 404 |
| 마감된 모집 공고 | `RECRUITMENT_ALREADY_CLOSED` | 409 |
| 승인된 인원보다 작은 정원 | `RECRUITMENT_CAPACITY_EXCEEDED` | 409 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 잘못된 요청 값 또는 모집 기간 | `INVALID_PARAMETER` / `RECRUITMENT_INVALID_PERIOD` | 400 |

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
- 수동 조기 마감의 `PENDING` 신청은 즉시 미승인하지 않고 마감 후 2주 정책을 적용한다.
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
