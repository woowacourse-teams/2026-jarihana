# 가입 신청

## 공통 규칙

- 신청 상태는 `PENDING → APPROVED | REJECTED`로만 변경된다.
- 신청 철회는 상태 변경이 아니라 `Registration` Hard Delete다.

### `GET /api/recruitments/{recruitmentId}/registrations`

- 설명: 모집 공고 신청자 목록 조회
- 권한: `LEADER`

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `status` | X | `PENDING`, `APPROVED`, `REJECTED`. 생략 시 전체 |
| `cursor` | X | 다음 페이지 커서 |
| `size` | X | 기본 20, 최대 100 |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 88,
      "member": {
        "id": 21,
        "crewName": "마루",
        "memberType": "CREW",
        "generation": 8,
        "course": "FRONTEND"
      },
      "message": "함께 활동하고 싶습니다.",
      "status": "PENDING",
      "registeredAt": "2026-08-21T10:00:00",
      "rejectReason": null,
      "decidedAt": null,
      "decidedBy": null
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 해당 그룹의 모임장이 아님 | `RECRUITMENT_ACCESS_DENIED` | 403 |
| 모집 공고 없음 | `RECRUITMENT_NOT_FOUND` | 404 |
| 정의되지 않은 status | `INVALID_PARAMETER` | 400 |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |

### `POST /api/recruitments/{recruitmentId}/registrations`

- 설명: 모집 공고에 가입 신청
- 권한: `MEMBER`

#### 요청

```json
{
  "message": "함께 활동하고 싶습니다."
}
```

`message`는 생략할 수 있으며 최대 1000자다.

#### 응답 201 — APPROVAL

```json
{
  "success": true,
  "data": {
    "id": 88,
    "status": "PENDING",
    "registeredAt": "2026-08-21T10:00:00"
  },
  "error": null
}
```

#### 응답 201 — AUTO

```json
{
  "success": true,
  "data": {
    "id": 89,
    "status": "APPROVED",
    "registeredAt": "2026-08-21T10:00:00",
    "decidedAt": "2026-08-21T10:00:00",
    "decidedBy": {"type": "SYSTEM"}
  },
  "error": null
}
```

#### 부수 효과
- `AUTO`: 남은 정원이 있으면 즉시 승인하고 `GroupMember(role = MEMBER)`를 생성한다.
- `APPROVAL`: 정원보다 많은 `PENDING` 신청을 허용한다.
- 승인 인원이 `capacity`에 도달하면 `endsAt`을 현재 시각으로 변경하여 공고를 자동 마감한다.
- 정원 도달로 마감되면 남아 있는 `PENDING` 신청을 `SYSTEM` 주체로 즉시 `REJECTED` 처리한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모집 공고 없음 | `RECRUITMENT_NOT_FOUND` | 404 |
| 모집 시작 전 또는 마감 후 | `RECRUITMENT_NOT_OPEN` | 409 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 이미 그룹 구성원 | `GROUP_MEMBER_ALREADY_EXISTS` | 409 |
| 같은 공고의 기존 신청 존재 | `REGISTRATION_ALREADY_EXISTS` | 409 |
| 같은 그룹의 다른 공고에 PENDING 신청 존재 | `GROUP_PENDING_REGISTRATION_EXISTS` | 409 |
| AUTO 공고 정원 소진 | `RECRUITMENT_CAPACITY_EXCEEDED` | 409 |
| message 1000자 초과 | `INVALID_PARAMETER` | 400 |

### `DELETE /api/recruitments/{recruitmentId}/registrations/{registrationId}`

- 설명: 내 대기 중 가입 신청 철회
- 권한: `MEMBER`

#### Path Parameters
- `recruitmentId`: 신청의 직접 소유자인 모집 공고 식별자
- `registrationId`: 가입 신청 식별자

#### 요청
Request Body는 없다.

#### 응답 204 No Content
본문이 없다.

#### 동작
신청자가 자신의 `PENDING` 신청을 Hard Delete한다. `CANCELED` 상태를 만들지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 신청 없음 또는 해당 공고의 신청이 아님 | `REGISTRATION_NOT_FOUND` | 404 |
| 본인의 신청이 아님 | `REGISTRATION_ACCESS_DENIED` | 403 |
| 이미 APPROVED 또는 REJECTED | `REGISTRATION_ALREADY_DECIDED` | 409 |

### `PATCH /api/recruitments/{recruitmentId}/registrations/{registrationId}`

- 설명: 가입 신청 승인·거절
- 권한: `LEADER`

#### Path Parameters
- `recruitmentId`: 신청의 직접 소유자인 모집 공고 식별자
- `registrationId`: 가입 신청 식별자

#### 요청 — 승인

```json
{
  "status": "APPROVED"
}
```

#### 요청 — 거절

```json
{
  "status": "REJECTED",
  "rejectReason": "현재 모집 인원이 모두 확정되었습니다."
}
```

`rejectReason`은 거절할 때 생략할 수 있으며 최대 1000자다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 88,
    "status": "APPROVED",
    "rejectReason": null,
    "decidedAt": "2026-08-22T09:00:00",
    "decidedBy": {"type": "MEMBER", "memberId": 3}
  },
  "error": null
}
```

#### 부수 효과
- 승인 시 `GroupMember(role = MEMBER)`를 생성한다.
- 승인 인원이 `capacity`에 도달하면 `endsAt = now`로 공고를 자동 마감하고 다른 `PENDING` 신청을 `SYSTEM` 주체로 즉시 `REJECTED` 처리한다.
- 거절 시 GroupMember를 생성하지 않는다.
- `decidedBy`에는 결정 시점의 실제 모임장 회원 ID를 기록한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 해당 그룹의 모임장이 아님 | `REGISTRATION_ACCESS_DENIED` | 403 |
| 신청 없음 또는 해당 공고의 신청이 아님 | `REGISTRATION_NOT_FOUND` | 404 |
| 이미 처리된 신청 | `REGISTRATION_ALREADY_DECIDED` | 409 |
| 승인 정원 초과 | `RECRUITMENT_CAPACITY_EXCEEDED` | 409 |
| 이미 그룹 구성원 | `GROUP_MEMBER_ALREADY_EXISTS` | 409 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 정의되지 않은 status 또는 rejectReason 1000자 초과 | `INVALID_PARAMETER` | 400 |

### `GET /api/registrations?applicant=me`

- 설명: 내 가입 신청 목록 조회
- 권한: `MEMBER`

#### 엔드포인트 규칙
- 여러 모집 공고에 걸친 Registration을 조회하는 검색용 컬렉션이다.
- 단일 Registration의 수정·삭제 경로로 사용하지 않는다.
#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `applicant` | O | `me`만 허용. 현재 인증된 회원을 의미 |
| `status` | X | `PENDING`, `APPROVED`, `REJECTED`. 생략 시 전체 |
| `cursor` | X | 다음 페이지 커서 |
| `size` | X | 기본 20, 최대 100 |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 88,
      "group": {
        "id": 12,
        "name": "알고리즘 스터디",
        "representativeImageUrl": "https://cdn.example.test/images/groups/algorithm.webp"
      },
      "recruitmentId": 45,
      "message": "함께 활동하고 싶습니다.",
      "status": "PENDING",
      "registeredAt": "2026-08-21T10:00:00",
      "rejectReason": null,
      "decidedAt": null,
      "decidedBy": null
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

철회한 `PENDING` 신청은 Hard Delete되므로 조회되지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| applicant 누락 또는 me 이외의 값 | `INVALID_PARAMETER` | 400 |
| 정의되지 않은 status | `INVALID_PARAMETER` | 400 |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |
