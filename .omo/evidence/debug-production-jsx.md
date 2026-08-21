# Production JSX runtime debugging evidence

Date: 2026-08-21 (Asia/Seoul)

## Observable failure

- Surface: production Webpack preview opened in Chromium.
- Symptom: the application did not mount and the browser reported `(0, b.jsxDEV) is not a function`.
- Bundle probe: a clean production build still contained 955 `jsxDEV` occurrences.

## Hypotheses and discriminating evidence

1. **Babel JSX mode did not match the production React runtime — confirmed.**
   An unset/default Babel environment emitted `react/jsx-dev-runtime` and `jsxDEV`; an explicit production environment emitted `react/jsx-runtime` and `jsx`.
2. **Webpack production mode itself was absent — refuted.**
   Webpack was already invoked with `--mode production`; the missing channel was the Babel loader environment.
3. **Stale hashed chunks were the primary cause — refuted.**
   A clean build reproduced the 955 development-helper calls before the configuration fix.

## Root fix

- `frontend/webpack.config.mjs` now passes `envName: mode` to `babel-loader`, so production Webpack selects Babel's production React transform.
- Production resolution aliases `react-grab` and `react-scan` to `false`, keeping development-only tools out of the production graph.
- Development tooling uses the supported `react-scan/lite` entry and calls `instrument()`; `DISABLE_REACT_DEVTOOLS=1` skips loading it.
- `frontend/tests/config/webpack-production-jsx.test.js` locks the production Babel environment and aliases.

## Verification

- Production Webpack build exits 0 and emits the `jsx` runtime path; only the documented asset-size advisories remain.
- Chromium mounts the production application and the browser suite passes all 66 scenarios.
- The final browser run covers 48 route/viewport captures, eight matched captures, interaction/error flows, and 16 desktop axe scans with zero serious or critical violations.
- A real-backend production-preview smoke renders `/groups` and `/groups/1`, including deep-link reload, responsive layouts, `/api` proxying, and `/images` proxying.

No debug-only runtime branch or fixture data is included in the production bundle.
