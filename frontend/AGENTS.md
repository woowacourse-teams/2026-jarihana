# 프론트엔드 작업 지침

## 작업 시작

1. 현재 브랜치와 working tree 상태를 확인한다.
2. 이 파일의 작업 규칙을 확인한다.
3. 작업 유형에 따라 아래 문서를 읽는다.

| 작업 유형 | 읽을 문서 |
| --- | --- |
| 기술 스택·의존성·도구 | `README.md`, `package.json` |
| UI·UX·디자인·접근성·반응형 | `DESIGN.md` |
| 라우트·API·권한·화면 상태 | `docs/IMPLEMENTATION_MAP.md` |
| 기술·구조 의사결정 | `docs/adr/`의 관련 ADR |
| 백엔드 API 계약 | `../backend/AGENTS.md`와 관련 백엔드 문서 |
| 테스트·검증 명령 | `package.json`의 scripts와 이 문서 |

## 작업 규칙

- 프론트엔드 구현은 JavaScript/JSX 기준으로 작성한다.
- TypeScript, Vite, Vitest를 새로 도입하지 않는다.
- 서버 권한을 클라이언트 guard로 대체하지 않는다.
- API 호출은 공통 API client와 도메인 API 계층을 사용한다.
- 기존 구현·문서·working tree 변경사항을 임의로 되돌리지 않는다.
- 요청 범위를 벗어난 리팩터링과 의존성 변경을 추가하지 않는다.
- 프론트엔드 작업은 TDD(red-green-refactor)를 기본 방식으로 사용하지 않는다.
- agent QA나 별도 에이전트 기반 검증을 사용하지 않는다.

## 검증

- JavaScript/JSX 변경: `npm run lint`
- 동작 변경: 관련 Jest 테스트
- 빌드 영향 변경: `npm run build`
- UI 변경: 필요한 브라우저 확인과 접근성 확인
- 검증하지 못한 항목은 성공으로 보고하지 않는다.
