# ADR 0005. 로컬 개발 인증 우회의 제거

- 상태: 채택
- 날짜: 2026-08-24
- 관련 문서: [ADR 0001](0001-github-oauth-authentication.md), [ADR 0003](0003-oauth-authorization-ownership.md),
  [보안과 개인정보](../conventions/security.md), [테스트](../conventions/testing.md)
- 이 문서는 로컬 개발 환경에서 GitHub OAuth를 우회하던 고정 회원 인증을 폐지한다.

## 배경

개발 환경에는 GitHub OAuth 대신 고정 회원으로 인증하는 우회로가 있었다.

```text
백엔드    LocalDevelopmentAuthenticationFilter
          jarihana.auth.local-development.{enabled, member-id}
프론트    developmentAuth.js의 localStorage 플래그
          모든 요청에 X-Jarihana-Development-Auth 헤더 주입
          AppHeader 라벨을 "개발 계정으로 시작"으로 교체
```

근거는 "로컬에서 OAuth 테스트를 제대로 할 수 없다"였다. 2026-08-24에 그 전제가 사실인지 직접
확인해 봤고, 사실이 아니었다.

### 1. 로컬 OAuth는 동작한다

GitHub 토큰 엔드포인트에 가짜 인가 코드와 redirect_uri를 함께 보내면, redirect_uri 검증을
통과했는지가 오류 코드로 갈린다.

```text
redirect_uri=http://localhost:5173/api/oauth/github/callback  ->  bad_verification_code
redirect_uri=http://localhost:5173/oauth/github/callback      ->  redirect_uri_mismatch
```

`bad_verification_code`는 우리가 넣은 가짜 코드 때문에 나는 오류다. 즉 redirect_uri 검증은 이미
통과했다는 뜻이다. 콜백이 컨트롤러까지 도달하는 것도 확인했고, 실제 브라우저 로그인이 가입
세션(`signup.githubId`)을 만드는 데까지 성공했다.

> 이 검증 시점에는 개발 서버 프록시가 `pathRewrite`로 `/api` 접두사를 떼서 컨트롤러에 넘겼다.
> 같은 날 이후 백엔드가 `context-path: /api`로 접두사를 직접 받게 바뀌어 프록시는 경로를 그대로
> 전달한다. 콜백이 컨트롤러에 도달한다는 결론은 그대로지만 도달 방식이 다르다. 경위는
> [ADR 0006](0006-api-prefix-backend-context-path.md)에 있다.

### 2. GitHub App이라 callback URL을 여러 개 둘 수 있다

client id가 `Iv23li`로 시작하는 GitHub App이다. GitHub App은 callback URL을 최대 10개까지
등록할 수 있어 운영 주소와 로컬 주소가 나란히 존재할 수 있다. OAuth App이었다면 callback URL이
하나뿐이라 운영과 로컬을 동시에 둘 수 없고, 그런 상황이라면 우회로에도 근거가 생긴다. 이
프로젝트는 거기에 해당하지 않는다.

### 3. 유일한 사용처가 개발 빌드의 로그인 버튼이었다

개발 빌드에서 "개발 계정으로 시작"을 누르면 `login()`이 `enableDevelopmentLogin()`으로 플래그를
켜고 GitHub 왕복 없이 끝난다. 그때부터 모든 API 요청에 `X-Jarihana-Development-Auth` 헤더가
붙는다. 개발자는 로그인 버튼을 눌러 왔지만 OAuth를 지나간 적은 없었다.

자동화된 검증 쪽은 이 경로에 의존하지 않았다.

- Playwright E2E는 `NODE_ENV=production`으로 빌드하므로 이 경로를 타지 않는다.
- 백엔드 인수 테스트는 `GithubOAuthClientStub`을 쓴다. 필터를 쓰는 것은 자기 자신의 단위
  테스트뿐이었다.

결국 이 우회로를 실제로 쓰는 것은 사람뿐이었고, 정작 그 사람은 자기가 무엇을 건너뛰고 있는지
알기 어려웠다. 라벨이 "개발 계정으로 시작"이라, 눌렀을 때 GitHub로 넘어가지 않는 것이 원래
그런 동작처럼 보였기 때문이다.

### 4. 한 번 켜지면 꺼지지 않고, 켜져 있으면 로그인을 깨뜨린다

같은 가입 세션 쿠키로 `/members/me`를 두 번 호출한 결과다.

```text
세션 쿠키만            200  {"signupCompleted":false,"member":null}
세션 쿠키 + 개발 헤더  401  UNAUTHENTICATED
```

필터가 `member-id: 1`로 인증을 통과시키는데, 그 회원이 없으면 조회가 실패한다. 게다가
`MemberQueryService.findMyProfile`이 `memberId` 분기를 먼저 타므로, 멀쩡한 가입 세션이 있어도
그 분기까지 가보지도 못하고 묻힌다.

플래그는 스스로 꺼지지도 않는다. `disableDevelopmentLogin()`은 `sessionExpiredHandler`에서만
호출되는데, 부트스트랩은 `refreshOnce`를 건너뛰고 `client.refresh()`를 직접 부르는 데다 `getMe`도
`authRetry: false`로 보내므로 그 핸들러가 아예 타지 않는다. 로그아웃을 누르지 않는 한 브라우저에
그대로 남아, 이후의 멀쩡한 GitHub 로그인까지 계속 401로 만든다. 실제로 이 조합 때문에 GitHub
인증을 정상적으로 마치고 돌아온 사용자가 "로그인을 마치지 못했어요" 화면을 봤다.

## 결정

1. 로컬 개발 인증 우회를 제거한다. 개발 환경도 운영과 같은 GitHub OAuth 경로를 탄다.
2. 백엔드에서 `LocalDevelopmentAuthenticationFilter`와 `jarihana.auth.local-development.*` 설정을
   삭제한다.
3. 프론트엔드에서 `developmentAuth.js`, `X-Jarihana-Development-Auth` 헤더 주입,
   `developmentLoginAvailable`을 삭제한다. 로그인 버튼 라벨은 "GitHub로 로그인" 하나로 통일한다.
4. 로컬 개발자는 GitHub App에 등록된 로컬 callback URL과 `.env`의 `GITHUB_OAUTH_*` 값으로 실제
   OAuth를 사용한다.

## 왜 남기지 않는가

- **근거가 사실이 아니었다.** 남겨 둘 이유를 찾지 못했다.
- **자동화된 검증이 이 경로에 기대지 않는다.** E2E도 인수 테스트도 쓰지 않았다. 사람만 쓰는
  경로였고, 그 경로가 OAuth를 가려 왔다.
- **인증 경로가 둘이면 로컬 통과가 운영 통과를 보장하지 않는다.** 우회로로 화면을 확인한 개발자는
  OAuth 경로가 깨져 있어도 알아채지 못한다.
- **보안 표면이 줄어든다.** 운영에 필터가 실리지 않도록 local 프로필, 루프백 주소, 이미 인증된
  요청은 건드리지 않기, 전용 헤더까지 가드를 네 겹으로 둘러야 했다. 없애면 그 가드가 계속
  유효한지 지켜볼 일도 사라진다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| A. 고쳐서 유지 | 오프라인에서도 화면을 확인할 수 있다 | 시드 회원 추가, `findMyProfile` 폴백, `enableDevelopmentLogin` 연결, 라벨 수정까지 네 가지가 모두 필요한데 정작 원하는 사람이 없다 |
| B. 개발 전용 GitHub App 분리 | 운영 client secret을 팀 전원이 나눠 갖지 않아도 된다 | 지금 App이 callback URL을 여러 개 등록할 수 있어 필요가 없다. 자격 증명 배포가 문제가 되면 그때 다시 꺼낸다 |
| C. 현상 유지 | 바꿀 것이 없다 | 켜는 순간 로그인이 깨지는 코드가 아무도 켤 수 없는 상태로 남는다 |

## 제약과 전제

- 로컬 개발자에게 GitHub OAuth client id와 secret이 필요하다. secret은 `backend/.env`에만 두고
  저장소에 커밋하지 않는다.
- GitHub App에 로컬 callback URL이 등록되어 있어야 한다. 목록에서 빠지는 순간 로컬 로그인이
  깨지므로 운영 주소와 같은 자리에서 관리한다.
- 개발자마다 다른 포트를 쓰면 그만큼 callback URL을 더 등록해야 한다. 상한 10개에 닿으면 이
  결정을 다시 보고 대안 B로 물러난다.

## 결과

- 개발과 운영의 인증 경로가 하나로 합쳐진다. 로컬에서 로그인이 되면 그 경로가 실제로 동작한다는
  근거가 생긴다.
- 로컬 로그인에도 GitHub 왕복이 필요하다. 오프라인이거나 GitHub에 장애가 나면 로컬 로그인을 할 수
  없다. 그건 감수한다.
- 삭제 범위는 다음과 같다.

```text
backend/src/main/java/com/project/jarihana/common/auth/LocalDevelopmentAuthenticationFilter.java
backend/src/test/java/com/project/jarihana/common/auth/LocalDevelopmentAuthenticationFilterTest.java
backend/src/main/java/com/project/jarihana/common/auth/SecurityConfig.java   필터 설치 분기와 설정 주입
backend/src/main/resources/application-local.yaml                            local-development 블록
frontend/src/shared/api/developmentAuth.js
frontend/src/shared/api/client.js                                            개발 헤더 주입
frontend/src/features/auth/context.jsx                                       developmentLoginAvailable
frontend/src/app/AppHeader.jsx                                               라벨 분기
```

## 후속 작업

- `MemberQueryService.findMyProfile`의 분기 순서를 다시 본다. 우회로가 사라져 "memberId가 있으면
  그 회원도 존재한다"는 전제가 다시 성립하지만, 회원 조회에 실패했을 때 401을 던지기보다 가입
  세션으로 물러나는 편이 안전하다. 이 ADR의 범위 밖이라 따로 다룬다.
- ~~`.env.example`과 `frontend/README.md`, `backend/docs/guide/intellij-local-run.md`의 redirect URI가
  아직 `localhost:8080/api/...`를 가리킨다. 현재 동작하는 값으로 맞춘다.~~ 완료. 셋 다
  `http://localhost:5173/api/oauth/github/callback`로 통일했다.
- ~~GitHub App에 등록된 callback URL 목록을 문서에 남겨 다음 사람이 추측하지 않게 한다.~~ 완료.
  [IntelliJ 로컬 실행 가이드](../guide/intellij-local-run.md)에 표로 남겼다.
