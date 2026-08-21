# JSX/Webpack scaffold evidence

- **Node runtime and dependency lock:** `PATH=/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm install` from `frontend/` completed with Node `v24.19.0`; `frontend/package-lock.json` was generated. `npm ci --dry-run` then exited `0` without a peer-dependency bypass.
- **Static configuration:** `node --check` completed for `webpack.config.mjs`, `eslint.config.mjs`, `babel.config.cjs`, `postcss.config.cjs`, and `tests/setup.js`; `package.json` parsed successfully.
- **Webpack OAuth contract:** importing `webpack.config.mjs` under Node 24 produced the expected development config (port `5173`, history fallback, `/api` and `/images` proxy) and DefinePlugin keys for `APP_GITHUB_CLIENT_ID`, `APP_GITHUB_REDIRECT_URI`, `APP_OAUTH_COOKIE_NAME`, and `APP_OAUTH_COOKIE_DOMAIN`.
- **ESM test dependencies:** Node 24 imported both `ky` and React Router's `MemoryRouter` successfully.
- **Jest collection:** `npm test -- --listTests` discovered 21 current tests using the final `--no-watchman` and ESM transform configuration.
- **Jest execution:** `npm test -- tests/domain/validation.test.js` passed: 1 suite, 14 tests.
- **Asset import mapping:** Jest maps image extensions to `scripts/styleMock.js`; `npm test -- tests/pages/account/my-page.test.jsx` passed: 1 suite, 1 test.
- **Webpack loader matching:** JavaScript, CSS, and asset rule regexes use real filename patterns (`/\.jsx?$/`, `/\.css$/`, `/\.(avif|gif|jpe?g|png|svg|webp)$/i`). The build invocation reached normal entry resolution; it is pending `src/index.jsx`, which has not yet been added by the app-entry lane.
- **Production JSX runtime:** `tests/config/webpack-production-jsx.test.js` was first red because production Webpack supplied bare `babel-loader`; it is green after Webpack passes `envName: "production"` to Babel and aliases development-only `react-grab`/`react-scan` to ignored modules for production builds. `npm run build` now exits `0`; Webpack reports only its size-budget warnings for the Figma profile image and main bundle.
- **Known concurrent worktree findings:** full lint reaches project sources but currently reports app-lane issues in `src/features/auth/context.jsx`, `src/features/registration/hooks.js`, and `tests/pages/public/public-groups.test.jsx`; they are outside the toolchain scaffold ownership.
