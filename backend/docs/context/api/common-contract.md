# API 공통 설계

> 상태: 저장소 최신 설계 기준
>
> 구현·테스트와 충돌하면 임의로 해석하지 않고 차이를 보고한다.

저장소의 구속력 있는 API 문서화 규칙은 [API 문서화 컨벤션](../../conventions/api.md)을 따른다. 이 문서는 저장소에 정리된 최신 API 설계 의도를 전달하며, 실제 계약은 Controller·요청/응답 DTO·ErrorCode와 RestAssured 인수 테스트로 확인한다.

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
- 일반 API는 `accessToken` HttpOnly 쿠키를 사용한다. `Authorization: Bearer {accessToken}` 헤더는 사용하지 않는다.
- `LEADER` 권한은 요청 대상 그룹의 현재 `LEADER`인지 매 요청마다 검증한다.

### CSRF

- `POST`, `PUT`, `PATCH`, `DELETE` 요청은 인증 여부와 별도로 CSRF 검증을 통과해야 한다. 공개 토큰 재발급과 가입 세션 기반 요청도 포함한다.
- 먼저 조회 요청으로 받은 `XSRF-TOKEN` 쿠키 값을 `X-XSRF-TOKEN` 헤더에 전달하고, 쿠키도 함께 전송한다. 이 쿠키는 프론트엔드가 읽을 수 있도록 HttpOnly가 아니며 경로는 `/`다.
- CSRF 쿠키 또는 헤더가 없거나 값이 일치하지 않으면 `ACCESS_DENIED`와 `403`으로 응답한다. 인증 정보가 없는 변경 요청도 CSRF 검증에서 먼저 거절될 수 있다.
- `GET`, `HEAD`, `OPTIONS`, `TRACE`는 CSRF 검증 대상이 아니다.

## 페이지네이션
그룹·모집 공고·신청·구성원·활동 기록·댓글·초대·알림함·푸시 구독 목록은 커서 방식을 사용한다.
달력은 `from`·`to` 조회 범위를 사용하고, 신청 요약·안 읽은 알림 수는 페이지네이션하지 않는다.

| 구분 | 필드 | 규칙 |
| --- | --- | --- |
| 요청 | `cursor` | 첫 요청은 생략, 이후 응답의 `nextCursor` 사용 |
| 요청 | `size` | 기본 20, 최소 1, 최대 100 |
| 응답 | `items`, `nextCursor`, `hasNext` | 마지막 페이지는 `nextCursor = null`, `hasNext = false` |

정렬 기준은 목록마다 다르며, 커서는 해당 기준 값을 URL-safe Base64 문자열로 인코딩한다.

| 목록 | 정렬 |
| --- | --- |
| 그룹·모집 공고·초대·초대 후보·알림함·푸시 구독 | `createdAt DESC, id DESC` |
| 가입 신청·내 가입 신청 | `registeredAt DESC, id DESC` |
| 그룹 구성원 | `joinedAt DESC, id DESC` |
| 활동 기록 | `activityDate DESC, id DESC` |
| 활동 기록 댓글 | `createdAt ASC, id ASC` |

커서의 형식 검증 범위와 빈 문자열 처리, 조회 회원·필터에 대한 결합 여부는 각 상세 문서를 따른다.
커서에 공통 유효 기간은 없으며 시간 경과만으로 만료시키지 않는다.
잘못된 형식의 `cursor`와 허용 범위를 벗어난 `size`는 `INVALID_PARAMETER`로 응답한다.

## 응답 형식
JSON API 응답은 아래 봉투를 사용한다. `204 No Content`와 `3xx` 리다이렉트에는 본문이 없다.
`GET /api/share/groups/{groupId}`의 성공 응답은 `text/html`이며 JSON 봉투를 사용하지 않는다.
해당 엔드포인트의 오류는 공통 JSON 오류 봉투를 사용한다.

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
- 필드 검증 오류는 `INVALID_PARAMETER`와 사용자용 한국어 메시지로 응답하며, 필드별 상세 오류는 제공하지 않는다.
- 생성은 기본적으로 `201 Created`, 조회·상태 변경은 `200 OK`, 본문 없는 삭제는 `204 No Content`를 사용한다. 초대·푸시 구독의 재사용/갱신은 `200`, 초대 거절과 하트 추가·취소는 `204`, 활동 기록 숨김은 `200`과 JSON 본문을 반환하므로 각 엔드포인트의 성공 상태를 따른다.
- nullable 필드는 기본적으로 JSON `null`로 반환한다. DTO에서 `@JsonInclude(NON_NULL)`을 지정한 필드는 생략하며, 가입·신청·초대·알림의 구체적인 생략 규칙은 해당 상세 문서를 따른다.

## 리다이렉트 응답

`3xx` 리다이렉트 응답은 JSON 응답 봉투를 사용하지 않는다.
이동 위치는 `Location` 헤더로 전달하며 응답 본문은 없다.

현재 리다이렉트 응답을 사용하는 엔드포인트는 `GET /api/oauth/github/callback`과
이미지 접근 판정 후 CDN 전달 URL로 이동하는 `GET /api/images/{imageKey}`다.

## 날짜·시간 형식
- 기준 시간대: `Asia/Seoul`
- 날짜: `YYYY-MM-DD` (예: `2026-08-13`)
- 날짜·시간: `YYYY-MM-DDTHH:mm:ss` (예: `2026-08-13T19:00:00`)
- 시각: `HH:mm:ss` (예: `19:00:00`)

날짜·시간과 시각은 ISO 로컬 형식이며, 초 이하 소수 부분이 포함될 수 있다
(예: `2026-08-13T19:00:00.123456`). UTC `Z`나 시간대 offset을 붙이지 않는다.

## 공통 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 요청 형식·필드 검증 실패 | `INVALID_PARAMETER` | 400 |
| 인증 정보 없음·만료 | `UNAUTHENTICATED` | 401 |
| 권한 부족 | `ACCESS_DENIED` | 403 |
| 리소스 없음 | `GROUP_NOT_FOUND`, `REGISTRATION_NOT_FOUND` 등 | 404 |
| 존재하지 않거나 사용할 수 없는 이미지 참조 | `IMAGE_NOT_FOUND` | 400 |
| 현재 상태와 요청 충돌 | `GROUP_ENDED`, `REGISTRATION_ALREADY_DECIDED`, `*_CONFLICT` 등 | 409 |
| 낙관적 버전 충돌 또는 제한된 동시성 재시도 소진 | `CONCURRENT_MODIFICATION` | 409 |
| 이미 모임장인 대상에게 위임 또는 종료된 그룹의 위임 | `GROUP_MEMBER_ALREADY_LEADER`, `LEADER_DELEGATION_NOT_ALLOWED_FOR_ENDED_GROUP` | 422 |
| 외부 OAuth·이미지 업로드 URL 발급 실패 | `OAUTH_PROVIDER_ERROR`, `IMAGE_UPLOAD_URL_ISSUE_FAILED` | 502 |
| 웹푸시 비활성·공유 초대 토큰 처리 불가 | `PUSH_UNAVAILABLE`, `INVITATION_UNAVAILABLE` | 503 |
| 처리되지 않은 서버 오류 | `INTERNAL_ERROR` | 500 |

오류 코드의 접미사만으로 HTTP 상태를 추론하지 않는다. 정확한 매핑은 `ErrorCode`와 각 API의 오류 표를 따른다.
