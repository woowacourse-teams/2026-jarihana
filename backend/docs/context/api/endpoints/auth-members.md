# 인증·회원

인증 쿠키와 변경 요청의 CSRF 요구 사항은 [API 공통 계약](../common-contract.md)을 따른다.
아래 쿠키 이름·경로·유효 기간은 현재 설정 기본값이다.

### `POST /api/auth/logout`

- 설명: 가입 세션과 전달된 Refresh Token 무효화, 인증 쿠키 만료
- 권한: 가입 세션, 유효한 `accessToken` 또는 저장소에 남아 있는 `refreshToken` 중 하나

#### 요청
Request Body 없이 기존처럼 호출할 수 있다. 현재 브라우저 푸시 연결을 함께 해제할 때는
JSON 본문 `{ "pushSubscriptionId": 81, "generation": 1 }`을 전달한다.
본문을 보내면 `Content-Type: application/json`이어야 하고 1,024바이트 이하여야 한다.
`pushSubscriptionId`와 `generation`은 모두 양수인 Long 값으로 함께 전달한다.
필드·소유권·실패 시 롤백 규칙은 [알림함·웹푸시의 로그아웃 확장](notifications.md#기존-로그아웃의-호환-확장)을 따른다.

#### 응답 204 No Content
본문이 없다.

#### 부수 효과
- 존재하는 가입 세션을 무효화하고 `accessToken`, `refreshToken` 쿠키를 만료시킨다.
- 요청의 `refreshToken`이 저장소에 있으면 해당 토큰을 폐기한다. 만료된 토큰도 로그아웃에서는 자격 증명으로 인정한다.
- Access Token만으로도 로그아웃할 수 있지만, 전달하지 않은 Refresh Token을 모두 폐기하지는 않는다.
- 선택적 푸시 본문이 있으면 현재 연결 버전을 검증하고 구독 해제·미완료 전송 취소·토큰 폐기를 같은 TX로 처리한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| CSRF 토큰 없음·불일치 | `ACCESS_DENIED` | 403 |
| 가입 세션·유효한 Access Token·저장된 Refresh Token이 모두 없음 | `UNAUTHENTICATED` | 401 |
| 푸시 본문의 형식·필수 값 오류 | `INVALID_PARAMETER` | 400 |
| 푸시 본문 사용 시 회원 자격 없음·회원 조회 실패·Access/Refresh 회원 불일치 | `UNAUTHENTICATED` | 401 |
| 푸시 구독 없음·다른 회원·연결 버전 불일치 | `PUSH_SUBSCRIPTION_NOT_FOUND` | 404 |

### `POST /api/auth/refresh`

- 설명: Access Token 재발급
- 권한: `PUBLIC`

#### 요청
`refreshToken` HttpOnly 쿠키로 전달한다(쿠키 경로 `/api/auth`). Request Body는 없다.
`PUBLIC`은 Access Token이 필요 없다는 뜻이며, 이 POST 요청에도 공통 CSRF 검증을 적용한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "expiresIn": 3600
  },
  "error": null
}
```

`expiresIn`은 Long 타입의 초 단위 유효 기간이며, 설정된 Access Token 유효 기간을 반환한다.
기본값은 3,600초다. 토큰 원문은 JSON 본문에 포함하지 않는다.

#### 부수 효과
- 새 Access Token을 `accessToken` HttpOnly 쿠키로 전달한다.
- Refresh Token은 회전하지 않으며 기존 토큰을 유지한다.
- 서비스에서 재발급을 거부하면 두 인증 쿠키를 만료시킨다. CSRF 필터에서 거부한 요청에는 이 처리를 적용하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| CSRF 토큰 없음·불일치 | `ACCESS_DENIED` | 403 |
| Refresh Token 없음 | `REFRESH_TOKEN_REQUIRED` | 401 |
| Refresh Token 만료·위조 | `REFRESH_TOKEN_INVALID` | 401 |

### `POST /api/members`

- 설명: 회원 가입 완료
- 권한: GitHub 인증을 완료한 가입 세션 필수(Access Token만으로 가입할 수 없음)

#### 요청

```json
{
  "memberType": "CREW",
  "crewName": "가온",
  "generation": 8,
  "course": "BACKEND"
}
```

| 필드 | 타입 | 필수 |
| --- | --- | --- |
| `memberType` | String enum (`CREW`, `COACH`) | O |
| `crewName` | String | O |
| `generation` | Integer | `CREW`일 때 O |
| `course` | String enum (`BACKEND`, `FRONTEND`, `ANDROID`) | `CREW`일 때 O |

- `githubId`는 Request Body가 아니라 가입 세션에서 읽는다.
- `crewName`은 공백·특수문자 없이 완성형 한글 2–4자다.
- `memberType`은 `CREW` 또는 `COACH` 중 하나다.
- `memberType = CREW`이면 `course`는 `BACKEND`, `FRONTEND`, `ANDROID` 중 하나이고 `generation`은 양수 필수다.
- `memberType = COACH`이면 `course`와 `generation`을 생략하거나 `null`로 전달한다. 다른 값을 전달하면 거부한다.

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": 12,
    "crewName": "가온",
    "memberType": "CREW",
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
- 이후 일반 API에서 사용할 Access Token과 Refresh Token을 각각 HttpOnly 쿠키로 발급한다.
- `memberType = COACH`인 응답의 `generation`과 `course`는 `null`이다.

응답의 `id`는 Long, `generation`은 Integer 또는 `null`, `joinedAt`은 날짜·시간 문자열이다.
`crewName`, `memberType`, `course`는 요청과 같은 타입이며 `course`는 코치일 때 `null`이다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| CSRF 토큰 없음·불일치 | `ACCESS_DENIED` | 403 |
| 가입 세션 없음·만료 | `SIGNUP_SESSION_REQUIRED` | 401 |
| 이미 가입한 GitHub 사용자 | `MEMBER_ALREADY_EXISTS` | 409 |
| crewName 형식 오류 | `INVALID_PARAMETER` | 400 |
| 같은 기수의 크루명 중복, 코치명 중복 또는 코치명·크루명 충돌 | `MEMBER_CREW_DUPLICATED` | 409 |
| memberType/course/generation 조합 오류 | `INVALID_PARAMETER` | 400 |

### `GET /api/members/me`

- 설명: 내 정보와 가입 완료 여부 조회
- 권한: `AUTH`

#### 요청
Query Parameter와 Request Body는 없다. 가입 세션 또는 `accessToken` 쿠키가 필요하다.
둘 다 있으면 Access Token의 회원 정보를 우선한다. Refresh Token만으로는 조회할 수 없다.

#### 응답 200 — 가입 전

```json
{
  "success": true,
  "data": {
    "signupCompleted": false,
    "avatarUrl": "https://avatars.githubusercontent.com/u/123456",
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
      "memberType": "CREW",
      "generation": 8,
      "course": "BACKEND",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123456"
    }
  },
  "error": null
}
```

프로필 이미지 URL은 저장하지 않고 `githubId`로 구성한다.
가입 완료 응답에는 최상위 `avatarUrl` 필드가 없고 `member.avatarUrl`만 있다.

`memberType = COACH`인 회원은 `generation`과 `course`가 `null`이다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 가입 세션과 Access Token이 모두 없음 | `UNAUTHENTICATED` | 401 |
| 가입 세션 없이 유효하지 않은 Access Token만 있음, 또는 토큰의 회원이 없음 | `UNAUTHENTICATED` | 401 |

### `GET /api/oauth/github/authorization` (폐기)

이 엔드포인트는 만들지 않는다. 팀 회의에서 프론트엔드가 GitHub authorize URL로 직접 보내면
되므로 백엔드에 둘 이유가 없다고 결론지었다. 근거와 그에 따른 `state` 검증 방식은
[ADR 0004](../../../adr/0004-oauth-authorization-ownership.md)에 있다.

이 엔드포인트는 현재 설계에서 제외되었다. 관련 결정이 다시 되살아나지 않도록 주의한다.
`OAUTH_CONFIGURATION_ERROR`도 이 엔드포인트에서만 쓰이던 코드이므로 사용하지 않는다.

### `GET /api/oauth/github/callback`

- 설명: GitHub OAuth 콜백 처리
- 권한: `PUBLIC`

#### 요청

| Query | 필수 | 설명 |
| --- | --- | --- |
| `code` | O | GitHub 인가 코드 |
| `state` | O | 프론트엔드가 인가 시작 시 만들어 쿠키와 이 쿼리 양쪽에 실은 검증 값 |

`code`와 `state`는 비어 있거나 공백이어도 거부한다. 검증 쿠키의 기본 이름은 `oauthState`다.

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
- 요청의 `state` 쿼리와 프론트엔드가 심은 `oauthState` 쿠키를 대조한다. 성공 여부와 무관하게 쿠키를 만료시킨다(`Path=/`).

토큰 전달 방식은 [ADR 0002](../../../adr/0002-access-token-cookie.md)에서 확정했다. Access Token과
Refresh Token을 모두 `HttpOnly` 쿠키로 내린다. `state` 검증 방식은
[ADR 0004](../../../adr/0004-oauth-authorization-ownership.md)를 따른다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| code 또는 state 누락·공백 | `OAUTH_INVALID_CALLBACK` | 400 |
| state 쿠키 없음·공백·값 불일치 | `OAUTH_STATE_INVALID` | 400 |
| GitHub 토큰 교환 또는 사용자 조회 실패 | `OAUTH_PROVIDER_ERROR` | 502 |
