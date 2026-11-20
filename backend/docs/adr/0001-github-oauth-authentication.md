# ADR 0001. GitHub OAuth 로그인의 세션과 토큰 전달 방식

- 상태: 채택
- 날짜: 2026-08-19
- 관련 문서: [API 엔드포인트 설계](../context/api/endpoints/README.md), [보안과 개인정보](../conventions/security.md), [영속성 컨벤션](../conventions/persistence.md)
- 결정 4의 Access Token 전달 방식은 [ADR 0002](0002-access-token-cookie.md)로 대체되었다.
- 결정 2의 `state` 보관 방식은 [ADR 0004](0004-oauth-authorization-ownership.md)로 대체되었다.
- 개정: 2026-08-27. 후속 작업의 쿠키 도메인과 `Secure` 항목은
  [ADR 0009](0009-aws-deployment-topology.md)가 단일 오리진 구성을 확정하면서 닫혔다.
- 개정: 2026-09-02. 후속 작업 중 구현이 끝난 항목과 다른 ADR이 가져간 항목을 닫는다. 남은 것은
  만료 Refresh Token 정리뿐이다.
- 개정: 2026-11-20. 마지막 후속 작업인 만료 Refresh Token 정리를 닫는다.
  [백엔드 ADR 0031](0031-refresh-token-rotation-and-reuse-detection.md)이 갱신마다 회전하고 회전된 행을
  남기기로 하면서 행이 갱신마다 늘어 정리가 필수가 되었다. 정리 방식은 후속 작업 항목에 적는다.

## 배경

`GET /api/oauth/github/callback`을 구현하려면 다음 두 가지를 정해야 했다.

- OAuth 위조 방지용 `state`를 어디에 보관하고 어떻게 검증할지
- 가입 완료 회원에게 Access Token과 Refresh Token을 어떤 저장소와 전달 방식으로 제공할지

두 번째 항목은 설계 맥락 문서에도 "결정 필요"로 남아 있었다. 콜백 응답이 302 리다이렉트이므로
응답 본문으로 토큰을 내려줄 수 없고, 전달 위치를 먼저 확정해야 구현할 수 있었다.

## 결정

1. 가입 구간의 서버 세션은 이미 도입한 Spring Session JDBC를 사용한다.
2. `state`는 인가 시작 시 세션에 저장하고, 콜백에서 읽는 즉시 제거해 1회만 사용한다.
   값 비교는 `MessageDigest.isEqual`로 수행한다.
3. 미가입 사용자는 `githubId`를 가입 세션에 보관하고 `signupRequired=true`로 리다이렉트한다.
4. 가입 회원에게는 Refresh Token만 쿠키로 내려준다.
   `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`를 적용하고 만료는 설정값을 따른다.
   Access Token은 프론트엔드가 리다이렉트 도착 후 `POST /api/auth/refresh`로 받는다.
5. Refresh Token은 32바이트 난수를 Base64URL로 인코딩한 불투명 문자열로 발급하고,
   저장소에는 SHA-256 해시만 저장한다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| Access Token과 Refresh Token을 모두 쿠키로 전달 | 프론트엔드 추가 호출이 없다 | 일반 API는 `Authorization: Bearer` 헤더를 쓰기로 했는데 자격 증명 전달 경로가 이중이 된다 |
| 리다이렉트 URL의 쿼리나 프래그먼트로 토큰 전달 | 구현이 가장 단순하다 | 토큰이 URL과 브라우저 이력, 리퍼러, 서버 로그에 남는다 |
| 서명한 JWT를 Refresh Token으로 사용하고 저장하지 않음 | 저장소가 필요 없다 | 로그아웃과 회전에서 개별 폐기가 불가능하고 서명 키 관리 결정이 추가로 필요하다 |
| `state`를 값 자체로 조회하는 별도 저장소에 보관 | 세션 없이 검증할 수 있다 | 브라우저 세션과 묶이지 않아 CSRF 방지 강도가 떨어진다 |

## 결과

- 콜백은 성공 시 항상 `302`로 `{frontendOrigin}/oauth/callback?signupRequired=true|false`로 이동한다.
- Refresh Token 저장소가 유출되어도 원문 토큰을 복원할 수 없다.
- `state`를 한 번 쓰면 같은 값으로 다시 콜백을 처리할 수 없다.

## 후속 작업

- ~~`POST /api/auth/refresh`와 `POST /api/auth/logout`은 이 저장소를 사용해 검증, 회전, 폐기를
  구현한다.~~ 완료. 두 엔드포인트 모두 `AuthCommandController`에 있다.
- ~~만료된 Refresh Token을 정리하는 방법을 정한다.~~ **닫힘(2026-11-20).**
  [`RefreshTokenCleaner`](../../src/main/java/com/project/jarihana/auth/command/service/RefreshTokenCleaner.java)가
  1시간마다 다음 행을 지운다.
  - 절대 만료(`absolute_expires_at`)에서 하루가 지난 패밀리와 그 패밀리의 토큰. 폐기된 패밀리도 같은
    기준으로 지우므로 폐기 사유는 절대 만료 뒤 하루까지 남는다.
  - 패밀리 없이 저장된 이전 행 중 `expires_at`에서 하루가 지난 행

  살아 있는 패밀리의 회전된 토큰은 자기 `expires_at`이 지나도 재사용 감지에 쓰이므로 남긴다. 하루의
  여유는 만료 직전에 시작한 갱신 요청이나 앱 사이의 시계 차이와 겹치지 않게 둔다. 패밀리와 이전 행을
  한 트랜잭션에서 각각 최대 100개씩 지우고, 남은 대상은 같은 실행 안에서 새 트랜잭션으로 이어서
  지운다. Blue와 Green이 함께 떠 있으면 양쪽에서 실행되지만 대상을 `FOR UPDATE SKIP LOCKED`로 잠가
  나누므로 서로 기다리거나 같은 행을 두 번 지우지 않는다. 지우기만 하는 작업이라 푸시 워커 같은 처리
  권한(`worker_authority`)은 쓰지 않는다.
  주기, 여유 시간과 묶음 크기는 `jarihana.auth.refresh-token-cleanup` 설정을 따르며, 여러 컨텍스트가
  DB를 함께 쓰는 테스트에서는 `enabled: false`로 끈다.
- ~~운영 환경의 쿠키 도메인과 `Secure` 적용 범위를 배포 구성과 함께 확정한다.~~
  **닫힘(2026-08-27).** [ADR 0009](0009-aws-deployment-topology.md)가 CloudFront 단일 진입점을
  확정하면서 프론트엔드와 API가 같은 오리진이 됐다. 쿠키에 도메인을 지정하지 않고(host-only)
  `SameSite=Lax`를 쓰며, `Secure`는 운영 `true`, 로컬 `false`다. 상위 도메인을 공유해야 한다는
  전제가 사라졌으므로 도메인 값을 따로 정하지 않는다.
- ~~Access Token의 형식과 유효 기간은 `POST /api/auth/refresh` 구현 시 별도 ADR로 남긴다.~~
  완료. [ADR 0002](0002-access-token-cookie.md)가 그 ADR이다. HS256 JWT에 유효 기간 1시간으로
  정했다.
