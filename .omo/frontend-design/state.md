# Frontend design state

## Objective

실제 자리하나 backend 계약을 빠짐없이 연결한 React JavaScript/JSX 앱을 만들고, Figma `최종 디자인 2`
시각 언어를 공통 AppShell과 token-driven component system으로 재현한다.

## Personas and contexts

- 익명 탐색자: 그룹을 검색·필터하고 상세와 모집을 살핀다.
- 가입 진행 사용자: GitHub OAuth 후 crewName, 기수, 과정을 완료한다.
- 회원: 내 모임/신청을 확인하고 모집에 신청하거나 철회한다.
- 그룹 리더: 그룹, 일정, 모집, 신청자, 리더 위임을 관리한다.
- 키보드/스크린리더 사용자: 모든 route와 dialog를 포인터 없이 사용한다.
- 저시력/low contrast 사용자: AA 대비와 확대에서도 정보를 잃지 않는다.
- reduced-motion 사용자: 동작 정보는 유지하면서 불필요한 애니메이션을 제거한다.
- 모바일 상황 사용자: 360px에서 한 손으로 검색·신청·관리 핵심 행동을 수행한다.

## Inputs

- Figma page `438:2657`, 주요 frames `438:2659`, `438:2779`, `438:2904`, `438:3012`, `438:3116`.
- Backend Controller/DTO/Security/domain/test snapshot at 2026-08-21.
- Route/API/state contract: `frontend/docs/IMPLEMENTATION_MAP.md`.
- Reference screenshots: `.omo/evidence/figma/*.png`.

## Binding decisions

- JavaScript/JSX only; no TypeScript and no Vite.
- React 19, Webpack/Babel, npm lockfile, Node 24.
- Zod validates every external API boundary at runtime.
- Cookie auth only; no token storage or JWT decoding.
- No production mock/fake data and no unsupported API action.
- Raw colors and repeated geometry live in CSS custom property tokens.

## Verification matrix

| Surface | Viewports/states | Evidence target |
| --- | --- | --- |
| Primitive showcase | 360, 768, 1440; focus/error/pending/long Korean | screenshot + axe |
| Group explore | 360, 768, 1440; loading/empty/success/error/cursor | screenshot + Playwright |
| Group/recruitment detail | 360, 768, 1440; loading/success/closed/errors | screenshot + Playwright |
| OAuth/signup | 360, 1440; callback/signup/validation | contract tests + browser fixture |
| My pages | 360, 768, 1440; populated/empty | screenshot + Playwright |
| Group/manage pages | 360, 768, 1440; leader/forbidden/mutations | screenshot + Playwright |
| Whole bundle | Node 24 lint/check/test/build | command logs |

## Debt register

- OAuth provider end-to-end requires a real GitHub client id and test account. Without them, only backend contract and
  test-fixture browser paths can be verified; this must remain explicit in the final report.
- Final2 has no native mobile frames; responsive decisions must be reviewed against content hierarchy rather than
  claimed as pixel-identical Figma output.

## Evidence ledger

Evidence is recorded only after the final code edit. Earlier screenshots and test runs are exploratory and do not close
the gate.
