# Groups latest user feedback verification

Date: 2026-08-21 KST

## Live backend boundary

Backend: Spring Boot `local` profile on `127.0.0.1:8080`, current source.

| Request                                                            | Observable result                         |
| ------------------------------------------------------------------ | ----------------------------------------- |
| `GET /api/members/me` without development header                   | `401`                                     |
| `GET /api/members/me` with `X-Jarihana-Development-Auth: enabled`  | `200`, completed member ID `1`            |
| `GET /api/groups?relation=joined&role=LEADER&size=20` with header  | `200`, group ID `1`, leader member ID `1` |
| `POST /api/groups` with development header but without CSRF token  | `403 ACCESS_DENIED`; no mutation          |
| `GET /images/default-group.png` through backend and frontend proxy | `200 image/png`                           |

The local development filter therefore changes authentication only. It does not make anonymous requests
authenticated, bypass CSRF, or replace service/domain authorization.

## Live browser

Browser: current Webpack development app at `http://localhost:5173`, backed by the live local API.

- Development opt-in changed the shell from `개발 계정으로 시작` to authenticated `마이페이지` and
  `로그아웃` actions.
- `/groups/new` rendered the real `신규 모임 생성` form.
- `/my/groups?role=LEADER` rendered the server-backed leader group `로컬 테스트 그룹 01`.
- `/groups/1/manage` rendered the real leader-only edit form and schedule controls.
- No browser console errors were recorded during these transitions.
- Desktop `1159×806`: header rect is `0..1159`; hero line tops are `165`, `212`, `259`; first card
  image is `/images/default-group.png`, complete, natural width `335`; no illustrated fallback class exists.
- Mobile `360×806`: header width `360`, document overflow `0`; hero line tops are `144`, `179`, `215`;
  the same server image loads with natural width `335`; no console errors.

Artifacts:

- `.omo/evidence/visual-qa/groups-latest-desktop-1159.jpg` — `1159×806`, SHA-256
  `a9d1554172c9010f5c37c5609b4ec2f615a76f3481db3392eaa101653168e0e7`
- `.omo/evidence/visual-qa/groups-latest-mobile-360.jpg` — `360×806`, SHA-256
  `b2bf879a1cecc3206fedf6b01ee9439cec550c8ad5f471f34c1b7f17d762ac46`

## Repository verification

- Frontend ESLint: exit `0`.
- Frontend warning-zero typecheck boundary: exit `0`.
- Frontend Jest: `41` suites, `259` tests passed.
- Frontend production Webpack build: exit `0`; only existing asset-size advisories for the profile image
  and `420 KiB` main bundle.
- Changed frontend files and documentation: Prettier check passed.
- React Doctor: exit `0`, `errorCount: 0`; `37` nonblocking repository-wide warnings remain.
- Backend Gradle full test task: exit `0`.
- `git diff --check`: exit `0`.

## Independent review

- Visual fidelity reviewer: `PASS`; confirmed real server image, exact three-line hero, full-width header,
  and zero mobile document overflow on current source.
