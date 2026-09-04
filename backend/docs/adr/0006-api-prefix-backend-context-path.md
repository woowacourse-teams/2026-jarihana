# ADR 0006. `/api` 접두사를 백엔드 context-path로 받는다

- 상태: 채택
- 날짜: 2026-08-24
- 관련 문서: [ADR 0005](0005-remove-local-development-auth-bypass.md),
  [`/api` 접두사는 누가 떼는가](../retrospective/api-prefix-troubleshooting.md)
- 이 문서는 `/api` 접두사를 떼는 책임을 엣지 계층에서 백엔드 애플리케이션으로 옮긴다.

## 배경

프론트엔드는 경로만 보고 목적지를 가릴 수 있도록 API를 `/api/...`로 호출한다. `/groups`는 SPA
라우트이고 `/api/groups`는 데이터 요청이다. 그런데 컨트롤러는 `/api` 없이 매핑되어 있었다.

```java
@RequestMapping("/groups")          // GroupQueryController
@RequestMapping("/oauth/github")    // GithubOAuthCommandController
```

브라우저가 보내는 경로와 백엔드가 아는 경로가 다르니 누군가는 중간에서 `/api`를 떼야 한다.
그런데 그 책임이 어디에도 적혀 있지 않았다.

로컬에서는 webpack에 설정한 개발 서버 프록시가 그 일을 맡고 있었다.

```js
{ context: ["/api"], pathRewrite: { "^/api": "" }, target: "http://localhost:8080" }
```

운영에는 그 프록시가 없다. 배포된 프론트엔드는 정적 파일이고, 경로를 보고 목적지를 고르는 일은
CloudFront가 맡는다. 다만 CloudFront 동작은 어느 origin으로 보낼지만 정할 뿐 경로는 건드리지
않는다. 그래서 `/api/groups`가 그대로 백엔드에 도착했고, `SecurityConfig`의 매처와 맞지 않아
마지막 `anyRequest().authenticated()`에 걸렸다.

```text
https://jarihana.com/api/groups            401
https://jarihana.com/api/zzz-nonexistent   401
```

`GET /groups`는 `PUBLIC_GET_PATHS`에 있어 인증 없이 200이어야 한다. 그런데 존재하지도 않는
경로와 응답이 똑같다. 인증 문제가 아니라 매핑이 없다는 뜻이다. 매핑이 없을 때 404가 아니라 401이
나오는 것은 Spring Security가 컨트롤러를 찾기 전에 인가부터 판단하기 때문인데, 그래서 진단이
오래 걸렸다.

정리하면 접두사를 떼는 규칙이 로컬에만 있고 운영에는 없었다. 두 환경이 어긋난 채로 로컬만
통과하고 있었던 것이다.

## 결정

1. 백엔드가 `/api`를 직접 받는다. `application.yaml`에 `server.servlet.context-path: /api`를 준다.
2. 개발 서버 프록시의 `pathRewrite`를 제거한다. 프록시는 경로를 있는 그대로 전달한다.
3. `SecurityConfig`의 매처는 고치지 않는다. context-path 기준 상대 경로라 `/groups` 그대로 맞는다.
4. 테스트 설정에도 같은 context-path를 주고 `RestAssured.basePath`를 설정값에서 읽어 맞춘다.

```text
application.yaml                 context-path: /api 추가
webpack.config.mjs               프록시의 pathRewrite 제거
SecurityConfig                   무수정
IntegrationTestSupport           RestAssured.basePath = ${server.servlet.context-path}
```

## 왜 이 방법인가

**접두사 규칙을 한 곳에만 둔다.** 접두사를 엣지에서 떼려면 같은 규칙을 개발 서버 설정과
CloudFront Function에 하나씩, 서로 다른 두 기술에 나눠 심어야 한다. 그 둘이 어긋나면 어떻게
되는지는 이미 겪었다. 환경이 갈려서 하루를 날린 직후에 갈리는 지점을 하나 더 만들 이유가
없었다.

**프론트엔드가 환경을 몰라도 된다.** `/api`가 로컬에서도 운영에서도 같은 문자열이니 "지금 개발
모드인가"를 묻는 분기가 필요 없다. 그 자리는 하드코딩 한 줄이 대신한다.

```js
baseUrl = "/api/"        // frontend/src/shared/api/client.js
```

로컬에서 돌려보자고 프론트엔드에 분기를 심는 습관은 이미 한 번 대가를 치렀다.
[ADR 0005](0005-remove-local-development-auth-bypass.md)에서 폐지한 개발 계정 우회로가 그것이고,
멀쩡한 로그인을 가려 버렸다. 같은 종류의 분기를 API 주소에서도 없앨 수 있다면 없앤다.

**비용은 알고 고른다.** 이 결정을 받아들이면 백엔드는 `/api` 밖 경로를 받지 못한다. 공짜라서
고른 것이 아니라, 미룰 수 있는 비용과 이미 치른 비용을 견준 결과다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| A. 엣지에서 뗀다 (개발 서버 프록시 + CloudFront Function) | 앱이 배포 구조를 몰라도 된다. 접두사는 인프라가 아는 정보로 남는다 | 같은 규칙을 서로 다른 두 기술에 나눠 둬야 한다. 이번 장애가 바로 그 둘이 어긋나서 난 것이다. CloudFront Function을 새로 짜고 운영해야 한다 |
| B. context-path로 받는다 | 자르는 주체 자체가 사라진다. 설정 한 줄이면 되고 `SecurityConfig`도 프론트엔드 코드도 그대로다 | **채택** |
| C. 컨트롤러 매핑에 `/api`를 직접 박는다 | 인프라 설정 없이 코드만으로 끝난다 | 모든 컨트롤러와 `SecurityConfig` 매처를 함께 고쳐야 하고, 앞으로 추가할 컨트롤러마다 접두사를 기억해야 한다. 한 번 빠뜨리면 같은 401이 재발한다 |
| D. 로컬 프록시만 고친다 (현상 유지) | 로컬 로그인이 당장 된다 | 운영은 그대로 깨져 있다. 로컬이 말끔하게 돌아가는 탓에 오히려 운영의 구멍이 가려진다 |

CloudFront의 Origin Path도 살펴봤지만 쓸 수 없다. Origin Path는 원본에 요청을 보낼 때 지정한
경로를 **앞에 덧붙이는** 기능이라 방향이 반대다.

## 제약과 전제

- **백엔드는 `/api` 밖 경로를 받을 수 없다.** 외부가 경로를 정해 주는 웹훅이나 헬스체크
  (`/actuator/health`)가 생기면 걸린다. 지금 이 프로젝트에는 actuator도 swagger도 없어 해당 사항이
  없고, 생기면 그때 비용을 낸다.
- 정적 리소스도 context-path 아래로 딸려 들어간다. `8080/images/...`는 404가 되고
  `8080/api/images/...`가 200이 된다. 아래 후속 작업 참조.
- `SecurityConfig`의 매처가 context-path 기준 상대 경로라는 전제에 기댄다. 매처를 절대 경로로
  바꾸거나 서블릿 경로 기준으로 옮기면 이 전제가 깨진다.
- 테스트가 main 설정을 통째로 덮어쓰지 않아야 한다. 그전에는 테스트 설정이 main을 가려서 경로
  구조가 아예 검증되지 않았다. 이 장애가 테스트를 다 통과하고도 살아남은 이유 중 하나다.

## 결과

- 접두사를 떼는 규칙 자체가 사라진다. 로컬과 운영이 같은 경로를 같은 방식으로 처리한다.
- 로컬에서 로그인이 되면 운영에서도 같은 경로로 통한다는 근거가 생긴다. ADR 0005가 인증 경로에서
  확보한 성질을 경로 계층에서도 얻는 셈이다.
- CloudFront는 `/api/*`를 백엔드로, 나머지를 S3로 보내는 분기만 유지한다. 새 함수가 필요 없다.
- 프론트엔드는 `/api/`를 하드코딩한다. 환경별 분기가 없다.
- **경로를 명시하지 않은 쿠키가 `/api`로 좁혀진다.** context-path는 서블릿 경로만 바꾸는 것이
  아니라, 경로를 지정하지 않은 쿠키의 기본 `Path`도 된다. 이 결정을 적용한 다음 날 CSRF 쿠키가
  `Path=/api`로 내려갔고, 루트에서 뜨는 SPA가 그 토큰을 읽지 못해 모든 변경 요청이 403으로 막혔다.
  [ADR 0004](0004-csrf-token-delivery.md)에 결정 6으로 쿠키 경로를 `/`로 명시해 닫았다.
  Access Token 쿠키는 [ADR 0002](0002-access-token-cookie.md)가 처음부터 경로를 `/`로 정해
  두어 영향을 받지 않았다. **앞으로 추가하는 쿠키는 경로를 반드시 명시한다.**

## 후속 작업

- **기본 그룹 이미지의 자리를 정한다.** context-path 때문에 백엔드 정적 이미지가 `/api` 아래로
  딸려 들어갔고, 지금은 `frontend/public/images/default-group.png`와
  `backend/src/main/resources/static/images/default-group.png`가 둘 다 있다. 프론트엔드의
  `groupImageUrl`은 여전히 `/api`를 붙여 백엔드 쪽을 가리킨다. 파일을 프론트엔드로 넘기고
  `/api` 접두사를 떼는 방향으로 정리한다.
  **갱신(2026-08-27).** "백엔드에는 업로드 기능이 없고 플레이스홀더 한 장뿐"이라는 전제는 더
  이상 맞지 않는다. 2026-08-26에 S3 기반 이미지 업로드가 들어오면서 사용자 이미지는 CloudFront 공개
  URL로 나간다. 다만 기본 이미지 `images/default-group.png`는 여전히 백엔드 정적 리소스이고 두 곳에
  그대로 남아 있어, 정리 방향은 그대로 유효하다. 이미지 업로드 결정 자체는 별도 ADR로 다룬다.
- actuator나 웹훅을 도입할 때 이 결정을 다시 본다. 그때는 대안 A의 비용을 새로 계산한다.
