# ADR 0002. Access Token의 형식과 전달 방식

- 상태: 채택
- 날짜: 2026-08-19
- 관련 문서: [ADR 0001](0001-github-oauth-authentication.md), [보안과 개인정보](../conventions/security.md), [아키텍처 컨벤션](../conventions/architecture.md)
- 이 문서는 ADR 0001의 "일반 API는 `Authorization: Bearer` 헤더를 쓴다"는 결정을 대체한다.

## 배경

ADR 0001은 Refresh Token만 쿠키로 내리고, Access Token은 프론트엔드가
`POST /api/auth/refresh`로 받아 `Authorization: Bearer` 헤더에 실어 보내기로 했다.
다음 이유로 그 결정을 다시 검토해야 했다.

- 헤더 방식은 프론트엔드가 Access Token을 JavaScript가 읽을 수 있는 곳에 보관해야
  한다. XSS가 발생하면 토큰이 그대로 유출된다.
- 로그인 리다이렉트가 도착한 뒤 `POST /api/auth/refresh`를 한 번 더 호출해야 첫
  화면을 그릴 수 있다.
- 그룹 기능 담당자가 ADR 0001을 근거로 헤더에서 회원 식별자를 꺼내는 코드를
  준비하고 있어, 전달 경로를 확정하지 않으면 서로 다른 전제로 구현이 갈린다.

ADR 0001의 후속 작업에도 "Access Token의 형식과 유효 기간은 별도 ADR로 남긴다"가
남아 있었다.

## 결정

1. Access Token은 HMAC-SHA256(HS256)으로 서명한 JWT를 사용한다. 서명 비밀키는 환경
   변수로 주입하고 저장소에 커밋하지 않는다.
2. Access Token은 `HttpOnly` 쿠키로 전달한다. 이름은 `accessToken`, 경로는 `/`,
   유효 기간은 설정값 `jarihana.auth.jwt.validity`(기본 1시간)를 따른다.
   `Authorization: Bearer` 헤더는 사용하지 않는다.
3. 페이로드에는 아래 세 개만 둔다.

```json
{
  "sub": "83",
  "iat": 1787369828,
  "exp": 1787373428
}
```

- `sub`: `Member.id`를 문자열로 담는다. 회원 식별은 이 값 하나로 한다.
- `iat`, `exp`: 발급 시각과 만료 시각.
- 권한 클레임은 두지 않는다.

4. 인증과 인가의 책임을 나눈다.

```text
SecurityFilterChain, 인증 필터  토큰이 유효한가          실패 시 401 UNAUTHENTICATED
HandlerMethodArgumentResolver   memberId를 컨트롤러로    @LoginMember Long memberId
Service, 도메인                 이 리소스에 권한이 있나  실패 시 403 ACCESS_DENIED
```

5. Access Token을 쿠키로 두므로 상태를 변경하는 요청에 CSRF 토큰을 요구한다. 검증
   실패는 `ACCESS_DENIED`(403)로 응답한다.

## 권한 클레임을 두지 않는 이유

- `Member`에는 전역 역할 필드가 없다. 지금 넣으면 모든 토큰에 같은 상수가 들어가
  유효한 토큰을 가졌다는 사실 이상을 전달하지 못한다.
- 현재 유일한 역할인 `GroupMemberRole`(LEADER, MEMBER)은 `GroupMember`에 붙은
  그룹별 값이다. 한 회원이 여러 그룹에서 서로 다른 역할을 가지므로 전역 배열로
  표현할 수 없다.
- 토큰 유효 기간 동안 값이 낡는다. `transferLeadershipTo`로 리더가 바뀌어도 이미
  발급된 토큰은 그대로다. 그룹 권한에서 낡은 값은 곧 틀린 값이다.

따라서 그룹 권한은 `GroupMember`를 조회해 판단한다. `Member`에 전역 역할(예: 운영자)이
생기면 그때 클레임 추가를 다시 검토한다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| `Authorization: Bearer` 헤더 (ADR 0001의 결정) | CSRF 방어가 필요 없고 크로스 오리진 구성이 단순하다 | 프론트엔드가 토큰을 JavaScript가 읽는 곳에 보관해야 해 XSS 시 그대로 유출된다 |
| 페이로드에 `roles` 배열 포함 | 권한 검사에서 저장소 조회를 줄인다 | 역할이 그룹별이라 전역 배열로 표현할 수 없고, 유효 기간 동안 낡은 값이 남는다 |
| 회원 식별에 `githubId` 사용 | GitHub 응답 값을 그대로 쓴다 | 외부 식별자라 제공자 추가나 계정 변경에 취약하고, 도메인 참조는 모두 `Member.id`다 |
| 불투명 토큰과 저장소 조회 | 즉시 폐기할 수 있다 | 요청마다 저장소를 읽어야 하고 Refresh Token과 역할이 겹친다 |
| 경로 기반 인가(`requestMatchers().hasRole()`) | 설정 한 곳에서 관리한다 | 인가 기준이 리소스 소유 관계라 URL 규칙으로 표현할 수 없다 |

## 결과

- 프론트엔드는 Access Token을 저장하지도, 헤더에 싣지도 않는다. 로그인 리다이렉트
  이후 별도 호출 없이 보호 API를 호출할 수 있다.
- `Authorization` 헤더를 읽는 코드는 만들지 않는다.
- 상태를 변경하는 요청에 CSRF 토큰이 필요하다. 프론트엔드가 함께 보내야 한다.
- 프론트엔드(`localhost:5173`)와 백엔드(`localhost:8080`)의 오리진이 달라 SPA의
  XHR은 cross-site다. `SameSite=Lax`로는 쿠키가 실리지 않으므로 CORS 허용과
  `credentials: 'include'`, 쿠키의 `SameSite`와 `Secure` 값을 배포 구성과 함께
  정해야 한다.
- 토큰 자체로는 즉시 폐기할 수 없다. 로그아웃은 쿠키 제거와 Refresh Token 폐기로
  처리하며, 남은 유효 기간(최대 1시간) 동안 기존 Access Token은 유효하다.

## 후속 작업

- CORS 허용 오리진과 운영 환경의 쿠키 `SameSite`, `Secure`, 도메인 값을 배포 구성과
  함께 확정한다.
- CSRF 토큰 저장소와 프론트엔드 전달 방식을 정한다.
- `POST /api/auth/refresh`와 `POST /api/auth/logout`이 이 쿠키를 갱신하고 제거하는
  방식을 구현한다.
- 서명 비밀키의 주입 경로와 교체 절차를 정한다.
