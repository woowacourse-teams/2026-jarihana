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

현재 로컬 DB에는 공유 미리보기 확인용 모임이 `id=13`으로 준비되어 있다.
브라우저에서 `http://localhost:5173/groups/13?promotion_id=yutnori_chat_01`을 열면 개발 서버가 운영의
CloudFront rewrite를 흉내 내 그룹 메타 페이지를 거친 뒤 React 화면을 표시한다.
주소에 붙인 `promotion_id`는 유효한 형식일 때만 `?preview=1` 이동과 세션 추적에 보존된다.
크롤러가 받는 원본 HTML을 직접 보려면 주소창에
`view-source:http://localhost:5173/groups/13`을 입력한다. 원본에서
`og:title`, `og:description`, `og:image`가 모임 값인지 확인한다.

백엔드 응답만 확인하려면 다음 요청을 사용한다.

```bash
curl -i http://localhost:8080/api/share/groups/13
```

`200 OK`, `Content-Type: text/html`, 그리고 모임 이름이 들어간
`og:title`을 확인할 수 있다. `DB_URL` 같은 값은 `bootRun` 프로세스가 실행되는
셸에 있어야 하므로, 위의 `source .env` 단계를 생략하면 애플리케이션이 시작되지 않는다.

로컬 DB에 해당 그룹이 없으면 먼저 로컬에서 만든 그룹 ID를 사용한다. localhost는 외부
서비스가 접근할 수 없으므로 실제 카카오톡·Slack 카드까지 확인할 때는 배포 환경이나
Cloudflare Tunnel/ngrok 같은 공개 터널 URL이 필요하다.

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
재시작할 때 `FRONTEND_ORIGIN`을 해당 주소로 덮어써야 canonical, 브라우저 redirect,
기본 썸네일 주소가 모두 외부에서 접근 가능해진다.

```bash
set -a
source .env
set +a
export FRONTEND_ORIGIN=https://<무작위>.trycloudflare.com
./gradlew bootRun --args='--spring.profiles.active=local'
```

이제 `https://<무작위>.trycloudflare.com/groups/13`을 브라우저나 공유 서비스에서
열어 확인한다. 외부에서 받은 HTML만 확인하려면 다음처럼 요청한다.

```bash
curl -sS https://<무작위>.trycloudflare.com/groups/13 \
  | rg 'og:title|og:description|og:image'
```

Quick Tunnel 주소는 임시·무작위 주소라 터널 프로세스를 종료하면 사라진다. 업로드한
S3 이미지까지 외부 카드에서 보려면 이미지도 공개 URL이어야 하며,
`IMAGE_S3_PUBLIC_BASE_URL`을 설정해야 한다.

## 운영 기능

- [PostHog 분석 수집 설정과 이벤트 목록](docs/analytics.md)
