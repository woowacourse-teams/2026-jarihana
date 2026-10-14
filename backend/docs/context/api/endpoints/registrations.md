# 가입 신청

## 공통 규칙

- 신청 상태는 `PENDING → APPROVED | REJECTED`로만 변경된다.
- 선착순 가입·수동 승인의 남은 정원과 정원 도달 마감은 모집으로 가입한 인원(APPROVED·RECRUITMENT)으로 계산한다. 초대 출처 승인은 자리를 소진하지 않는다.
- 신청 목록의 APPROVED 필터는 초대로 승인된 기존 신청도 포함한다. 신청 이력 개수와 모집 정원용 approvedCount는 다른 값이며, 신청이 없는 초대 합류자의 이력을 이 목록에 새로 만들지 않는다.
- 신청 철회는 상태 변경이 아니라 `Registration` Hard Delete다.
- 신청 목록과 내 신청 목록은 `registeredAt DESC, id DESC`로 정렬한다.
  빈 값·공백만 있는 `cursor`는 첫 페이지로 처리한다.
  커서는 날짜·양의 ID 형식을 검증하며 현재 회원·모집 공고·상태 필터와 결합하지 않는다.
- 목록에서 `message`는 nullable이고, `PENDING`의 `rejectReason`, `decidedAt`, `decidedBy`는 `null`이다.
  결정 후 `decidedBy`는 `{"type":"MEMBER","memberId":3}` 또는
  `{"type":"SYSTEM","memberId":null}` 형태다. `REJECTED`의 사유도 `null`일 수 있다.
  승인 출처(`approvalOrigin`)와 모임장 확인 시각(`leaderViewedAt`)은 응답에 포함하지 않는다.

### `GET /api/groups/{groupId}/registrations/summary`

- 설명: 그룹의 미확인 신청과 처리 대기 신청 요약 조회
- 권한: `LEADER`

#### 응답 200

```json
{
  "success": true,
  "data": {
    "unreadCount": 4,
    "pendingCount": 3,
    "targetRecruitmentId": 45,
    "latestRegistrationId": 91
  },
  "error": null
}
```

- `unreadCount`는 해당 그룹의 모든 모집 공고에서 `leaderViewedAt = null`인 신청을 상태와 관계없이 집계한다.
- `pendingCount`는 해당 그룹의 모든 모집 공고에 속한 `PENDING` 신청을 집계한다.
- 마감된 모집 공고의 신청도 두 집계에 포함하고 다른 그룹의 신청은 제외한다.
- `targetRecruitmentId`는 가장 최근 미확인 신청이 속한 모집 공고 ID다. 미확인 신청이 없으면 가장 최근 `PENDING` 신청의 모집 공고 ID이며, 둘 다 없으면 `null`이다.
- `latestRegistrationId`는 가장 최근 미확인 신청 ID이며 미확인 신청이 없으면 `null`이다.
- 가장 최근 신청은 `registeredAt DESC, id DESC`로 선택한다. 두 건수는 정수이며,
  요약·목록 조회는 종료된 그룹에서도 가능하다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 인증 정보 없음/만료 | `UNAUTHENTICATED` | 401 |
| 해당 그룹의 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| groupId가 양수가 아님 | `INVALID_PARAMETER` | 400 |

### `PATCH /api/recruitments/{recruitmentId}/registrations/read`

- 설명: 신청 관리 목록에서 확인한 마지막 신청까지 읽음 처리
- 권한: `LEADER`

#### 요청

```json
{
  "throughRegistrationId": 91
}
```

- `throughRegistrationId`는 직전에 받은 신청 요약의 `latestRegistrationId`를 사용한다.
- 요청한 모집에서 ID가 `throughRegistrationId` 이하이고 `leaderViewedAt`이 `null`인 신청만 현재 시각으로 갱신한다.
- 다른 모집의 신청과 요청 처리 중 새로 생성되어 더 큰 ID를 받은 신청은 갱신하지 않는다.
- 기준 ID가 실제로 존재하거나 해당 모집에 속하는지는 검증하지 않는다. 양의 정수이면
  해당 모집의 ID 이하 신청을 처리하고, 해당 신청이 없으면 그대로 성공한다.

#### 응답 204 No Content

본문이 없다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 인증 정보 없음/만료 | `UNAUTHENTICATED` | 401 |
| 해당 그룹의 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 모집 공고 없음 | `RECRUITMENT_NOT_FOUND` | 404 |
| 종료된 그룹 | `GROUP_ENDED` | 409 |
| `throughRegistrationId` 누락 또는 양수가 아님 | `INVALID_PARAMETER` | 400 |

### `GET /api/recruitments/{recruitmentId}/registrations`

- 설명: 모집 공고 신청자 목록 조회
- 권한: `LEADER`

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `status` | X | `PENDING`, `APPROVED`, `REJECTED`. 생략 시 전체 |
| `cursor` | X | 다음 페이지 커서 |
| `size` | X | 기본 20, 최소 1, 최대 100 |

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

`member.memberType`은 `CREW` 또는 `COACH`다. `COACH`의 `generation`과 `course`는 `null`이며,
`CREW`의 `course`는 `BACKEND`, `FRONTEND`, `ANDROID` 중 하나다.
목록 조회만으로 신청을 읽음 처리하지 않는다. 확인 처리는 별도 `PATCH .../registrations/read`를 호출한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 해당 그룹의 모임장이 아님 | `RECRUITMENT_ACCESS_DENIED` | 403 |
| 모집 공고 없음 | `RECRUITMENT_NOT_FOUND` | 404 |
| 정의되지 않은 status | `INVALID_PARAMETER` | 400 |
| 잘못된 cursor·size 또는 양수가 아닌 recruitmentId | `INVALID_PARAMETER` | 400 |

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
`null`과 빈 문자열도 허용한다. 메시지를 생략해도 요청 본문은 `{}`로 전달한다.

#### 응답 201 - APPROVAL

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

`APPROVAL`의 생성 응답에는 `decidedAt`, `decidedBy` 필드가 생략된다.

#### 응답 201 - AUTO

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

`AUTO` 생성 응답의 `decidedBy`는 `type`만 포함한다. 목록 응답과 달리 `memberId` 필드는 없다.

#### 부수 효과
- `AUTO`: 남은 정원이 있으면 즉시 승인하고 `GroupMember(role = MEMBER)`를 생성한다.
- `APPROVAL`: 정원보다 많은 `PENDING` 신청을 허용한다.
- 승인 인원이 `capacity`에 도달하면 `endsAt`을 현재 시각으로 변경하여 공고를 자동 마감한다.
- 정원 도달로 마감되어도 기존 `PENDING` 신청은 유지하고 신규 신청은 받지 않는다. 모임장이 대기 신청을 직접 처리한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모집 공고 없음 | `RECRUITMENT_NOT_FOUND` | 404 |
| 모집 시작 전 또는 마감 후 | `RECRUITMENT_NOT_OPEN` | 409 |
| 인증된 ID의 회원 없음 | `MEMBER_NOT_FOUND` | 404 |
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
신청자가 모집 중인 공고의 본인 `PENDING` 신청을 Hard Delete한다. 모집 마감 후에는 `PENDING` 상태가 유지되어도 철회할 수 없다. `CANCELED` 상태를 만들지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모집 공고 없음 | `RECRUITMENT_NOT_FOUND` | 404 |
| 신청 없음 또는 해당 공고의 신청이 아님 | `REGISTRATION_NOT_FOUND` | 404 |
| 본인의 신청이 아님 | `REGISTRATION_ACCESS_DENIED` | 403 |
| 이미 APPROVED 또는 REJECTED | `REGISTRATION_ALREADY_DECIDED` | 409 |
| 모집 시작 전 또는 마감 후 | `RECRUITMENT_NOT_OPEN` | 409 |

### `PATCH /api/recruitments/{recruitmentId}/registrations/{registrationId}`

- 설명: 가입 신청 승인·미승인
- 권한: `LEADER`

#### Path Parameters
- `recruitmentId`: 신청의 직접 소유자인 모집 공고 식별자
- `registrationId`: 가입 신청 식별자

#### 요청 - 승인

```json
{
  "status": "APPROVED"
}
```

#### 요청 — 미승인

```json
{
  "status": "REJECTED",
  "rejectReason": "현재 모집 인원이 모두 확정되었습니다."
}
```

`rejectReason`은 미승인할 때 생략할 수 있으며 최대 1000자다.
`status`는 필수이며 `APPROVED`, `REJECTED`만 허용한다. 승인 요청에는 `rejectReason`을
생략하거나 `null`로 보내야 하며, 빈 문자열을 포함한 다른 값은 허용하지 않는다.

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
- 승인 인원이 `capacity`에 도달하면 아직 마감되지 않은 공고를 `endsAt = now`로 자동 마감한다.
  이미 마감된 공고의 종료 시각은 유지한다. 다른 `PENDING` 신청은 유지하며 모임장이 직접 처리한다.
- 기존 `PENDING` 신청의 승인은 정원이 남아 있을 때만 가능하며, 정원 초과 승인은 허용하지 않는다.
- 모집 시작 전·마감 후 여부는 결정 가능 조건이 아니다. 그룹이 활동 중이고 신청이 여전히
  `PENDING`이면 미승인할 수 있고, 정원까지 남아 있으면 승인할 수 있다.
- 미승인 시 GroupMember를 생성하지 않는다.
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
| status 누락·정의되지 않은 값, rejectReason 1000자 초과 또는 승인 요청에 사유 전달 | `INVALID_PARAMETER` | 400 |

### `GET /api/registrations?applicant=me`

- 설명: 내 가입 신청 목록 조회
- 권한: `MEMBER`
- 그룹의 업로드 이미지가 없거나 기본 이미지 키이면 `group.representativeImageUrl`은
  기존과 동일하게 `images/default-group.png`다.
- 업로드 이미지에는 설정된 공개 Base URL을 붙이며, Base URL이 비어 있으면 스토리지 키를 그대로 반환한다.

#### 엔드포인트 규칙
- 여러 모집 공고에 걸친 Registration을 조회하는 검색용 컬렉션이다.
- 단일 Registration의 수정/삭제 경로로 사용하지 않는다.
#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `applicant` | O | `me`만 허용. 현재 인증된 회원을 의미 |
| `status` | X | `PENDING`, `APPROVED`, `REJECTED`. 생략 시 전체 |
| `cursor` | X | 다음 페이지 커서 |
| `size` | X | 기본 20, 최소 1, 최대 100 |

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
      "canWithdraw": true,
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

`canWithdraw`는 신청이 `PENDING`이고 모집 중일 때만 `true`다. 마감 후에도 목록에 남는 `PENDING` 신청은 `false`다. 철회한 `PENDING` 신청은 Hard Delete되므로 조회되지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| applicant 누락 또는 me 이외의 값 | `INVALID_PARAMETER` | 400 |
| 정의되지 않은 status | `INVALID_PARAMETER` | 400 |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |
