# App shell and router evidence

## Owned scenarios

| Scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| Route registry contains every required public/member/leader/showcase/fallback path | `npm test -- --runTestsByPath tests/app/route-registry.test.js` | Jest exit 0 | `app-shell-router-tests.log` |
| Anonymous deep link, signup-incomplete redirect, authenticated allow, safe signup return | `npm test -- --runTestsByPath tests/app/route-access.test.js tests/app/auth-guard.test.jsx` | Jest exit 0 and sessionStorage return path assertion | `app-shell-router-tests.log` |
| Current member matches server leader, non-leader forbidden, server 403 authoritative | `npm test -- --runTestsByPath tests/app/leader-guard.test.jsx` | Jest exit 0, protected child absent for both forbidden cases | `app-shell-router-tests.log` |
| Header landmarks, login/signup/member actions, responsive drawer | `npm test -- --runTestsByPath tests/app/app-shell.test.jsx` | Jest exit 0, 5 DOM scenarios pass | `app-shell-router-tests.log` |
| Query/Auth/Toast provider contract | `npm test -- --runTestsByPath tests/app/providers.test.js` | Jest exit 0, toast consumer renders inside provider | `app-shell-router-tests.log` |
| Route elements receive explicit member/signup/leader guards | `npm test -- --runTestsByPath tests/app/app-router.test.jsx` | Jest exit 0 | `app-shell-router-tests.log` |
| Page aliases and recoverable 404 | `npm test -- --runTestsByPath tests/app/pages-index.test.jsx` | Jest exit 0, fallback heading and recovery link render | `app-shell-router-tests.log` |
| Dev tooling is gated from production | `npm test -- --runTestsByPath tests/app/development-tools.test.js` | Jest exit 0 | `app-shell-router-tests.log` |
| Disabled development tooling does not invoke loaders and its statically analyzed module graph compiles | `DISABLE_REACT_DEVTOOLS=1 npx webpack --mode development` | Webpack exit 0; `react-grab` and `react-scan/lite` chunks emitted without overlay error | `app-shell-router-dev-compile.log` |
| Enabled development tooling uses the supported scan entry and starts its instrument function | `DISABLE_REACT_DEVTOOLS=0 npx webpack --mode development`; focused Jest module test | Webpack exit 0; mocked `instrument` called once | `app-shell-router-dev-compile.log`, `app-shell-router-tests.log` |
| Anonymous deep link is persisted before navigation can unmount the guard | focused AuthGuard Jest scenario inside the complete app invocation | sessionStorage equals `/my/registrations?status=PENDING`; event order exactly `store,navigate` | `app-shell-router-tests.log` |
| Auth outage remains recoverable and never impersonates anonymous | `npm test -- --runTestsByPath tests/app/auth-guard.test.jsx tests/app/signup-guard.test.jsx` | Jest exit 0; retry action called, protected/signup children absent | `app-shell-router-tests.log` |
| Anonymous global navigation exposes discovery/create/manage routes | `npm test -- --runTestsByPath tests/app/app-shell.test.jsx` | Jest exit 0; exact href assertions pass | `app-shell-router-tests.log` |
| Route pages are split behind lazy components without weakening guards | `npm test -- --runTestsByPath tests/app/app-router.test.jsx` | Jest exit 0; all 15 page exports have lazy components and guarded roots remain intact | `app-shell-router-tests.log` |
| Owned JavaScript/JSX/CSS integration is lint-clean | `npx eslint src/index.jsx src/app src/pages/index.js tests/app` | ESLint exit 0 with no findings | `app-shell-router-lint.log` |
| Production application compiles with actual page/auth/UI imports | `npm run build` | Webpack exit 0 and emitted `dist/index.html` plus hashed assets | `app-shell-router-build.log` |

## TDD trace

Observed RED failures before implementation included missing `routeAccess`, `routes`, `AppShell`,
`AuthGuard`, `LeaderGuard`, `AppProviders`, `developmentTools`, `AppRouter`, and `pages` modules;
missing global `ToastProvider`; missing signup continuation action; and server 403 incorrectly rendered as
a generic loading error. The integration pass additionally observed RED for `unavailable` falling through to
protected content, anonymous signup rendering, direct return-target storage, missing anonymous create/manage
navigation, and eager route elements. The latest RED passes additionally reproduced the disabled-development
Webpack error at `developmentTools.js:11:7-32` because `react-scan/auto` targets an absent distribution file,
and an AuthGuard ordering trace of `navigate,store`, where Navigate could unmount before persistence. The
minimal fixes use the package's supported `react-scan/lite` `instrument` API and a committed persistence phase
before rendering Navigate. Focused GREEN assertions now observe no disabled loader calls, one enabled
`instrument` call, a stored deep link after forced navigation unmount, and the exact order `store,navigate`.
All were followed by the complete owned suite.

## Residual integration observation

The production build succeeds with route chunks and reduces the eager main bundle from 542 KiB to 417 KiB.
Webpack still warns about the 388 KiB profile illustration and 417 KiB main entry. AppShell has no undefined
CSS token aliases or raw color literals; `--app-touch-target` and `--app-header-border-width` remain local
component tokens because the shared token file is outside this ownership boundary. Both disabled and enabled
one-shot development compilations succeed. A webpack-dev-server process remains independently constrained by
the host's `EMFILE: too many open files, watch` limit before compilation; no Webpack configuration was changed.
