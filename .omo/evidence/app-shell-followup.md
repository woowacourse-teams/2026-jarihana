# App shell follow-up evidence

## TDD traces

- Header contrast RED: `tests/app/app-shell-css.test.js` observed `.app-header__auth` using
  `var(--color-brand-ink)` on the brand fill; the expected readable ink contract failed.
- Leader 404 RED: `tests/app/leader-guard.test.jsx` observed the generic
  `권한을 확인할 수 없어요` error instead of a not-found heading and group-list link.
- Signup continuation RED: the transition test observed the signup child replaced by loading and the
  initial browser run observed `/my` after two consumers raced for one return target.
- Desktop shell RED: the CSS contract observed a local `:root`, canvas background, full-bleed header,
  flex-positioned desktop navigation, and raw header geometry values.

## Final scenarios

| Scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| Owned app behavior | `npx jest tests/app --runInBand --no-watchman` | exit 0; 11 suites and 44 tests pass | this report |
| Owned diagnostics | `npx eslint src/app tests/app` | exit 0; no findings | this report |
| Production graph | `APP_GITHUB_CLIENT_ID=e2e-client APP_GITHUB_REDIRECT_URI=http://127.0.0.1:4173/oauth/callback DISABLE_REACT_DEVTOOLS=1 npm run build` | exit 0; Webpack emits `main.93173877.js`; only existing size warnings | this report |
| Real Chromium shell/auth/error flow | temporary watch-free static server plus Playwright grep for desktop/mobile groups, desktop signup, anonymous deep link, signup continuation, and 404 group failure | exit 0; 8/8 tests pass | `.omo/evidence/visual-qa/groups-desktop-1440.png`, `groups-mobile-360.png`, `signup-desktop-1440.png` |
| Actual return-target key and ordering | AuthGuard/SignupGuard Jest scenarios use real auth helpers | exact key `jarihana:auth:return-target`; persistence precedes Navigate; StrictMode consumes once | app Jest result above |
| Leader 404 safety | LeaderGuard Jest + Chromium 404 scenario | safe `모임을 찾을 수 없어요`, `/groups` recovery link, raw backend message absent | app Jest + Chromium result above |
| Header contrast | CSS contract plus desktop signup axe scenario | foreground `--color-ink` on `--color-brand` is at least 4.5:1; axe serious/critical violations absent | `signup-desktop-1440.png` |
| Independent shell fidelity gate | fresh read-only clone/visual review across all five Final2 references | `APPROVE`; no blockers | `.omo/evidence/app_shell_router-clone-fidelity.md` |

## Observations

- The product return-target key was already correct. The earlier E2E failures read and seeded
  `jarihana.auth.returnTo`; the corrected E2E uses `jarihana:auth:return-target`.
- Signup navigation now has one owner: `SignupGuard`. It retains its child during auth reload, consumes
  the target once behind `redirectStarted`, and renders Navigate only after the target is committed.
- The final desktop capture shows a white canvas and a centered 1360px rounded black header; the mobile
  capture retains a full-width black header and drawer trigger.
- The visible wordmark matches `자리 하나?`. Three base links stay geometrically centered in every auth
  state; authenticated-only `마이페이지` sits in the right action group and in the mobile drawer.
- Final2 references disagree on desktop header y-position (groups about 63px; four other frames about
  0–4px). The common shell intentionally uses one 32px inset compromise instead of route-specific headers.
- Webpack still reports the pre-existing 388 KiB profile illustration and 418 KiB main-entry size warnings.
- The configured Webpack dev/preview server remains vulnerable to the host `EMFILE` watcher ceiling, so
  browser verification used the exact production `dist` through a temporary watch-free SPA server. The
  temporary server, Playwright config, and result directory were removed after capture.
