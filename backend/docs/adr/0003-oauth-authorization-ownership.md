# ADR 0003. GitHub OAuth 인가 시작의 소유 위치

- 상태: 채택
- 날짜: 2026-08-20
- 관련 문서: [ADR 0001](0001-github-oauth-authentication.md), [ADR 0002](0002-access-token-cookie.md),
  [보안과 개인정보](../conventions/security.md), [API 엔드포인트 설계](../context/api/endpoints.md)

## 배경

ADR 0001 결정 2는 이렇게 정했다.

> `state`는 인가 시작 시 세션에 저장하고, 콜백에서 읽는 즉시 제거해 1회만 사용한다.

"인가 시작"이 존재한다는 것을 전제했을 뿐 그것을 어디가 소유하는지는 정하지 않았고, 그 결과
어느 쪽도 구현하지 않았다. 현재 저장소에서 `state`를 세션에 쓰는 코드는 한 곳도 없다.
콜백은 읽고 지우기만 한다.

```text
GithubOAuthCommandController   session.getAttribute(OAUTH_STATE)      읽기
GithubOAuthCommandController   session.removeAttribute(OAUTH_STATE)   삭제
쓰는 곳                         없음
```

그래서 실제 브라우저 흐름에서는 `consumeIssuedState()`가 항상 `null`을 돌려주고, 콜백이 무조건
`OAUTH_STATE_INVALID` 400으로 끝난다. **지금 이 서비스는 GitHub 로그인이 한 번도 성공할 수 없다.**

기존 인수 테스트가 이 공백을 드러내지 못했다. 테스트가 세션에 `state`를 직접 심은 뒤 콜백을
호출하기 때문에 콜백 자체는 정상으로 보인다. 생산자가 없다는 사실은 테스트 범위 밖이었다.

인가 시작의 소유 위치를 정해야 이 공백을 메울 수 있고, 그 선택이 콜백의 `state` 검증 방식을
그대로 좌우한다.

## 결정

1. 인가 시작은 백엔드가 소유한다. `GET /api/oauth/github/authorization`을 두고, 프론트엔드는
   이 경로로 이동시키기만 한다. 프론트엔드가 GitHub authorize URL을 직접 구성하지 않는다.
2. `state`는 서버가 32바이트 `SecureRandom` 값을 Base64URL로 인코딩해 만들고 브라우저 세션에
   보관한다. 콜백이 읽는 즉시 제거해 1회만 사용한다. ADR 0001 결정 2를 그대로 유지한다.
3. 콜백은 `state`를 생성하지 않는다. GitHub에게서 되돌려받아 세션 값과 대조하기만 한다.
4. GitHub에 `scope`를 요청하지 않는다.
5. `client_id`, `redirect_uri`, `authorization_uri`는 서버 설정으로만 관리한다. 하나라도
   비어 있으면 `OAUTH_CONFIGURATION_ERROR`(500)로 응답한다.

## 콜백이 `state`를 만들 수 없는 이유

OAuth 흐름에서 `state`가 만들어지는 지점과 검증되는 지점은 다르다.

```text
1. 브라우저를 GitHub authorize URL로 보낸다        state를 만들어 보관하는 지점
   https://github.com/login/oauth/authorize?client_id=...&state=XYZ

2. 사용자가 GitHub에서 승인한다

3. GitHub이 콜백으로 되돌려보낸다                  state를 받는 지점
   /api/oauth/github/callback?code=...&state=XYZ

4. 콜백이 3의 값과 1에서 보관한 값을 대조한다
```

콜백은 3번이다. GitHub이 1번에서 받은 값을 그대로 echo 하는 것이므로, 콜백은 자기가 만든 적 없는
값을 검증하는 위치에 있어야 의미가 있다.

콜백이 `state`를 만들면 자기가 방금 만든 값을 자기가 검증하게 되어 위조 방지 효과가 사라진다.
공격자가 자신의 GitHub 계정으로 얻은 인가 코드를 피해자의 브라우저에 심는 로그인 CSRF에서,
공격자가 보낸 콜백 요청도 그대로 통과한다. 피해자는 자신이 로그인했다고 믿는 상태로 공격자
계정에 묶인다.

## `POST /api/members`가 대체하지 못하는 이유

두 엔드포인트는 흐름에서 서로 반대편에 있고 책임도 다르다.

| | `GET /api/oauth/github/authorization` | `POST /api/members` |
| --- | --- | --- |
| 시점 | 콜백 이전 | 콜백 이후 |
| 입력 | 없음 | 가입 세션의 `githubId`, 크루명, 기수, 코스 |
| 하는 일 | `state`를 만들어 보관하고 GitHub으로 보냄 | `Member`를 만들어 저장 |
| 없으면 | 로그인 자체가 시작되지 않음 | 로그인은 되지만 가입을 완료할 수 없음 |

"GitHub 인증이 끝나면 우리 회원인지 판단한다"는 로직은 이미 콜백에 있다.
`memberRepository.findByGithubId(githubId)`로 조회해 회원이면 로그인, 아니면 `signupRequired=true`다.
`state`는 그 신원 판단과 다른 층위의 문제다. "이 사람이 우리 회원인가"가 아니라 "이 콜백 요청이
우리 서버가 시작한 로그인에서 왔는가"를 확인한다.

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| 프론트엔드가 authorize URL을 직접 구성 | 백엔드 엔드포인트가 하나 줄어든다 | `state`를 프론트엔드가 만들게 되어 백엔드에 대조할 값이 없다. 검증 주체가 브라우저로 넘어가 ADR 0001이 세션 결합을 선택한 근거를 뒤집는다 |
| 콜백에서 `state`를 만들어 검증 | 엔드포인트 추가가 없다 | 생성과 검증이 같은 지점이라 위조 방지 효과가 0이다 |
| `state` 검증 자체를 제거 | 구현이 가장 단순하다 | 로그인 CSRF에 그대로 노출된다. ADR 0001이 "브라우저 세션과 묶이지 않아 CSRF 방지 강도가 떨어진다"는 이유로 기각한 방향이다 |
| 담당자가 구현할 때까지 대기 | 역할 경계를 지킨다 | 로그인이 동작하지 않아 후속 엔드포인트를 브라우저로 확인할 수 없고, 첫 데모 경로가 통째로 막힌다 |
| `read:user` 등 `scope` 요청 | 이후 확장에 여지를 둔다 | 현재 필요한 값은 GitHub 사용자의 숫자 `id` 하나이고 `scope` 없는 토큰으로도 `GET /user`가 공개 프로필을 돌려준다. 최소 권한을 벗어난다 |

## 결과

- GitHub 로그인이 실제 브라우저에서 처음으로 끝까지 동작한다.
- 프론트엔드는 GitHub의 `client_id`나 authorize URL 형식을 알 필요가 없다. 로그인 버튼은
  `/api/oauth/github/authorization`으로 이동시키기만 한다.
- GitHub 연동 설정이 서버 한 곳에 모인다. 설정 변경에 프론트엔드 배포가 필요 없다.
- `state`는 세션에 묶이고 1회만 쓰이므로, 값이 유출되어도 다른 브라우저에서 재사용할 수 없다.
- 인가 시작에도 세션이 필요하다. 세션이 만료된 뒤 도착한 콜백은 `OAUTH_STATE_INVALID`로 거부되고,
  사용자는 로그인을 다시 시작해야 한다.
- 인수 테스트가 세션을 직접 심지 않고 인가 시작이 발급한 값으로 콜백을 통과시킬 수 있게 되어,
  로그인 흐름이 닫히는지를 테스트가 증명한다.

## 후속 작업

- 이 엔드포인트는 원래 다른 담당자의 범위였다. 중복 구현이 되지 않도록 담당자와 확인한다.
- 세션 만료로 인한 `OAUTH_STATE_INVALID`를 프론트엔드가 어떤 화면으로 안내할지 정한다.
- 운영 환경의 `redirect_uri`와 GitHub OAuth App 설정을 배포 구성과 함께 확정한다.
