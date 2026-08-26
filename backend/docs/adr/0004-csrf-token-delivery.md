# ADR 0004. CSRF 토큰의 저장소와 전달 방식

- 상태: 채택
- 날짜: 2026-08-20
- 관련 문서: [ADR 0002](0002-access-token-cookie.md), [ADR 0003](0003-oauth-authorization-ownership.md),
  [보안과 개인정보](../conventions/security.md), [API 공통 설계](../context/api/conventions.md)
- 이 문서는 ADR 0002가 후속 작업으로 남긴 "CSRF 토큰 저장소와 프론트엔드 전달 방식"을 정한다.
- 개정: 2026-08-27. 최초 채택본은 쿠키 이름과 `HttpOnly` 여부만 정하고 **경로를 정하지 않았다.**
  [ADR 0006](0006-api-prefix-backend-context-path.md)이 백엔드에 context-path를 주면서 그 빈틈이
  드러나 모든 변경 요청이 403으로 막혔다. 결정 6으로 경로를 명시한다.
- 개정: 2026-08-27. 후속 작업의 CORS 항목은 [ADR 0008](0008-aws-deployment-topology.md)이
  단일 오리진 구성을 확정하면서 닫혔다.

## 배경

ADR 0002가 Access Token을 쿠키로 전달하기로 하면서 상태를 변경하는 요청에 CSRF 토큰이
필요해졌다. 브라우저가 쿠키를 자동으로 실어 보내므로 요청이 우리 프론트엔드에서 시작됐는지
확인할 다른 수단이 있어야 한다. 그 토큰을 어디에 담고 프론트엔드에 어떻게 건넬지는 정하지
못한 채 후속 작업으로 남겼다.

`POST /api/members`를 구현하면서 이 결정을 더 미룰 수 없게 됐다. 정하지 않으면 이 엔드포인트를
호출할 수 있는 클라이언트가 존재하지 않는다.

Spring Security의 기본 구성은 CSRF 토큰을 **지연 생성**한다. 토큰을 읽는 지점이 있을 때만
발급하고 저장한다. 서버가 화면을 렌더링하는 애플리케이션에서는 폼에 토큰을 심는 순간이 그
지점이 된다. 그런데 이 프로젝트는 JSON만 주고받는 API이고 프론트엔드가 화면을 그리므로 토큰을
읽는 지점이 어디에도 없다. 결과적으로 토큰이 한 번도 발급되지 않고, 프론트엔드가 토큰을 얻을
방법이 없어 모든 상태 변경 요청이 403으로 막힌다.

기본 저장소인 `HttpSessionCsrfTokenRepository`도 같은 문제를 겪는다. 토큰이 세션 안에만 있어
브라우저의 JavaScript가 읽을 수 없다.

## 결정

1. CSRF 토큰 저장소로 `CookieCsrfTokenRepository.withHttpOnlyFalse()`를 사용한다. 서버가
   `XSRF-TOKEN` 쿠키로 토큰을 내려보낸다. 프론트엔드 JavaScript가 읽어야 하므로 `HttpOnly`를
   적용하지 않는다.
2. 지연 생성을 끈다. `CsrfTokenRequestAttributeHandler`의
   `setCsrfRequestAttributeName(null)`을 적용해 매 요청에서 토큰을 즉시 확정하고 쿠키로 내린다.
3. 프론트엔드는 `XSRF-TOKEN` 쿠키 값을 읽어 상태를 변경하는 요청의 `X-XSRF-TOKEN` 헤더에 그대로
   실어 보낸다. 쿠키와 헤더 양쪽에 같은 값이 담기는 double submit이다.
4. 검증 실패는 `ACCESS_DENIED`(403)로 응답한다. 필터 단계에서 발생하므로
   `common.auth.AccessDeniedResponder`가 공통 오류 형식으로 만든다.
5. 조회 요청(`GET`, `HEAD`, `OPTIONS`, `TRACE`)에는 토큰을 요구하지 않는다. Spring Security의
   기본 동작을 그대로 둔다.
6. `XSRF-TOKEN` 쿠키의 경로는 사이트 루트 `/`로 **명시한다**(2026-08-27 추가).
   `CookieCsrfTokenRepository.setCookiePath("/")`를 적용한다.

경로를 지정하지 않으면 Spring Security가 context-path를 쿠키 경로로 쓴다.
[ADR 0006](0006-api-prefix-backend-context-path.md)이 `server.servlet.context-path: /api`를 준
뒤로 쿠키가 `Path=/api`로 내려갔고, 루트 경로에서 뜨는 프론트엔드 문서는 `document.cookie`로 그
쿠키를 읽지 못한다. 토큰을 읽지 못하면 `X-XSRF-TOKEN` 헤더를 채울 수 없고, 결정 4에 따라 모든
변경 요청이 403 `ACCESS_DENIED`로 거부된다. Access Token 쿠키는 [ADR 0002](0002-access-token-cookie.md)가
처음부터 경로를 `/`로 못 박아 두어 이 문제를 겪지 않았다.

## 왜 double submit인가

쿠키는 브라우저가 자동으로 싣지만 **다른 오리진의 스크립트는 그 값을 읽을 수 없다.** 공격자가
피해자 브라우저로 요청을 위조할 수는 있어도 쿠키 값을 읽어 헤더에 담을 수는 없으므로, 헤더와
쿠키가 일치한다는 사실이 요청 주체가 우리 프론트엔드임을 증명한다.

같은 구조를 이미 OAuth `state` 검증에 쓰고 있다([ADR 0003](0003-oauth-authorization-ownership.md)).
두 곳이 같은 패턴을 쓰면 프론트엔드가 익힐 규칙이 하나로 줄어든다.

## BREACH 마스킹을 쓰지 않는 이유

Spring Security의 기본 핸들러는 `XorCsrfTokenRequestAttributeHandler`다. 응답마다 토큰을 다른
값으로 마스킹해 BREACH 공격을 막는다. 이 결정은 그 핸들러를 쓰지 않는다.

마스킹은 클라이언트가 **마스킹된 값을 되돌려보낼 것**을 전제한다. 쿠키에 담긴 원본 값을 그대로
헤더에 싣는 double submit과는 맞지 않아, 실제로 적용하면 모든 요청이 403으로 거부된다.

BREACH는 압축된 HTTPS **응답 본문**에 비밀값이 들어 있고 공격자가 그 본문의 일부를 조작할 수 있을
때 성립한다. 이 프로젝트는 CSRF 토큰을 응답 본문에 담지 않고 `Set-Cookie` 헤더로만 내보내므로 그
전제가 성립하지 않는다. 서버가 렌더링한 HTML에 토큰을 심게 되면 이 판단을 다시 검토해야 한다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| 기본값 유지(세션 저장소, 지연 생성) | 설정이 없다 | 토큰이 세션 안에만 있어 프론트엔드가 읽을 수 없고, 지연 생성이라 발급조차 되지 않는다 |
| CSRF 보호 비활성화 | 프론트엔드와 백엔드 양쪽에서 할 일이 없다 | 쿠키 인증을 택한 이상 상태 변경 요청이 그대로 위조에 열린다 |
| Access Token을 헤더로 전달 | CSRF 자체가 필요 없다 | ADR 0002가 XSS 노출을 이유로 이미 기각했다 |
| `SameSite=Strict` 쿠키에만 의존 | 서버 구성이 단순하다 | 브라우저 지원과 구현 차이에 기대게 된다. 로그인 리다이렉트가 `Lax`를 요구해 쿠키 정책을 나누어야 한다 |
| 상태 변경 요청에 임의의 커스텀 헤더만 요구 | 토큰 관리가 없다 | CORS preflight에만 기대는 방식이라 서버 CORS 설정이 느슨해지면 함께 무너진다 |

## 제약과 전제

- **`XSRF-TOKEN` 쿠키는 `HttpOnly`가 아니다.** 프론트엔드가 읽어야 하므로 불가피하다. XSS가
  성립하면 읽히지만, CSRF 토큰의 위협 모델은 XSS가 아니다. XSS가 있으면 이미 더 큰 문제가 있다.
- **쿠키 도메인 전제는 ADR 0003과 같다.** 프론트엔드와 백엔드가 상위 도메인을 공유해야 한다.
- **CORS 설정은 필요하지 않다**(2026-08-27 갱신). 최초 채택 시점에는 다른 오리진에서 쿠키를
  주고받는 경우를 전제로 CORS 구성이 함께 필요하다고 적었다. [ADR 0008](0008-aws-deployment-topology.md)이
  CloudFront 단일 진입점을 확정하면서 그 전제가 사라졌다. 운영은 CloudFront 한 오리진에서
  `/api/*`만 백엔드로 보내고, 로컬은 개발 서버 프록시가 같은 오리진을 만든다. 두 환경 모두
  same-origin이므로 백엔드에 CORS 구성을 두지 않는다. 프론트엔드는 `credentials: "include"`만
  사용한다. 별도 오리진에서 API를 호출해야 할 일이 생기면 이 항목과 ADR 0008을 함께 재검토한다.
- **쿠키 경로가 context-path와 분리되어 있다.** 결정 6이 `/`로 고정한다. context-path를 바꾸거나
  `setCookiePath` 호출을 지우면 같은 403이 재발한다. 이 회귀는
  `CsrfCookieAcceptanceTest`가 막는다.

## 결과

- 프론트엔드는 상태를 변경하는 모든 요청에 `X-XSRF-TOKEN` 헤더를 실어야 한다. 누락하면 403
  `ACCESS_DENIED`로 거부된다.
- 첫 요청부터 쿠키가 내려오므로 토큰을 얻기 위한 전용 엔드포인트를 두지 않는다.
- OAuth `state`와 CSRF 토큰이 같은 double submit 규칙을 쓴다.
- 서버가 렌더링하는 화면을 도입하면 BREACH 판단을 다시 검토해야 한다.

## 후속 작업

- ~~CORS 허용 오리진과 허용 헤더, 자격 증명 허용 여부를 배포 구성과 함께 확정한다.~~
  **닫힘(2026-08-27).** [ADR 0008](0008-aws-deployment-topology.md)이 CloudFront 단일 진입점으로
  same-origin을 확정했다. CORS 구성을 두지 않는다. 위 제약과 전제 참조.
- 프론트엔드에 쿠키 읽기와 헤더 주입을 공통 HTTP 클라이언트에 넣도록 전달한다.
