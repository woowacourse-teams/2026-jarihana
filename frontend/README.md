# 자리하나 프론트엔드

자리하나의 React 웹 클라이언트입니다. 데이터·권한·상태 전이는 `backend/`의 실행 코드가,
색·서체·정보 계층은 Figma 파일 `4FGyuqPPK0Vuv4FipZBTgF`의 **최종 디자인 2**
페이지(`438:2657`)가 기준입니다. 화면/계약 매핑과 Figma/API 불일치는
[docs/IMPLEMENTATION_MAP.md](docs/IMPLEMENTATION_MAP.md)에, 토큰과 반응형 결정은
[DESIGN.md](DESIGN.md)에 기록합니다.

> 사용자 요청에 따라 이 앱은 **TypeScript, Vite, Vitest를 사용하지 않습니다.** 순수
> JavaScript/JSX, React, Webpack, Babel, Jest 조합입니다. 원 통합 요구의 TypeScript/Vite
> 항목은 이 명시적 기술 선택으로 대체되었습니다.

## 기술 구성

- Node.js `24.x` (`.nvmrc`는 `24`, `.node-version`은 `24.19.0`), npm `10+`
- React `19.2.8`, React Router `8.3.0`, TanStack Query `5.101.4`
- React Hook Form + Zod, `ky` HTTP client
- Webpack 5 + Babel 8 + Tailwind/PostCSS 4, CSS Custom Property 토큰
- Jest + React Testing Library, Playwright, axe-core Playwright, ESLint, Prettier

의존성 버전은 [package.json](package.json)과 `package-lock.json`에 고정되어 있습니다.

## 빠른 실행

### 1. Node와 의존성

```bash
cd frontend
nvm use
npm ci
```

`node --version`이 `v24.*`인지 확인하세요. npm은 lockfile을 변경하지 않는 `npm ci`로
설치합니다.

### 2. 로컬 백엔드

별도 터미널에서 백엔드의 로컬 PostgreSQL과 Spring Boot를 시작합니다.

```bash
cd backend
docker compose -f compose-local.yaml up -d
export ACCESS_TOKEN_SECRET="$(openssl rand -hex 32)"
./gradlew bootRun --args='--spring.profiles.active=local'
```

로컬 프로필은 `http://localhost:8080`을 사용하고 인증 쿠키의 `Secure` 속성을 끕니다.
데이터베이스와 백엔드 환경 변수의 상세는 [backend README](../backend/README.md)를
참조하세요. `local` 백엔드와 `npm run dev` 프론트 조합에서는 header의 `개발 계정으로 시작`을
누르면 GitHub OAuth 없이 로컬 회원 ID 1로 실제 API와 권한을 점검할 수 있습니다. 브라우저가
명시적으로 선택한 동안만 중앙 API client가 로컬 인증 header를 보내며, logout하면 즉시 해제됩니다.
production build와 non-local backend에는 이 인증 경로가 활성화되지 않습니다. 실제 GitHub
로그인까지 하려면 아래 OAuth 설정도 필요합니다.

### 3. 공개 OAuth 설정

```bash
cd frontend
cp .env.example .env
```

`.env`에는 **공개 가능한** GitHub OAuth 앱 식별자만 넣습니다. client secret, JWT secret,
DB 비밀번호는 이 파일이나 프론트엔드 번들에 절대 넣지 않습니다.

| 변수                      | 로컬 기본값/예시                                  | 용도                                                                                              |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `APP_GITHUB_CLIENT_ID`    | GitHub OAuth 앱의 client ID                       | GitHub authorize URL의 `client_id`                                                                |
| `APP_GITHUB_REDIRECT_URI` | `http://localhost:8080/api/oauth/github/callback` | GitHub가 돌아올 백엔드 callback. 백엔드 `GITHUB_OAUTH_REDIRECT_URI` 및 GitHub 앱 설정과 같아야 함 |
| `APP_OAUTH_COOKIE_NAME`   | `oauthState`                                      | OAuth state를 잠시 저장하는 브라우저 쿠키 이름                                                    |
| `APP_OAUTH_COOKIE_DOMAIN` | 비움                                              | 운영에서 합의된 공유 상위 도메인이 있을 때만 설정                                                 |
| `DISABLE_REACT_DEVTOOLS`  | `0`                                               | 개발용 React 진단 overlay를 끄려면 `1`                                                            |

백엔드는 별도로 `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`,
`GITHUB_OAUTH_REDIRECT_URI`, `ACCESS_TOKEN_SECRET`가 필요합니다. GitHub OAuth 앱의
callback URL도 `APP_GITHUB_REDIRECT_URI`와 동일해야 합니다. 이 저장소에는 실제 OAuth
자격 증명이나 테스트 계정이 포함되어 있지 않습니다.

### 4. 프론트엔드 서버

```bash
cd frontend
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. Webpack 개발 서버는 `/api`와 `/images`를
`http://localhost:8080`으로 proxy하므로, 화면의 API 코드는 언제나 상대 경로 `/api/...`만
사용합니다. React Router deep link도 개발 서버의 history fallback으로 새로고침됩니다. 보호
화면을 점검하려면 `개발 계정으로 시작`을 누른 다음 `모임 만들기`, `모임 관리`로 이동합니다.

## 스크립트

| 명령                    | 결과                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | 개발 Webpack 서버, 포트 5173                               |
| `npm run build`         | `dist/`에 production bundle 생성                           |
| `npm run preview`       | production mode Webpack 서버, 포트 4173                    |
| `npm run lint`          | JavaScript/JSX ESLint 검사                                 |
| `npm run typecheck`     | TypeScript 검사가 아닌, 경고 0개를 강제한 ESLint 경계 검사 |
| `npm test`              | Jest 단위·컴포넌트 테스트                                  |
| `npm run test:coverage` | coverage를 포함한 Jest 실행                                |
| `npm run test:e2e`      | Playwright 브라우저 시나리오                               |
| `npm run react-doctor`  | React dependency/runtime 진단 JSON                         |

표준 검증 순서는 다음과 같습니다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

E2E는 production API에 mock 성공 데이터를 넣지 않습니다. 테스트가 필요한 경우에만
네트워크를 가로채며, 실 OAuth는 실제 등록된 GitHub 앱과 계정이 있어야 검증할 수 있습니다.

## 라우트와 권한

`AppShell`은 모든 route의 header, skip link, main landmark, mobile drawer를 제공합니다.
권한 guard는 서버 권한을 대체하지 않으며, 서버의 401/403이 최종 판단입니다.

| Route                                                               | 접근                  | 화면/주요 흐름                                            |
| ------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| `/`, `/groups`                                                      | 공개                  | 그룹 탐색, 검색·유형 필터, cursor 더 보기                 |
| `/groups/:groupId`                                                  | 공개                  | 그룹 상세, 모집 이력, 멤버 목록                           |
| `/groups/:groupId/recruitments/:recruitmentId`                      | 공개 조회 / 회원 신청 | 모집 상세, 신청 생성·철회                                 |
| `/oauth/callback`                                                   | 공개                  | OAuth redirect 뒤 실제 세션 재확인                        |
| `/signup`                                                           | 가입 세션             | crew name, generation, course로 가입 완료                 |
| `/my`                                                               | 완료 회원             | 프로필과 내 모임·신청 요약                                |
| `/my/groups`                                                        | 완료 회원             | 참여/운영 모임 목록                                       |
| `/my/registrations`                                                 | 완료 회원             | 내 신청 상태와 철회                                       |
| `/groups/new`                                                       | 완료 회원             | 그룹 생성과 유형별 일정 입력                              |
| `/groups/:groupId/manage`                                           | 해당 그룹 리더        | 그룹 수정, 일정, 종료 또는 삭제                           |
| `/groups/:groupId/manage/members`                                   | 해당 그룹 리더        | 멤버 목록과 리더 위임                                     |
| `/groups/:groupId/manage/recruitments`                              | 해당 그룹 리더        | 모집 생성·마감                                            |
| `/groups/:groupId/manage/recruitments/:recruitmentId/registrations` | 해당 그룹 리더        | 신청 승인·거절                                            |
| `/__showcase`                                                       | 개발 점검             | 공통 UI primitive 상태 점검용, navigation에 노출하지 않음 |
| 그 외                                                               | 공개                  | 안전한 404 화면                                           |

## API·세션 동작

API client는 `src/shared/api/`에 있고, 페이지는 직접 `fetch`하지 않습니다. 호출 흐름은
**공통 client → 도메인 API 함수 → TanStack Query hook → 화면**입니다.

- 모든 API 요청은 `credentials: "include"`로 cookie를 보냅니다. `Authorization` header,
  localStorage/sessionStorage token 저장은 사용하지 않습니다.
- JSON 응답 envelope `{ success, data, error }`를 Zod schema로 해석하고, `204`에는 JSON
  parse를 시도하지 않습니다.
- `POST`, `PUT`, `PATCH`, `DELETE`는 읽을 수 있는 `XSRF-TOKEN` cookie를
  `X-XSRF-TOKEN` header에 실어 보냅니다.
- 오직 `401 + UNAUTHENTICATED`만 refresh합니다. 동시 요청은 하나의 refresh promise를
  공유하고, 원 요청은 최대 한 번만 재시도합니다. `403`은 refresh하지 않습니다.
- 앱 시작과 OAuth callback은 `/api/members/me`로 실제 상태를 읽습니다. 완료 회원은
  authenticated, 미완료 가입 세션은 signup flow, 유효하지 않은 세션은 anonymous로
  처리합니다.
- cursor 목록은 첫 호출에 cursor를 보내지 않고 다음 cursor만 사용합니다. 반복 cursor와
  중복 item은 병합 단계에서 차단합니다.

### GitHub OAuth 흐름

1. `GitHub로 로그인`은 `crypto.getRandomValues`로 32-byte state를 만들고, 짧은 수명의
   `SameSite=Lax` state cookie와 GitHub authorize URL에 같은 값을 넣습니다.
2. GitHub는 백엔드 `GET /api/oauth/github/callback`으로 돌아옵니다. 백엔드는 state를 검증하고
   state cookie를 즉시 만료한 뒤, `FRONTEND_ORIGIN/oauth/callback`으로 redirect합니다.
3. callback 화면은 query string이 아니라 `/api/members/me` 결과로 기존 회원/가입 필요를
   재확인합니다.
4. 신규 회원은 `POST /api/members`로 가입을 마치고, 기존 회원은 `/my`로 이동합니다.
5. 로그아웃은 `POST /api/auth/logout`을 호출해 서버 쿠키를 만료하고 클라이언트 session state를
   anonymous로 되돌립니다.

## 운영 배포 전제

현재 백엔드에는 CORS 설정이 없습니다. 개발에서는 Webpack proxy가 이 문제를 감추지만,
운영에서는 프론트엔드 코드만으로 해결할 수 없습니다.

- 권장 topology: 프론트와 `/api`, `/images`를 하나의 **same-origin reverse proxy** 아래에 둡니다.
- 다른 host를 쓴다면 cookie/CSRF/OAuth state가 성립하는 **same-site 공유 상위 도메인**과
  backend CORS 정책을 함께 설계해야 합니다.
- HTTPS 운영에서는 OAuth state cookie와 backend auth cookie가 secure여야 합니다.
- `FRONTEND_ORIGIN`, `GITHUB_OAUTH_REDIRECT_URI`, GitHub OAuth 앱 callback URL, public
  frontend origin을 배포 주소로 함께 맞춥니다.

이 전제가 충족되지 않으면 cookie 기반 세션, CSRF, OAuth callback은 검증된 배포 구성이 아닙니다.

## 실제 API 범위와 의도적으로 없는 기능

연동 범위는 그룹 생성·수정·일정·종료/삭제, 멤버 조회·리더 위임, 모집 조회·생성·마감,
가입 신청 생성·철회·결정, 내 프로필 조회·가입·refresh·logout입니다. 세부 endpoint와 상태는
[구현 매핑](docs/IMPLEMENTATION_MAP.md)을 따릅니다.

현재 backend contract에 없는 기능은 성공한 것처럼 보이게 만들지 않습니다.

- 이미지 업로드 endpoint가 없으므로 대표 이미지는 API의 읽기 전용 값 또는
  `/images/default-group.png` fallback만 표시합니다.
- 프로필/아바타 수정 endpoint가 없습니다.
- 멤버 강제 퇴장 endpoint가 없습니다.
- 그룹에 직접 가입하는 endpoint가 없습니다. 모집 registration 흐름만 사용합니다.

## 디렉터리

```text
frontend/
├── src/
│   ├── app/             # provider, router, guard, AppShell
│   ├── entities/        # API 응답 schema와 cursor 정책
│   ├── features/        # 도메인 API, query/mutation hook, validation
│   ├── pages/           # 공개·계정·그룹 편집·리더 관리 화면
│   └── shared/          # API client, config, Figma assets, tokens, UI primitive
├── docs/                # 구현 계약/Figma 매핑
├── public/              # HTML/manifest
└── tests/               # Jest setup 및 테스트 지원
```

## 디자인과 접근성

Figma desktop frame에는 모바일/태블릿 variant가 없어 360px, 768px, 1440px에서 정보 우선순위를
보존하도록 responsive 규칙을 도출했습니다. 검은 header, mint accent, 얇은 line card, Noto Sans KR
글꼴과 Figma export asset을 공통 토큰으로 사용합니다. 구현 세부 및 Figma evidence 위치는
[DESIGN.md](DESIGN.md)를 확인하세요.

`최종 디자인 2` 안에서도 header는 frame마다 top full-bleed와 inset black frame이 섞여 있습니다.
화면별 header를 복제하면 navigation·인증 위치가 달라지므로, common AppShell로 통일했습니다.
360–767px에서는 full-bleed header와 drawer, 768px 이상에서는 white canvas 안의 32px top inset,
rounded black header를 사용합니다. 새 token은 대비가 보강된 brand/muted text alias,
`--border-thin`/`--border-strong`, 44px/48px touch target, 72px header geometry, 48rem/64rem
breakpoint metadata를 포함합니다.

공개 탐색은 desktop 3-column → tablet 2-column → mobile 1-column으로, group detail과 신청 관리는
desktop side rail → mobile 본문 아래 순서로 바뀝니다. 계정 화면은 profile/content split을 접고,
리더 관리 화면은 group context tabs, 멤버 table/card, 모집 panel, 신청 operations rail을
viewport에 맞춰 단일 column으로 재배치합니다.

공통 UI에는 visible focus, skip link, semantic landmarks, labelled fields, `aria-live` toast,
keyboard tabs, dialog Escape/Tab focus trap·opener focus return, reduced motion이 포함됩니다.
핵심 route는 화면 변경 뒤 axe의 critical/serious violation 0건을 목표로 브라우저 QA합니다.

## 문제 해결

- **API 요청이 실패함**: backend가 8080에서 실행 중인지, frontend를 `npm run dev` 또는
  `npm run preview`로 실행했는지 확인합니다. HTML을 파일로 직접 열면 proxy가 없습니다.
- **GitHub 로그인 후 callback 실패**: 네 OAuth URL 값과 backend의 `FRONTEND_ORIGIN`,
  `GITHUB_OAUTH_REDIRECT_URI`, GitHub 앱 callback URL이 모두 같은 배포 topology인지 확인합니다.
- **로그인이 계속 anonymous임**: browser devtools에서 `accessToken`, `refreshToken`,
  `XSRF-TOKEN` cookie가 해당 origin에서 설정됐는지와 local backend profile인지 확인합니다.
- **새로고침 시 deep link가 404**: 개발/preview 서버가 아닌 정적 host라면 모든 non-file URL을
  `index.html`로 fallback하는 서버 설정이 필요합니다.

검증 결과와 실제 브라우저 QA artifact는 repository root의 `.omo/evidence/`에 남깁니다.
