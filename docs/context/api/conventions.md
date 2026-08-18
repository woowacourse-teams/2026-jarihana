# API 공통 설계

> 상태: Notion 설계 맥락 스냅샷
>
> 원본: [Notion 문서](https://app.notion.com/p/3bb0978a6e6c81aab624c61787d8be35)
>
> 동기화: 2026-08-15
>
> 구현·테스트·Swagger/OpenAPI와 충돌하면 임의로 해석하지 않고 차이를 보고한다.

저장소의 구속력 있는 API 문서화 규칙은 [API 문서화 컨벤션](../../conventions/api.md)을 따른다. 이 문서는 Notion에서 합의한 API 설계 의도를 전달하며, 실행 가능한 계약은 Swagger/OpenAPI와 인수 테스트로 검증한다.

## Base Path

```plain text
/api
```

URL에 버전 경로를 붙이지 않는다.

## 인증과 권한

| 권한 | 의미 | 자격 증명 |
| --- | --- | --- |
| `PUBLIC` | 누구나 접근 가능 | 없음 |
| `AUTH` | GitHub 인증 완료, 회원 가입 전후 | 가입 세션 또는 Access Token |
| `MEMBER` | 가입 완료 회원 | Access Token |
| `LEADER` | 해당 그룹의 현재 모임장 | Access Token + `GroupMemberRole.LEADER` |

- 신규 가입 구간은 서버 세션을 사용한다.
- 일반 API는 `Authorization: Bearer {accessToken}` 헤더를 사용한다.
- `LEADER` 권한은 요청 대상 그룹의 현재 `LEADER`인지 매 요청마다 검증한다.

## 페이지네이션
모든 목록 API는 무한 스크롤용 커서 방식을 사용한다.

| 구분 | 필드 | 규칙 |
| --- | --- | --- |
| 요청 | `cursor` | 첫 요청은 생략, 이후 응답의 `nextCursor` 사용 |
| 요청 | `size` | 기본 20, 최소 1, 최대 100 |
| 응답 | `items`, `nextCursor`, `hasNext` | 마지막 페이지는 `nextCursor = null`, `hasNext = false` |

기본 정렬은 `createdAt DESC, id DESC`이며, 커서는 정렬 기준 값을 불투명 문자열로 인코딩한다.

## 응답 형식
`204 No Content`를 제외한 성공과 실패 응답은 동일한 봉투를 사용한다.

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "GROUP_NOT_FOUND",
    "message": "그룹을 찾을 수 없습니다."
  }
}
```

- 클라이언트는 `error.code`로 분기한다.
- 필드 검증 오류는 `INVALID_PARAMETER`와 사용자용 한국어 메시지로 응답한다.
- 생성은 `201 Created`, 조회·상태 변경은 `200 OK`, 본문 없는 삭제·탈퇴는 `204 No Content`를 사용한다.

## 시간과 날짜
- 기준 시간대: `Asia/Seoul`
- `LocalDateTime`: `2026-08-13T19:00:00`
- `LocalDate`: `2026-08-13`
- `LocalTime`: `19:00:00`

## 주요 Enum

| 타입 | 값 |
| --- | --- |
| `GroupType` | `CLUB`, `STUDY`, `SESSION` |
| `GroupStatus` | `ACTIVE`, `ENDED` |
| `GroupMemberRole` | `LEADER`, `MEMBER` |
| `JoinMethod` | `AUTO`, `APPROVAL` |
| `RegistrationStatus` | `PENDING`, `APPROVED`, `REJECTED` |

## 주요 값 제약

| 필드 | 제약 |
| --- | --- |
| `Group.name` | 1~50자, 전역 중복 불가 |
| `Group.introduction` | 1~100자 |
| `Group.description` | 최대 5000자, 생략 가능 |
| `Member.crewName` | 완성형 한글 2~4자, 공백·특수문자 불가 |
| `Registration.message` | 최대 1000자, 생략 가능 |
| `Registration.decisionReason` | 최대 1000자, 생략 가능 |
| `GroupRecruitment.capacity` | 1 이상 |

## 일정 계약
- `CLUB`, `STUDY`: `recurringSchedule`만 허용하며 생략 시 유동적 일정이다.
- `SESSION`: `sessionSchedule`이 필수이며 `recurringSchedule`은 허용하지 않는다.
- 두 일정은 동시에 전달할 수 없다.
- 반복 일정은 하나 이상의 `daysOfWeek`와 공통 `startTime`, `endTime`을 가진다.
- 세션 일정은 `sessionDate`, `startTime`, `endTime`을 가진다.
- 두 일정 모두 `startTime < endTime`을 만족해야 한다.

## 그룹 삭제와 종료

| 명령 | 가능 조건 | 결과 |
| --- | --- | --- |
| 삭제 | `ACTIVE`, 생성 후 24시간 이내 | 그룹과 연관 데이터를 Hard Delete |
| 종료 | `ACTIVE`, 생성 후 24시간 초과 | `status = ENDED`, 이력 보존 |

삭제와 종료는 별도 엔드포인트다. 한 시점에는 둘 중 하나만 가능하며, 한 요청을 다른 요청으로 자동 전환하지 않는다.

## 조회 정책
- 일반 그룹 목록은 `ACTIVE` 그룹만 반환한다.
- 종료된 그룹은 별도 종료 그룹 목록에서 조회한다.
- `ENDED` 그룹은 조회만 가능하며 수정, 모집, 신청, 승인, 거절을 허용하지 않는다.

## 공통 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 요청 형식·필드 검증 실패 | `INVALID_PARAMETER` | 400 |
| 인증 정보 없음·만료 | `UNAUTHENTICATED` | 401 |
| 권한 부족 | `ACCESS_DENIED` | 403 |
| 리소스 없음 | `*_NOT_FOUND` | 404 |
| 현재 상태와 요청 충돌 | `*_CONFLICT` | 409 |

## 모집 마감 원인별 PENDING 처리

| 마감 원인 | 공고 처리 | `PENDING` 신청 처리 |
| --- | --- | --- |
| 새 공고 생성 | 같은 그룹의 기존 활성 공고를 현재 시각에 마감 | `SYSTEM` 주체로 즉시 `REJECTED` |
| 승인 인원 `capacity` 도달 | `endsAt = now`로 자동 마감 | `SYSTEM` 주체로 즉시 `REJECTED` |
| 정원 미달 상태의 모집 기간 만료 | 기존 `endsAt`에 따라 마감 | 즉시 거절하지 않고 마감 후 2주 동안 미처리된 신청을 `SYSTEM` 주체로 `REJECTED` |
| 운영자 수동 조기 마감 | `endsAt = now`로 마감 | 즉시 거절하지 않고 마감 후 2주 동안 미처리된 신청을 `SYSTEM` 주체로 `REJECTED` |
| 그룹 종료 | 마감되지 않은 공고를 즉시 마감 | `SYSTEM` 주체로 즉시 `REJECTED` |

- 한 번 마감된 공고는 다시 활성화하지 않는다. 재모집은 새 공고를 생성한다.
---
