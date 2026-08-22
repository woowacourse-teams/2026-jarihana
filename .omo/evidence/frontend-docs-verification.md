# Frontend documentation verification

Date: 2026-08-21

## Scope

Owned documentation only:

- `frontend/README.md`
- `frontend/DESIGN.md`
- `frontend/docs/IMPLEMENTATION_MAP.md`

## Source checks

- Compared runtime/dependency facts with `frontend/package.json`, `.nvmrc`, `.node-version`,
  `.env.example`, and `webpack.config.mjs`.
- Compared routes and guards with `frontend/src/app/routes.js`, `AppShell.jsx`, and the auth/leader
  guard files.
- Compared cookie, CSRF, refresh, cursor, and OAuth behavior with `frontend/src/shared/api/`,
  `frontend/src/features/auth/`, `frontend/src/entities/cursor/`, and backend security/controller code.
- Compared backend startup and production prerequisites with `backend/README.md` and
  `backend/src/main/resources/application*.yaml`.

## Observable validation

| Criterion                                    | Invocation                                                                                        | Result                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Owned Markdown is formatted                  | `cd frontend && npx --no-install prettier --check README.md DESIGN.md docs/IMPLEMENTATION_MAP.md` | Exit 0; all three files matched Prettier style |
| Documentation patch has no whitespace errors | `git diff --check -- frontend/README.md frontend/DESIGN.md frontend/docs/IMPLEMENTATION_MAP.md`   | Exit 0; no output                              |

The runbook intentionally records the JavaScript/JSX + Webpack/Babel override, Node 24, public
OAuth configuration, proxy/CORS deployment constraint, cookie/CSRF/refresh behavior, routes,
Figma mapping, unsupported backend actions, and the absence of stored OAuth credentials.

## Visual hardening documentation sync

- Re-read `frontend/src/shared/styles/tokens.css`, `frontend/src/app/AppShell.css`, and
  `frontend/src/app/AppShell.jsx` after visual hardening.
- Documented `text-brand`, semantic text colors, thin/strong borders, 44px/48px touch targets,
  72px header geometry, and 48rem/64rem breakpoint metadata.
- Documented the deliberate final2 header reconciliation: one common AppShell, full-bleed mobile
  header, inset/rounded desktop header, and local context navigation for account/public/manage
  pages instead of route-specific headers.
- Re-read public group, account, group editor, and leader-management source to document their
  desktop rails/panels/tables and responsive stacking rules without changing implementation files.

### Observable validation

| Criterion                                       | Invocation                                                                                                                                  | Result                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Hardened documentation is formatted             | `cd frontend && npx --no-install prettier --check README.md DESIGN.md docs/IMPLEMENTATION_MAP.md`                                           | Exit 0; all owned docs matched Prettier style |
| Hardened documentation has no whitespace errors | `git diff --check -- frontend/README.md frontend/DESIGN.md frontend/docs/IMPLEMENTATION_MAP.md .omo/evidence/frontend-docs-verification.md` | Exit 0; no output                             |
