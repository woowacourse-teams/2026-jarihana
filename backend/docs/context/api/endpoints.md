# API 엔드포인트 설계

> 상태: Notion 설계 맥락 스냅샷
>
> 원본: [Notion 문서](https://app.notion.com/p/0a438efca7fd4228bcbe8e0dfb10f75b)
>
> 동기화: 2026-08-15
>
> 구현·테스트·Swagger/OpenAPI와 충돌하면 임의로 해석하지 않고 차이를 보고한다.

이 문서는 Notion의 활성 엔드포인트 27개를 하나의 AI 맥락 문서로 정리한 것이다. 세부 요청·응답·오류는 구현 시 Swagger/OpenAPI와 RestAssured 인수 테스트로 검증한다.

## 전체 목록

| 분류 | Method | Endpoint | 권한 | 설명 |
| --- | --- | --- | --- | --- |
| 가입 신청 | `GET` | `/api/recruitments/{recruitmentId}/registrations` | `LEADER` | 모집 공고 신청자 목록 조회 |
| 가입 신청 | `POST` | `/api/recruitments/{recruitmentId}/registrations` | `MEMBER` | 모집 공고에 가입 신청 |
| 가입 신청 | `DELETE` | `/api/recruitments/{recruitmentId}/registrations/{registrationId}` | `MEMBER` | 내 대기 중 가입 신청 철회 |
| 가입 신청 | `PATCH` | `/api/recruitments/{recruitmentId}/registrations/{registrationId}` | `LEADER` | 가입 신청 승인·거절 |
| 가입 신청 | `GET` | `/api/registrations?applicant=me` | `MEMBER` | 내 가입 신청 목록 조회 |
| 그룹 | `GET` | `/api/groups` | `PUBLIC` | 그룹 목록 조회 — 관계·상태·유형 필터 지원 |
| 그룹 | `POST` | `/api/groups` | `MEMBER` | 그룹 개설 |
| 그룹 | `DELETE` | `/api/groups/{groupId}` | `LEADER` | 생성 후 24시간 이내 그룹 삭제 |
| 그룹 | `GET` | `/api/groups/{groupId}` | `PUBLIC` | 그룹 상세 조회 |
| 그룹 | `PATCH` | `/api/groups/{groupId}` | `LEADER` | 생성 후 24시간이 지난 그룹 종료 |
| 그룹 | `PUT` | `/api/groups/{groupId}` | `LEADER` | 그룹 기본 정보 전체 교체 |
| 그룹 | `PUT` | `/api/groups/{groupId}/leader` | `LEADER` | 모임장 역할 위임 |
| 그룹 | `DELETE` | `/api/groups/{groupId}/recurring-schedule` | `LEADER` | 동아리·스터디를 유동적 일정으로 변경 |
| 그룹 | `PUT` | `/api/groups/{groupId}/recurring-schedule` | `LEADER` | 동아리·스터디 반복 일정 등록 또는 교체 |
| 그룹 | `PUT` | `/api/groups/{groupId}/session-schedule` | `LEADER` | 세션 일정 교체 |
| 그룹 구성원 | `GET` | `/api/groups/{groupId}/members` | `PUBLIC` | 그룹 구성원 목록 조회 |
| 모집 공고 | `GET` | `/api/groups/{groupId}/recruitments` | `PUBLIC` | 그룹의 모집 공고 이력 조회 |
| 모집 공고 | `POST` | `/api/groups/{groupId}/recruitments` | `LEADER` | 새 모집 공고 등록 |
| 모집 공고 | `GET` | `/api/groups/{groupId}/recruitments/{recruitmentId}` | `PUBLIC` | 모집 공고 상세 조회 |
| 모집 공고 | `PATCH` | `/api/groups/{groupId}/recruitments/{recruitmentId}` | `LEADER` | 모집 공고 조기 마감 |
| 이미지 | `POST` | `/api/image-uploads` | `MEMBER` | 이미지 업로드 리소스 생성 |
| 인증·회원 | `POST` | `/api/auth/logout` | `AUTH` | 가입 세션 또는 Refresh Token 무효화 |
| 인증·회원 | `POST` | `/api/auth/refresh` | `PUBLIC` | Access Token 재발급 |
| 인증·회원 | `POST` | `/api/members` | `AUTH` | 회원 가입 완료 |
| 인증·회원 | `GET` | `/api/members/me` | `AUTH` | 내 정보와 가입 완료 여부 조회 |
| 인증·회원 | `GET` | `/api/oauth/github/callback` | `PUBLIC` | GitHub OAuth 콜백 처리 |

## 인증·회원

### `POST /api/auth/logout`

- 설명: 가입 세션 또는 Refresh Token 무효화
- 권한: `AUTH`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c8159a427e78b0411335d)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `AUTH`의 자격 증명 규칙을 적용한다.
- 리다이렉트와 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청
Request Body는 없다.

#### 응답 204 No Content
본문이 없다.

#### 부수 효과
- 가입 전 사용자라면 가입 세션을 무효화한다.
- 가입 회원이라면 Refresh Token을 폐기한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 유효한 세션과 토큰이 모두 없음 | `UNAUTHENTICATED` | 401 |

### `POST /api/auth/refresh`

- 설명: Access Token 재발급
- 권한: `PUBLIC`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81c3a0b8ffe93985b5fa)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `PUBLIC`의 자격 증명 규칙을 적용한다.
- 리다이렉트와 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청
Refresh Token을 인증 계약에서 확정한 위치로 전달한다. Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "accessToken": "new-access-token",
    "expiresIn": 3600
  },
  "error": null
}
```

#### 부수 효과
Refresh Token 회전 정책을 적용하는 경우 기존 토큰을 폐기하고 새 토큰을 발급한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| Refresh Token 없음 | `REFRESH_TOKEN_REQUIRED` | 401 |
| Refresh Token 만료·위조 | `REFRESH_TOKEN_INVALID` | 401 |
| 탈퇴 또는 존재하지 않는 회원 | `MEMBER_NOT_FOUND` | 404 |

### `POST /api/members`

- 설명: 회원 가입 완료
- 권한: `AUTH`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81efad78ff74ca515616)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `AUTH`의 자격 증명 규칙을 적용한다.
- 리다이렉트와 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청

```json
{
  "crewName": "가온",
  "generation": 8,
  "course": "BACKEND"
}
```

- `githubId`는 Request Body가 아니라 가입 세션에서 읽는다.
- `course`는 `BACKEND`, `FRONTEND`, `ANDROID` 중 하나다.

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": 12,
    "crewName": "가온",
    "generation": 8,
    "course": "BACKEND",
    "joinedAt": "2026-08-13T10:00:00"
  },
  "error": null
}
```

```plain text
Location: /api/members/12
```

#### 부수 효과
- 가입 세션을 무효화한다.
- 이후 일반 API에서 사용할 토큰을 발급한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 가입 세션 없음·만료 | `SIGNUP_SESSION_REQUIRED` | 401 |
| 이미 가입한 GitHub 사용자 | `MEMBER_ALREADY_EXISTS` | 409 |
| crewName 형식 오류 | `INVALID_PARAMETER` | 400 |
| crewName + generation 중복 | `MEMBER_CREW_DUPLICATED` | 409 |
| 지원하지 않는 course | `INVALID_PARAMETER` | 400 |

### `GET /api/members/me`

- 설명: 내 정보와 가입 완료 여부 조회
- 권한: `AUTH`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c815faee5c25a2c467a1b)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `AUTH`의 자격 증명 규칙을 적용한다.
- 리다이렉트와 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청
요청 값은 없다.

#### 응답 200 — 가입 전

```json
{
  "success": true,
  "data": {
    "signupCompleted": false,
    "member": null
  },
  "error": null
}
```

#### 응답 200 — 가입 완료

```json
{
  "success": true,
  "data": {
    "signupCompleted": true,
    "member": {
      "id": 12,
      "crewName": "가온",
      "generation": 8,
      "course": "BACKEND",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123456"
    }
  },
  "error": null
}
```

프로필 이미지 URL은 저장하지 않고 `githubId`로 구성한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 가입 세션과 Access Token이 모두 없음 | `UNAUTHENTICATED` | 401 |

### `GET /api/oauth/github/authorization` (폐기)

이 엔드포인트는 만들지 않는다. 팀 회의에서 프론트엔드가 GitHub authorize URL로 직접 보내면
되므로 백엔드에 둘 이유가 없다고 결론지었다. 근거와 그에 따른 `state` 검증 방식은
[ADR 0003](../../adr/0003-oauth-authorization-ownership.md)에 있다.

Notion 원본에는 이 페이지가 아직 남아 있다. 다시 동기화할 때 이 항목이 되살아나지 않도록
주의한다. `OAUTH_CONFIGURATION_ERROR`도 이 엔드포인트에서만 쓰이던 코드이므로 사용하지 않는다.

### `GET /api/oauth/github/callback`

- 설명: GitHub OAuth 콜백 처리
- 권한: `PUBLIC`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81898b3ad229c4081a95)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `PUBLIC`의 자격 증명 규칙을 적용한다.
- 리다이렉트와 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청

| Query | 필수 | 설명 |
| --- | --- | --- |
| `code` | O | GitHub 인가 코드 |
| `state` | O | 프론트엔드가 인가 시작 시 만들어 쿠키와 이 쿼리 양쪽에 실은 검증 값 |

#### 응답
`302 Found`

```plain text
Location: {frontendOrigin}/oauth/callback?signupRequired=true|false
```

- 가입하지 않은 GitHub 사용자는 `signupRequired=true`로 이동한다.
- 가입 완료 회원은 `signupRequired=false`로 이동한다.

#### 부수 효과
- 미가입 사용자는 `githubId`를 가입 세션에 보관한다.
- 가입 회원은 Access Token과 Refresh Token을 발급한다.
- 요청의 `state` 쿼리와 프론트엔드가 심은 `state` 쿠키를 대조하고, 대조 후 쿠키를 만료시킨다.

토큰 전달 방식은 [ADR 0002](../../adr/0002-access-token-cookie.md)에서 확정했다. Access Token과
Refresh Token을 모두 `HttpOnly` 쿠키로 내린다. `state` 검증 방식은
[ADR 0003](../../adr/0003-oauth-authorization-ownership.md)을 따른다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| code 또는 state 누락 | `OAUTH_INVALID_CALLBACK` | 400 |
| state 불일치·만료 | `OAUTH_STATE_INVALID` | 400 |
| GitHub 사용자 조회 실패 | `OAUTH_PROVIDER_ERROR` | 502 |

## 그룹

그룹 목록·상세 조회는 대표 이미지 키가 없거나 기본 이미지 키인 경우
`images/default-group.png`를 반환한다. 업로드된 이미지 키가 연결된 경우에는
설정된 공개 이미지 Base URL과 스토리지 키를 조합한 URL을 반환한다.
현재 운영 버킷의 이미지 객체 prefix는 `jarihana/images`이며, 공개 Base URL은
해당 prefix를 제외한 CloudFront 경로(예: `https://d1znkkaqfyz08f.cloudfront.net/images`)다.

### `GET /api/groups`

- 설명: 그룹 목록 조회 — 관계·상태·유형 필터 지원
- 권한: `PUBLIC`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c815e9341febcfaf3a70d)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `PUBLIC`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.
- `relation`, `role` 필터는 현재 로그인한 회원을 기준으로 하므로 인증이 필요하다.
- 목록은 `cursor`, `size` 기반 커서 페이지네이션을 사용한다.

#### Query Parameters

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `status` | GroupStatus | X | `ACTIVE`, `ENDED`. 생략 시 `ACTIVE` |
| `relation` | String | X | `joined`: 현재 사용자의 GroupMember가 존재하는 그룹만. 사용 시 MEMBER 권한 필요 |
| `role` | GroupMemberRole | X | `LEADER`, `MEMBER`. `relation=joined`일 때만 허용 |
| `type` | GroupType | X | `CLUB`, `STUDY`, `SESSION` |
| `recruiting` | Boolean | X | `true`이면 현재 모집 중인 공고가 있는 그룹만 |
| `keyword` | String | X | 이름·한 줄 소개 부분 일치 |
| `cursor` | String | X | 다음 페이지 커서 |
| `size` | Integer | X | 기본 20, 최소 1, 최대 100 |

##### 관계 필터 예시
- 내 소속 그룹: `GET /api/groups?relation=joined`
- 내가 모임장인 그룹: `GET /api/groups?relation=joined&role=LEADER`
- 내 종료 그룹: `GET /api/groups?status=ENDED&relation=joined`
- `owned`는 사용하지 않는다. 모임장은 소유자가 아니라 `GroupMember.role`이다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 12,
      "type": "STUDY",
      "status": "ACTIVE",
      "name": "알고리즘 스터디",
      "introduction": "매주 함께 문제를 풉니다.",
      "representativeImageUrl": "images/default-group.png",
      "leader": {"memberId": 3, "crewName": "크루A", "generation": 8},
      "memberCount": 6,
      "activeRecruitment": {
        "id": 45,
        "joinMethod": "APPROVAL",
        "capacity": 8,
        "approvedCount": 5,
        "startsAt": "2026-08-13T00:00:00",
        "endsAt": "2026-08-31T23:59:59"
      }
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
| relation 또는 role 사용 시 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| relation 없이 role 사용 | `INVALID_PARAMETER` | 400 |
| 정의되지 않은 필터 값 | `INVALID_PARAMETER` | 400 |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |

### `POST /api/groups`

- 설명: 그룹 개설
- 권한: `MEMBER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81199785e69ae2ee2c1b)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `MEMBER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.
- `meetingType`은 필수이며 `ONLINE`, `OFFLINE`, `FLEXIBLE` 중 하나를 사용한다. `FLEXIBLE`은 고정된 온라인·오프라인 방식 없이 유동적으로 정하는 경우다.
- `location`은 최대 255자의 nullable 문자열이다. 오프라인 장소 또는 온라인 접속 정보를 저장할 수 있다.
- `representativeImageKey`는 nullable 스토리지 키이며, `null`이면 기본 대표 이미지를 사용한다.

#### 요청 — CLUB 또는 STUDY

```json
{
  "type": "STUDY",
  "name": "알고리즘 스터디",
  "introduction": "매주 함께 문제를 풉니다.",
  "description": "문제 풀이와 코드 리뷰를 진행합니다.",
  "meetingType": "OFFLINE",
  "location": "서울 캠퍼스",
  "representativeImageKey": "groups/tmp/sample.webp",
  "recurringSchedule": {
    "daysOfWeek": ["MONDAY", "WEDNESDAY"],
    "startTime": "19:00:00",
    "endTime": "21:00:00"
  }
}
```

`recurringSchedule`을 생략하면 유동적 일정으로 생성한다.

#### 요청 — SESSION

```json
{
  "type": "SESSION",
  "name": "동시성 세션",
  "introduction": "한 번 진행하는 기술 세션입니다.",
  "description": null,
  "meetingType": "ONLINE",
  "location": "Zoom",
  "representativeImageKey": null,
  "sessionSchedule": {
    "sessionDate": "2026-08-20",
    "startTime": "19:00:00",
    "endTime": "21:00:00"
  }
}
```

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": 12,
    "status": "ACTIVE"
  },
  "error": null
}
```

```plain text
Location: /api/groups/12
```

#### 부수 효과
요청 회원의 `GroupMember(role = LEADER)`를 함께 생성한다. 모집 공고는 별도 API로 생성한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 이름 중복 | `GROUP_NAME_DUPLICATED` | 409 |
| type·문자열 제약 위반 | `INVALID_PARAMETER` | 400 |
| CLUB·STUDY에 sessionSchedule 전달 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| SESSION에 sessionSchedule 누락 | `SCHEDULE_REQUIRED` | 400 |
| 두 일정 동시 전달 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| 요일 비어 있음 또는 시작 시각이 종료 시각 이상 | `SCHEDULE_INVALID_RULE` | 400 |
| 대표 이미지 키 없음 | `IMAGE_NOT_FOUND` | 400 |

### `DELETE /api/groups/{groupId}`

- 설명: 생성 후 24시간 이내 그룹 삭제
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c818ebb5be57617dbe025)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청
Request Body는 없다.

#### 응답 204 No Content
본문이 없다.

#### 동작
- `ACTIVE`이고 생성 후 24시간 이내인 경우에만 가능하다.
- 그룹, 모집 공고, 신청, 구성원, 반복 일정 또는 세션 일정을 Hard Delete한다.
- `Group.status`를 변경하지 않는다.
- 삭제 요청을 종료 요청으로 자동 전환하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 생성 후 24시간 경과 | `GROUP_DELETE_WINDOW_EXPIRED` | 409 |
| 이미 ENDED 상태 | `GROUP_ENDED` | 409 |

### `GET /api/groups/{groupId}`

- 설명: 그룹 상세 조회
- 권한: `PUBLIC`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c811f8c11efef0f9cf241)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `PUBLIC`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### Path Parameters
- `groupId`: 조회할 그룹 식별자

#### 응답 200 — 반복 일정 그룹

```json
{
  "success": true,
  "data": {
    "id": 12,
    "type": "STUDY",
    "meetingType": "OFFLINE",
    "location": "서울 캠퍼스",
    "status": "ACTIVE",
    "name": "알고리즘 스터디",
    "introduction": "매주 함께 문제를 풉니다.",
    "description": "문제 풀이와 코드 리뷰를 진행합니다.",
    "representativeImageUrl": "images/default-group.png",
    "recurringSchedule": {
      "daysOfWeek": ["MONDAY", "WEDNESDAY"],
      "startTime": "19:00:00",
      "endTime": "21:00:00"
    },
    "sessionSchedule": null,
    "leader": {"memberId": 3, "crewName": "가온", "generation": 8},
    "memberCount": 6,
    "activeRecruitment": null,
    "currentMemberRole": null,
    "createdAt": "2026-08-13T10:00:00"
  },
  "error": null
}
```

유동적 CLUB·STUDY는 두 일정이 모두 `null`이다. SESSION은 `sessionSchedule`만 반환한다. ENDED 그룹도 직접 조회할 수 있다.
인증된 요청이면 `currentMemberRole`에 현재 사용자의 승인된 그룹 역할(`LEADER` 또는 `MEMBER`)을 반환하고, 비로그인 사용자나 미가입 사용자는 `null`을 반환한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |

### `PATCH /api/groups/{groupId}`

- 설명: 생성 후 24시간이 지난 그룹 종료
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c818798d5da6183638433)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청

```json
{
  "status": "ENDED"
}
```

`ACTIVE → ENDED` 단방향 상태 전이만 허용한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 12,
    "status": "ENDED",
    "updatedAt": "2026-08-15T10:00:01"
  },
  "error": null
}
```

#### 부수 효과
- `Group.status`를 `ACTIVE`에서 `ENDED`로 변경한다.
- 마감되지 않은 모집 공고를 마감한다.
- 해당 공고의 `PENDING` 신청을 `SYSTEM` 주체로 즉시 거절한다.
- 그룹과 모든 연관 이력을 보존하며 다시 `ACTIVE`로 되돌릴 수 없다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 생성 후 24시간 이내 | `GROUP_TERMINATION_NOT_AVAILABLE` | 409 |
| 이미 ENDED 상태 | `GROUP_ALREADY_ENDED` | 409 |
| ENDED 이외의 상태 요청 | `INVALID_PARAMETER` | 400 |

### `PUT /api/groups/{groupId}`

- 설명: 그룹 기본 정보 전체 교체
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c814f8ecbd4f9d57d6485)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청

```json
{
  "name": "새 그룹 이름",
  "introduction": "수정된 한 줄 소개",
  "description": "수정된 상세 소개",
  "meetingType": "ONLINE",
  "location": "Zoom",
  "representativeImageKey": "groups/tmp/new.webp"
}
```

- 수정 가능한 기본 정보의 전체 표현을 전달한다. 전달하지 않은 필드를 기존 값으로 보존하는 부분 수정은 지원하지 않는다.
- `description`, `location`, `representativeImageKey`는 nullable 필드지만 요청에 반드시 포함해야 하며, 비우려면 각각 `null`을 명시한다.
- `type`, `status`, 일정은 이 API에서 수정하지 않는다.
- `meetingType`과 `location`은 그룹의 모임 방식과 장소를 전체 교체한다. `meetingType`은 필수이며 `ONLINE`, `OFFLINE`, `FLEXIBLE` 중 하나를 보낸다. 장소를 비우려면 `null`을 명시한다.

#### 응답 200
수정된 그룹 상세 응답을 반환한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 그룹 이름 중복 | `GROUP_NAME_DUPLICATED` | 409 |
| 필수 필드 누락 또는 값 제약 위반 | `INVALID_PARAMETER` | 400 |
| 대표 이미지 키 없음 | `IMAGE_NOT_FOUND` | 400 |

### `PUT /api/groups/{groupId}/leader`

- 설명: 모임장 역할 위임
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c8143b792e46c75f448ff)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

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

### `DELETE /api/groups/{groupId}/recurring-schedule`

- 설명: 동아리·스터디를 유동적 일정으로 변경
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c810b92d4c4c5c1e6b48a)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청
Request Body는 없다.

#### 응답 204 No Content
반복 일정을 Hard Delete한다. 그룹 자체와 구성원·모집 이력은 유지한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| SESSION 그룹 | `SCHEDULE_TYPE_MISMATCH` | 409 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 등록된 반복 일정 없음 | `RECURRING_SCHEDULE_NOT_FOUND` | 404 |

### `PUT /api/groups/{groupId}/recurring-schedule`

- 설명: 동아리·스터디 반복 일정 등록 또는 교체
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81cea04bfb849923aa9c)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청

```json
{
  "daysOfWeek": ["TUESDAY", "THURSDAY"],
  "startTime": "19:30:00",
  "endTime": "21:30:00"
}
```

#### 응답 200

```json
{
  "success": true,
  "data": {
    "daysOfWeek": ["TUESDAY", "THURSDAY"],
    "startTime": "19:30:00",
    "endTime": "21:30:00"
  },
  "error": null
}
```

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| SESSION 그룹 | `SCHEDULE_TYPE_MISMATCH` | 409 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 요일 비어 있음 또는 시간 역전 | `SCHEDULE_INVALID_RULE` | 400 |

### `PUT /api/groups/{groupId}/session-schedule`

- 설명: 세션 일정 교체
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81c6812ecd5d487d4803)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청

```json
{
  "sessionDate": "2026-09-01",
  "startTime": "13:00:00",
  "endTime": "15:00:00"
}
```

SESSION의 일정은 필수이므로 삭제 API를 제공하지 않는다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "sessionDate": "2026-09-01",
    "startTime": "13:00:00",
    "endTime": "15:00:00"
  },
  "error": null
}
```

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| CLUB·STUDY 그룹 | `SCHEDULE_TYPE_MISMATCH` | 409 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 날짜 누락 또는 시간 역전 | `SCHEDULE_INVALID_RULE` | 400 |

## 모집 공고

### `GET /api/groups/{groupId}/recruitments`

- 설명: 그룹의 모집 공고 이력 조회
- 권한: `PUBLIC`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c8106a98befba48b242dc)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `PUBLIC`의 자격 증명 규칙을 적용한다.
- 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 목록은 `cursor`, `size` 기반 커서 페이지네이션을 사용한다.
- 모집 상태는 저장하지 않고 `startsAt`, `endsAt`, 현재 시각으로 계산한다.

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
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81b6bea4c71140d4e1fa)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 목록은 `cursor`, `size` 기반 커서 페이지네이션을 사용한다.
- 모집 상태는 저장하지 않고 `startsAt`, `endsAt`, 현재 시각으로 계산한다.

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
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81a08b3ee1589c4c4b3c)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `PUBLIC`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.
- 모집 상태는 저장하지 않고 `startsAt`, `endsAt`, 현재 시각으로 계산한다.

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
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c8112b804f4f8e46a9d5c)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.
- 모집 상태는 저장하지 않고 `startsAt`, `endsAt`, 현재 시각으로 계산한다.

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

## 가입 신청

### `GET /api/recruitments/{recruitmentId}/registrations`

- 설명: 모집 공고 신청자 목록 조회
- 권한: `LEADER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81f2988ecd9712f4d34d)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 신청 상태는 `PENDING → APPROVED | REJECTED`로만 변경된다.
- 신청 철회는 상태 변경이 아니라 `Registration` Hard Delete다.

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
        "generation": 8,
        "course": "FRONTEND"
      },
      "message": "함께 활동하고 싶습니다.",
      "status": "PENDING",
      "registeredAt": "2026-08-21T10:00:00",
      "decisionReason": null,
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
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c8103b56bebe2739897ec)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `MEMBER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 신청 상태는 `PENDING → APPROVED | REJECTED`로만 변경된다.
- 신청 철회는 상태 변경이 아니라 `Registration` Hard Delete다.

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
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81359821f3d2f0d0dff0)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `MEMBER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.
- 신청 철회는 상태 변경이 아니라 Registration Hard Delete다.

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
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81b48fb7d6cc94c7a2d8)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `LEADER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.
- 신청 상태는 `PENDING → APPROVED | REJECTED`로만 변경된다.

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
  "decisionReason": "현재 모집 인원이 모두 확정되었습니다."
}
```

`decisionReason`은 거절할 때 생략할 수 있으며 최대 1000자다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 88,
    "status": "APPROVED",
    "decisionReason": null,
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
| 정의되지 않은 status 또는 decisionReason 1000자 초과 | `INVALID_PARAMETER` | 400 |

### `GET /api/registrations?applicant=me`

- 설명: 내 가입 신청 목록 조회
- 권한: `MEMBER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81cd9250e7c5d4e1596e)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `MEMBER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.
- 여러 모집 공고에 걸친 Registration을 조회하는 검색용 컬렉션이다.
- 단일 Registration의 수정·삭제 경로로 사용하지 않는다.
- 목록은 `cursor`, `size` 기반 커서 페이지네이션을 사용한다.

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
      "group": {"id": 12, "name": "알고리즘 스터디"},
      "recruitmentId": 45,
      "message": "함께 활동하고 싶습니다.",
      "status": "PENDING",
      "registeredAt": "2026-08-21T10:00:00",
      "decisionReason": null,
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

## 그룹 구성원

### `GET /api/groups/{groupId}/members`

- 설명: 그룹 구성원 목록 조회
- 권한: `PUBLIC`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c81b68259d5ca2befc61e)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `PUBLIC`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 목록은 `cursor`, `size` 기반 커서 페이지네이션을 사용한다.

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
      "generation": 8,
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

## 이미지

### `POST /api/image-uploads`

- 설명: 이미지 업로드 리소스 생성
- 권한: `MEMBER`
- 원본: [Notion 상세 명세](https://app.notion.com/3bb0978a6e6c8102ac97ddc994a67f78)

#### 공통 계약
- Base Path는 `/api`이며 URL 버전은 붙이지 않는다.
- 권한 `MEMBER`의 자격 증명 규칙을 적용한다.
- 204를 제외한 응답은 `success`, `data`, `error` 봉투를 사용한다.
- 시간 값은 `Asia/Seoul` 기준이다.
- 오류 분기는 `error.code`를 기준으로 한다.

#### 요청

```json
{
  "fileName": "group.webp",
  "contentType": "image/webp",
  "fileSize": 1048576
}
```

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "imageKey": "groups/tmp/550e8400-e29b-41d4-a716-446655440000.webp",
    "uploadUrl": "https://storage.example.com/presigned-upload",
    "expiresAt": "2026-08-13T12:10:00"
  },
  "error": null
}
```

- 클라이언트는 제한된 시간과 객체 키에만 유효한 Presigned URL로 스토리지에 이미지 바이트를 직접 업로드한다.
- 그룹 생성·수정 API에는 URL이 아니라 `representativeImageKey`를 전달한다.
- 그룹 생성·수정 요청의 `representativeImageKey`는 아직 만료되지 않은 업로드 기록과 실제 스토리지 객체가 모두 존재해야 한다.

#### 생명주기
- 그룹에 연결된 `representativeImageKey`만 대표 이미지로 확정한다.
- 만료 시점까지 그룹에 연결되지 않은 임시 객체와 ImageUpload 기록은 정리 작업으로 삭제한다.
- Presigned URL은 스토리지 키나 장기 자격 증명을 노출하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 허용하지 않는 콘텐츠 타입 | `IMAGE_CONTENT_TYPE_NOT_ALLOWED` | 400 |
| 파일 크기 제한 초과 | `IMAGE_FILE_TOO_LARGE` | 400 |
| 스토리지 URL 발급 실패 | `IMAGE_UPLOAD_URL_ISSUE_FAILED` | 502 |
