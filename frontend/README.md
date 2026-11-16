# 자리하나 프론트엔드

## 기술 스택

- Node.js `24.x`, npm `10+`
- JavaScript / JSX
- React `19.2.8`, React Router `8.3.0`, TanStack Query `5.101.4`
- React Hook Form, Zod, `ky` HTTP client
- Webpack 5, Babel 8, Tailwind/PostCSS 4
- Jest, React Testing Library, Playwright, axe-core Playwright
- ESLint, Prettier

의존성 버전은 [package.json](package.json)과 `package-lock.json`에 고정되어 있습니다.

TypeScript, Vite, Vitest는 사용하지 않습니다.

## 공유 미리보기 로컬 확인

공유 미리보기는 크롤러가 읽는 서버 HTML을 확인해야 하므로, 백엔드와 프론트엔드 개발
서버를 함께 실행한다.

```bash
# 터미널 1: 저장소 루트에서 시작
cd backend
docker compose -f docker-compose-local.yaml up -d
# .env가 없다면 템플릿을 복사하고 GitHub OAuth 값을 채운다.
cp -n .env.example .env
# 이미 다른 로컬 클론에 설정된 .env가 있다면 그 파일을 이 디렉터리에 복사해도 된다.
# (예: cp <기존-클론>/backend/.env .env)
set -a
source .env
set +a
./gradlew bootRun --args='--spring.profiles.active=local'

# 터미널 2: 저장소 루트에서 시작
cd frontend
npm ci
npm run dev
```

로컬 개발 서버는 `/groups/{groupId}`와 `/sparring/{topicId}`에서 React 상세 화면을 연다.
모임 링크의 유효한 `promotion_id`는 React가 읽어 세션 추적에 사용한다.

공유 봇이 받는 HTML은 로컬 백엔드의 공유 API에서 확인한다. ID는 로컬 DB에 있는 값을 사용한다.

```bash
curl -i http://localhost:8080/api/share/groups/13
curl -i http://localhost:8080/api/share/sparrings/12
```

`200 OK`, `Content-Type: text/html`, `og:title`, `og:description`, `og:image`를 확인한다.
실제 카카오톡·Slack 카드는 User-Agent 분기가 설정된 배포 환경의 상세 링크로 확인한다.

### Cloudflare Quick Tunnel로 외부에서 확인

최초 한 번만 Cloudflare Tunnel CLI를 설치한다(macOS + Homebrew).

```bash
brew install cloudflared
cloudflared --version
```

프론트엔드 개발 서버가 실행 중인 상태에서 별도 터미널을 열고 터널을 시작한다.

```bash
cloudflared tunnel --url http://localhost:5173
```

터미널에 출력된 `https://<무작위>.trycloudflare.com` 주소를 복사한다. 백엔드를
재시작할 때 `FRONTEND_ORIGIN`을 해당 주소로 설정하면 canonical과 기본 썸네일이
외부에서 접근할 수 있는 주소를 사용한다.

```bash
set -a
source .env
set +a
export FRONTEND_ORIGIN=https://<무작위>.trycloudflare.com
./gradlew bootRun --args='--spring.profiles.active=local'
```

브라우저 화면은 `https://<무작위>.trycloudflare.com/groups/13`에서 확인한다.
공유 미리보기 HTML은 터널을 통해 공유 API에 직접 요청한다.

```bash
curl -sS https://<무작위>.trycloudflare.com/api/share/groups/13 \
  | rg 'og:title|og:description|og:image'
```

Quick Tunnel 주소는 임시·무작위 주소라 터널 프로세스를 종료하면 사라진다. 업로드한
S3 이미지까지 외부 카드에서 보려면 이미지도 공개 URL이어야 하며,
`IMAGE_S3_PUBLIC_BASE_URL`을 설정해야 한다.

## 운영 기능

- [PostHog 분석 수집 설정과 이벤트 목록](docs/analytics.md)

## PWA와 웹푸시

- [프론트엔드 ADR 0002](docs/adr/0002-notification-inbox-and-service-worker.md): 알림함·Service Worker·로그아웃 연결 구조와 선택 이유
- [웹푸시 운영 가이드](../backend/docs/operations/web-push.md): 로컬 실행·환경 설정·배포·장애 확인·검증 상태
