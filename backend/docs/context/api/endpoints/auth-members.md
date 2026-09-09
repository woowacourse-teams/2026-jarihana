# 인증·회원

### `POST /api/auth/logout`

- 설명: 가입 세션 또는 Refresh Token 무효화
- 권한: `AUTH`

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

#### 요청
Refresh Token을 인증 계약에서 확정한 위치로 전달한다. Request Body는 없다.

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

#### 부수 효과
- 새 Access Token을 `accessToken` HttpOnly 쿠키로 전달한다.
- Refresh Token은 회전하지 않으며 기존 토큰을 유지한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| Refresh Token 없음 | `REFRESH_TOKEN_REQUIRED` | 401 |
| Refresh Token 만료·위조 | `REFRESH_TOKEN_INVALID` | 401 |
| 탈퇴 또는 존재하지 않는 회원 | `MEMBER_NOT_FOUND` | 404 |

### `POST /api/members`

- 설명: 회원 가입 완료
- 권한: `AUTH`

#### 요청

```json
{
  "memberType": "CREW",
  "crewName": "가온",
  "generation": 8,
  "course": "BACKEND"
}
```

- `githubId`는 Request Body가 아니라 가입 세션에서 읽는다.
- `memberType`은 `CREW` 또는 `COACH` 중 하나다.
- `memberType = CREW`이면 `course`는 `BACKEND`, `FRONTEND`, `ANDROID` 중 하나이고 `generation`은 양수 필수다.
- `memberType = COACH`이면 `course`와 `generation`을 생략한다.

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
- 이후 일반 API에서 사용할 토큰을 발급한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 가입 세션 없음·만료 | `SIGNUP_SESSION_REQUIRED` | 401 |
| 이미 가입한 GitHub 사용자 | `MEMBER_ALREADY_EXISTS` | 409 |
| crewName 형식 오류 | `INVALID_PARAMETER` | 400 |
| 같은 기수의 크루명 중복 또는 코치명·크루명 충돌 | `MEMBER_CREW_DUPLICATED` | 409 |
| memberType/course/generation 조합 오류 | `INVALID_PARAMETER` | 400 |

### `GET /api/members/me`

- 설명: 내 정보와 가입 완료 여부 조회
- 권한: `AUTH`

#### 요청
요청 값은 없다.

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

`memberType = COACH`인 회원은 `generation`과 `course`가 `null`이다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 가입 세션과 Access Token이 모두 없음 | `UNAUTHENTICATED` | 401 |

### `GET /api/oauth/github/authorization` (폐기)

이 엔드포인트는 만들지 않는다. 팀 회의에서 프론트엔드가 GitHub authorize URL로 직접 보내면
되므로 백엔드에 둘 이유가 없다고 결론지었다. 근거와 그에 따른 `state` 검증 방식은
[ADR 0003](../../../adr/0003-oauth-authorization-ownership.md)에 있다.

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

토큰 전달 방식은 [ADR 0002](../../../adr/0002-access-token-cookie.md)에서 확정했다. Access Token과
Refresh Token을 모두 `HttpOnly` 쿠키로 내린다. `state` 검증 방식은
[ADR 0003](../../../adr/0003-oauth-authorization-ownership.md)을 따른다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| code 또는 state 누락 | `OAUTH_INVALID_CALLBACK` | 400 |
| state 불일치·만료 | `OAUTH_STATE_INVALID` | 400 |
| GitHub 사용자 조회 실패 | `OAUTH_PROVIDER_ERROR` | 502 |
