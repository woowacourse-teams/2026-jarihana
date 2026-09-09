# ADR 0001. 프론트엔드 기술 스택

- 상태: 채택
- 기준: 현재 저장소 구현과 `package.json`

## 배경

자리하나 프론트엔드는 브라우저에서 동작하는 React 클라이언트다. 현재 구현과 의존성은
JavaScript/JSX, React, Webpack/Babel, Jest 조합으로 구성되어 있다.

## 결정

- 런타임은 Node.js `24.x`, 패키지 관리는 npm `10+`를 사용한다.
- 애플리케이션 언어는 JavaScript/JSX를 사용한다.
- UI는 React, React Router, TanStack Query를 사용한다.
- 폼과 입력 검증은 React Hook Form과 Zod를 사용한다.
- HTTP client는 `ky`를 사용한다.
- 번들링과 변환은 Webpack과 Babel을 사용한다.
- 스타일링은 Tailwind CSS, PostCSS와 CSS Custom Property 토큰을 사용한다.
- 단위·컴포넌트 테스트는 Jest와 React Testing Library를 사용한다.
- 브라우저·접근성 검증은 Playwright와 axe-core Playwright를 사용한다.
- 정적 검증은 ESLint와 Prettier를 사용한다.
- TypeScript, Vite, Vitest는 사용하지 않는다.

## 결과

- 기술 의존성 버전은 `package.json`과 `package-lock.json`을 기준으로 관리한다.
- 프론트엔드 구현은 JavaScript/JSX와 현재 Webpack/Babel 구성을 전제로 한다.
- 새로운 기술 스택을 도입하려면 이 결정과 영향 범위를 먼저 갱신한다.
