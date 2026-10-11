# 초대

> 상태: 발급·회원 후보 검색·받은 초대 목록을 구현하고 실제 PostgreSQL·HTTP에서 검증했다.
> 발급 목록·상세·공개 미리보기·취소·수락 API는 아직 구현되지 않았다.
> 실행 계약은 Controller·DTO·ErrorCode와 RestAssured 인수 테스트로 확인한다. 저장소에는 OpenAPI 생성 의존성이 없어 자동 스키마 검증은 수행하지 않았다.

[공통 계약](../common-contract.md), [API 컨벤션](../../../conventions/api.md),
[초대 모델](../../domain/model/invitation.md),
[초대 비즈니스 정책](../../domain/business-policies.md#초대-발급과-합류),
[초대 불변식](../../domain/invariants.md#invitation--groupmember--registration)을 따른다.
기술 구조는 구현 단계에서 대안을 비교해 확정하며, 채택한 결정과 선택 이유를 백엔드 ADR에 기록한다.
시간 표현과 JSON 응답 봉투는 API 공통 계약을 따른다.

## 공통 규칙

- 인증 쿠키·응답 봉투·페이지네이션·날짜 형식은 API 공통 설계를 따른다.
- MEMBER는 서비스 가입 완료 권한이다. 각 API의 현재 소속·대상 회원·유형별 취소 권한을 서버에서 별도로 검증한다.
- 개인 목록·상세·발급 응답은 Cache-Control: no-store를 적용한다.
- 변경 요청은 XSRF-TOKEN 쿠키와 X-XSRF-TOKEN 헤더를 검증한다.
- 초대의 의미·만료 조건은 초대 모델에, 발급·합류·취소 흐름은 비즈니스 정책에 정의한다.
  이 문서는 해당 정책을 API 권한·입출력·상태·오류로 표현한다.

## API 목록

아래 경로는 /api를 포함한 외부 경로다.

| Method | 경로 | 권한 | 성공 | 변경 데이터 |
| --- | --- | --- | --- | --- |
| POST | /api/groups/{groupId}/invitations | MEMBER + 현재 소속 | 신규 201, 같은 요청 재처리 200 | 초대; DIRECT는 알림·구독별 전송 대기 |
| GET | /api/groups/{groupId}/invitations | MEMBER + 현재 소속 | 200 | 없음 |
| GET | /api/groups/{groupId}/invitation-candidates | MEMBER + 현재 소속, ACTIVE | 200 | 없음 |
| GET | /api/invitations/received | MEMBER | 200 | 없음 |
| GET | /api/invitations/{invitationId} | MEMBER + 지정 대상 또는 관리 권한 | 200 | 없음 |
| GET | /api/invitations/links/{token} | PUBLIC, 유효 형식 토큰 | 200 | 없음 |
| POST | /api/invitations/{invitationId}/acceptances | MEMBER + 수락 자격 | 신규 201, 기존 소속 200 | 소속·수락 이력·기존 PENDING의 초대 승인 |
| PATCH | /api/invitations/{invitationId}/revoke | MEMBER + 유형별 취소 권한 | 200 | revokedAt; 해당 초대의 미전송 알림 작업 정리 |

## 엔드포인트 상세

공통 예외는 아래 오류 계약을 따른다. 모든 ID는 양수이며 형식 오류는 INVALID_PARAMETER다.
목록 요청·응답·기본 정렬은 API 공통 계약의 커서 페이지네이션을 따른다.
응답 status는 ACTIVE·ACCEPTED·EXPIRED·REVOKED·GROUP_ENDED이며 의미와 표시 우선순위는 초대 모델을 따른다.
ALREADY_JOINED는 현재 소속에 대한 수락 결과이며 초대 status와 구분한다.

### `POST /api/groups/{groupId}/invitations`

- 설명: 두 유형의 초대 생성
- 권한: `MEMBER + ACTIVE 그룹의 현재 구성원`

#### Path Parameters

- `groupId`: 대상 그룹 식별자

#### 요청

```json
{
  "type": "DIRECT",
  "targetMemberId": 21,
  "message": "함께 활동해요.",
  "requestId": "5f7d4c53-3f10-4b78-a237-814f7e9e3439"
}
```

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| type | enum | DIRECT 또는 LINK |
| targetMemberId | Long/null | DIRECT는 필수 양수, LINK는 null |
| message | String/null | 선택, 최대 200자, 양끝 공백 제거 후 빈 값은 null |
| requestId | UUID | 발급 동작의 식별자. 통신 재시도에는 같은 값 사용 |

발급자 ID는 인증 정보에서 결정한다. DIRECT 대상은 가입 완료 회원이어야 하며 자기 자신·현재 구성원·탈퇴 회원은 제외한다.
메시지는 공백 정리 후 200자까지이며 requestId는 필수다.

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": 501,
    "groupId": 12,
    "type": "DIRECT",
    "targetMemberId": 21,
    "message": "함께 활동해요.",
    "createdAt": "2026-10-11T14:00:00",
    "expiresAt": null,
    "status": "ACTIVE",
    "sharePath": "/invitations/501",
    "reused": false
  },
  "error": null
}
```

- data 필드: id·groupId·type·targetMemberId·message·createdAt·expiresAt·status·sharePath·reused.
- sharePath는 서버가 결정한 내부 상대 경로다. DIRECT는 `/invitations/{id}`, LINK는 `/invitations/link/{token}`이다.
- 동일 발급자+requestId의 동일 요청 재시도는 200과 reused=true다. 모임·유형·대상·메시지가 다르면 INVITATION_REQUEST_CONFLICT다.
- 두 유형 모두 동일 요청 재시도에서 같은 sharePath를 반환한다. LINK는 권한 있는 관리 상세에서 나중에도 같은 링크를 다시 복사할 수 있다. 목록에서는 원본 경로를 제공하지 않는다.
- 다른 requestId의 명시적 신규 발급은 별도 초대다.

#### 부수 효과

DIRECT 신규 발급은 대상 회원에게 알림을 생성한다. LINK는 수신 회원 알림을 만들지 않는다.
같은 발급 요청 재시도는 초대·알림을 추가 생성하지 않는다. 알림의 외부 응답은 [알림 API](notifications.md#초대-알림-응답-확장-계약)를 따른다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 대상·유형·메시지·requestId 검증 실패 | `INVALID_PARAMETER` | 400 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 그룹 구성원이 아님 | `ACCESS_DENIED` | 403 |
| 종료된 그룹 | `GROUP_ENDED` | 409 |
| 대상이 현재 구성원 | `GROUP_MEMBER_ALREADY_EXISTS` | 409 |
| 동일 requestId에 다른 요청 내용 | `INVITATION_REQUEST_CONFLICT` | 409 |
| 공유 토큰 암복호화 키 누락·잘못된 설정·저장값 복원 실패 | `INVITATION_UNAVAILABLE` | 503 |

### `GET /api/groups/{groupId}/invitations`

- 설명: 본인 발급 초대 또는 모임장 관리 공유 링크 목록
- 권한: `MEMBER + 현재 구성원; MANAGED_LINKS는 현재 모임장`

#### Path Parameters

- `groupId`: 대상 그룹 식별자

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `scope` | X | MINE 기본 또는 MANAGED_LINKS |
| `cursor` | X | 다음 페이지 커서 |
| `size` | X | 기본 20, 1–100 |

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 501,
        "type": "DIRECT",
        "group": {
          "id": 12,
          "name": "자바 스터디"
        },
        "inviter": {
          "id": 3,
          "crewName": "가온"
        },
        "createdAt": "2026-10-11T14:00:00",
        "expiresAt": null,
        "status": "ACTIVE",
        "canRevoke": true,
        "message": "함께 활동해요."
      }
    ],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

- MINE은 본인이 발급한 두 유형, MANAGED_LINKS는 모임의 LINK 전체다. 일반 모임원은 타인 발급 목록을 조회할 수 없다.
- items 필드: id·type·group(id,name)·inviter(id,crewName)·createdAt·expiresAt·status·canRevoke.
- 본인 발급 항목에만 message를 포함한다. 타인 LINK 관리 항목에는 message를 제공하지 않는다.
- canRevoke는 현재 취소 권한을 서버에서 계산한 값이다. 취소 요청에서 권한을 다시 검사한다.

#### 부수 효과

조회는 데이터를 변경하지 않는다. 타인 DIRECT는 모임장 권한만으로 제공하지 않으며 토큰 원문을 반환하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 소속 또는 scope 권한 없음 | `ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| scope·cursor·size 오류 | `INVALID_PARAMETER` | 400 |

### `GET /api/groups/{groupId}/invitation-candidates`

- 설명: 지정 초대에 사용할 제한된 회원 검색
- 권한: `MEMBER + ACTIVE 그룹의 현재 구성원`

#### Path Parameters

- `groupId`: 대상 그룹 식별자

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `keyword` | O | 공백 제거 후 2–50자, crewName 검색 |
| `cursor` | X | 다음 페이지 커서 |
| `size` | X | 기본 20, 1–100 |

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "memberId": 21,
        "crewName": "마루",
        "generation": 8,
        "memberType": "CREW",
        "course": "FRONTEND"
      }
    ],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

items는 memberId·crewName·generation·memberType·course만 제공한다. 이메일·GitHub ID·가입일은 제공하지 않는다.

#### 부수 효과

현재 구성원·자신·탈퇴 회원을 제외한다. 후보 조회는 초대·소속·알림을 만들지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 구성원이 아님 | `ACCESS_DENIED` | 403 |
| 종료된 그룹 | `GROUP_ENDED` | 409 |
| 검색어·cursor·size 오류 | `INVALID_PARAMETER` | 400 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |

### `GET /api/invitations/received`

- 설명: 본인에게 온 지정 초대 목록
- 권한: `MEMBER`

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `cursor` | X | 다음 페이지 커서 |
| `size` | X | 기본 20, 1–100 |

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 501,
        "type": "DIRECT",
        "group": {
          "id": 12,
          "name": "자바 스터디"
        },
        "inviter": {
          "id": 3,
          "crewName": "가온"
        },
        "message": "함께 활동해요.",
        "createdAt": "2026-10-11T14:00:00",
        "expiresAt": null,
        "status": "ACTIVE",
        "canRevoke": false
      }
    ],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

본인을 대상으로 한 DIRECT만 반환한다. 항목에는 message를 포함하며 종료·취소·수락된 이력도 status와 함께 반환한다.
조회는 소속·신청 상태도 변경하지 않는다.

#### 부수 효과

대상 ID는 인증 정보에서 결정한다. 조회만으로 알림 읽음·초대 수락을 처리하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| cursor·size 오류 | `INVALID_PARAMETER` | 400 |

### `GET /api/invitations/{invitationId}`

- 설명: 본인의 지정 초대 또는 권한 있는 관리 상세 조회
- 권한: `MEMBER + 지정 대상/발급자; LINK는 발급자/현재 모임장`

#### Path Parameters

- `invitationId`: 초대 식별자

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 501,
    "type": "DIRECT",
    "group": {
      "id": 12,
      "name": "자바 스터디",
      "introduction": "함께 자바를 공부해요."
    },
    "inviter": {
      "id": 3,
      "crewName": "가온"
    },
    "message": "함께 활동해요.",
    "createdAt": "2026-10-11T14:00:00",
    "expiresAt": null,
    "status": "ACTIVE",
    "canAccept": true,
    "canRevoke": false,
    "sharePath": "/invitations/501"
  },
  "error": null
}
```

data 필드: id·type·group(id,name,introduction)·inviter(id,crewName)·message·createdAt·expiresAt·status·canAccept·canRevoke·sharePath.
sharePath는 DIRECT의 ID 경로 또는 LINK의 기존 공유 경로다. LINK는 현재 구성원인 발급자 또는 현재 모임장에게만 제공한다. 재복사는 새 발급이나 유효 기간 연장이 아니다.
DIRECT의 발급자·대상만 상세에 접근하며 모임장이라는 이유로 타인의 DIRECT를 열람할 수 없다.
LINK 관리 상세는 발급자·현재 모임장만 접근한다. 비회원에게 DIRECT 상세 정보를 제공하지 않는다.
그룹 삭제는 INVITATION_NOT_FOUND다. canAccept·canRevoke는 현재 권한과 상태를 서버에서 계산한 안내 값이며 변경 요청에서 재검증한다.

#### 부수 효과

만료·취소·종료는 권한 있는 사용자에게 200과 status로 안내한다. 상세 조회는 소속·수락 이력·신청 상태·알림 읽음 상태를 변경하지 않는다. 저장용 토큰 해시·암호문은 응답에 포함하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 지정 대상이 아닌 회원의 지정 링크 접근 | `INVITATION_ACCESS_DENIED` | 403 |
| 없거나 접근할 수 없는 관리 상세 | `INVITATION_NOT_FOUND` | 404 |

### `GET /api/invitations/links/{token}`

- 설명: 공유 초대의 공개 미리보기
- 권한: `PUBLIC`

#### Path Parameters

- `token`: LINK의 원본 공유 토큰

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 502,
    "type": "LINK",
    "group": {
      "id": 12,
      "name": "자바 스터디",
      "introduction": "함께 자바를 공부해요."
    },
    "inviter": {
      "id": 3,
      "crewName": "가온"
    },
    "message": "함께 활동해요.",
    "createdAt": "2026-10-11T14:00:00",
    "expiresAt": "2026-10-14T14:00:00",
    "status": "ACTIVE",
    "canAccept": true
  },
  "error": null
}
```

응답은 id·type·모임 이름/소개·발급자 표시명·message·생성/만료 시각·status·canAccept로 제한한다.
지정 대상 정보와 원본 토큰은 응답에 포함하지 않는다.

#### 부수 효과

canAccept는 초대 자체의 상태만 나타낸다. PUBLIC 조회가 회원 자격을 증명하지 않으며 수락 시 재검증한다. 만료·취소·종료 상태는 200으로 안내하고 조회는 소속·수락 이력·신청 상태·알림 읽음 상태를 변경하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 토큰 형식 오류 | `INVALID_PARAMETER` | 400 |
| 토큰 불일치·초대 없음·모임 삭제 | `INVITATION_NOT_FOUND` | 404 |

### `POST /api/invitations/{invitationId}/acceptances`

- 설명: 초대 수락으로 즉시 합류
- 권한: `MEMBER + DIRECT 지정 대상 또는 LINK 토큰 소지자`

#### Path Parameters

- `invitationId`: 초대 식별자

#### 요청

```json
{}
```

DIRECT의 요청은 위와 같이 빈 객체다. LINK는 다음과 같이 token을 전달한다.

```json
{"token": "공유-토큰"}
```

회원 ID와 그룹 ID는 클라이언트가 지정하지 않는다. token은 경로의 invitationId에 해당하는 LINK와 일치해야 한다.
대상 계정 또는 토큰 자격을 먼저 확인한다. ID만으로 공유 초대를 수락할 수 없다.

#### 응답 201

```json
{
  "success": true,
  "data": {
    "result": "JOINED",
    "invitationId": 501,
    "groupId": 12,
    "groupMemberId": 31,
    "joinedAt": "2026-10-11T14:05:00",
    "registrationOrigin": "INVITATION"
  },
  "error": null
}
```

#### 응답 200 — 이미 참여 중

```json
{
  "success": true,
  "data": {
    "result": "ALREADY_JOINED",
    "invitationId": 501,
    "groupId": 12,
    "groupMemberId": 31,
    "joinedAt": "2026-10-11T14:05:00"
  },
  "error": null
}
```

기존 groupMemberId·joinedAt을 반환하고 registrationOrigin은 생략한다.
대상/토큰 자격을 통과한 기존 구성원에게는 만료·취소 이후에도 새 합류와 구분해 안내한다.

#### 부수 효과

신규 합류는 소속·수락 이력·기존 PENDING 신청 승인을 부분 반영 없이 처리한다.
이미 참여 중이면 소속·수락 이력·신청 승인 결과를 추가하지 않는다.
합류와 신청 처리 규칙은 [초대 정책](../../domain/business-policies.md#기존-신청-이력과-모집-정원)을 따른다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 지정 계정 불일치 | `INVITATION_ACCESS_DENIED` | 403 |
| 공유 토큰 불일치·초대 없음 | `INVITATION_NOT_FOUND` | 404 |
| 시간 만료·발급자 소속 상실 | `INVITATION_EXPIRED` | 409 |
| 취소된 초대 | `INVITATION_REVOKED` | 409 |
| 종료된 그룹의 신규 합류 | `GROUP_ENDED` | 409 |

### `PATCH /api/invitations/{invitationId}/revoke`

- 설명: 발급된 초대 취소
- 권한: `MEMBER + DIRECT 발급자 또는 LINK 발급자/현재 모임장`

#### Path Parameters

- `invitationId`: 초대 식별자

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 501,
    "revokedAt": "2026-10-11T14:10:00",
    "status": "REVOKED"
  },
  "error": null
}
```

#### 부수 효과

권한을 매번 확인하며 이미 취소된 초대도 200과 최초 revokedAt을 반환한다.
기존 소속과 신청 결정은 되돌리지 않는다. 해당 초대의 미전송 알림 작업을 취소하되 이미 전송된 푸시 회수는 보장하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 유형별 취소 권한 없음 | `ACCESS_DENIED` | 403 |
| 초대 없음 | `INVITATION_NOT_FOUND` | 404 |
| 종료된 그룹 | `GROUP_ENDED` | 409 |

## 오류 계약

아래 공통 예외와 각 엔드포인트의 개별 예외를 함께 적용한다. 현재 INVITATION_REQUEST_CONFLICT·INVITATION_UNAVAILABLE를 구현했고 나머지 초대 전용 오류는 후속 단계에서 구현한다.
권한 확인은 초대 유효 상태나 개인정보 상세를 제공하기 전에 수행한다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| ID·필드·cursor 형식 오류 | INVALID_PARAMETER | 400 |
| 회원 인증 없음·가입 미완료 | UNAUTHENTICATED | 401 |
| 변경 요청의 CSRF 검증 실패 | ACCESS_DENIED | 403 |

## 관련 설계 문서

| 문서 | 책임 |
| --- | --- |
| [Invitation · InvitationAcceptance](../../domain/model/invitation.md) | 초대·수락의 필드·모델 규칙·관계 |
| [초대 불변식](../../domain/invariants.md#invitation--groupmember--registration) | 유일한 소속·수락 이력·모집 집계 관계 |
| [알림 응답](notifications.md#초대-알림-응답-확장-계약) | 지정 초대 알림의 eventType·target·표시 내용 |
| [초대 운영 확인사항](../../../operations/invitations.md) | 로그·민감정보 차단·배포 전 확인사항 |
| [초대 정책](../../domain/business-policies.md#초대-발급과-합류) | 발급·수락·취소·PENDING 승인·알림의 업무 흐름 |
