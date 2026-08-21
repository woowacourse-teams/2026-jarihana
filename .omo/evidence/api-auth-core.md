# API/Auth Core Evidence

Date: 2026-08-21 KST
Runtime: bundled Node.js v24.19.0

## TDD RED

Initial feature-boundary invocation:

```text
node node_modules/jest/bin/jest.js --runInBand --watchman=false --config=<temporary-no-setup-config> --runTestsByPath tests/api/client.test.js tests/api/errors.test.js tests/auth/authApi.test.js tests/auth/oauth.test.js
```

Binary observable: four suites failed because `src/shared/api` and `src/features/auth` did not exist. This was the expected feature-missing RED before implementation.

StrictMode and complete backend error-map RED invocation:

```text
node node_modules/jest/bin/jest.js --runInBand --watchman=false --runTestsByPath tests/auth/context.test.jsx tests/api/errors.test.js
```

Binary observable: `AuthProvider` called `bootstrapAuth` twice under React StrictMode (`expected 1, received 2`), and 21 backend error codes fell through to the generic message. Both failures were observed before their fixes.

## GREEN

Final owned-suite invocation:

```text
/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/jest/bin/jest.js --runInBand --watchman=false --runTestsByPath tests/api/client.test.js tests/api/errors.test.js tests/auth/authApi.test.js tests/auth/config.test.js tests/auth/context.test.jsx tests/auth/oauth.test.js
```

Binary observable:

```text
Test Suites: 6 passed, 6 total
Tests:       58 passed, 58 total
Snapshots:   0 total
```

Covered scenarios: envelope/Zod parsing, malformed payload rejection, 204 no-parse, cookie credentials, XSRF propagation, conditional refresh, no 403 refresh, concurrent single-flight refresh, one retry maximum, refresh-failure expiration callback, all 40 backend error codes, auth API shapes, bootstrap sequence, StrictMode idempotence, public OAuth config, cryptographic state cookie and authorize URL.

## Static gates

```text
node node_modules/eslint/bin/eslint.js src/shared/api src/shared/config src/features/auth tests/api tests/auth
```

Binary observable: exit 0, no output.

```text
node node_modules/prettier/bin/prettier.cjs --check src/shared/api src/shared/config src/features/auth tests/api tests/auth
```

Binary observable: `All matched files use Prettier code style!`

Backend/frontend error-code parity check: backend `ErrorCode.java` = 40 codes, safe frontend mapping = 40 codes, `comm -3` produced no differences.

## Return-target and auth-state hardening

RED invocation:

```text
node node_modules/jest/bin/jest.js --runInBand --watchman=false --runTestsByPath tests/auth/returnTarget.test.js tests/auth/context.test.jsx
```

Binary observable: 10 tests failed before implementation. Return-target exports were missing, while network and malformed bootstrap failures rendered `anonymous` instead of the required `unavailable` state.

Final owned-suite invocation:

```text
node node_modules/jest/bin/jest.js --runInBand --watchman=false --runTestsByPath tests/api/client.test.js tests/api/errors.test.js tests/auth/authApi.test.js tests/auth/config.test.js tests/auth/context.test.jsx tests/auth/oauth.test.js tests/auth/returnTarget.test.js
```

Binary observable:

```text
Test Suites: 7 passed, 7 total
Tests:       70 passed, 70 total
Snapshots:   0 total
```

New protected scenarios: internal query/hash target preservation, protocol-relative/external/script/backslash/whitespace rejection, tampered storage clearing, one-time consumption with safe fallback, 401-only anonymous state, explicit unavailable/error state for network and malformed responses, successful retry, and distinct signup-required state. Owned ESLint exited 0 and Prettier reported all files matched.

## Signup boundary consolidation

Consumer audit:

```text
rg -n "signupInputSchema|signupResultSchema|import .*signup.*features/auth" frontend/src frontend/tests
```

Binary observable before removal: the only auth `signup` consumer was its own obsolete auth unit test; production `SignupPage` imports `useSignupMember` from `features/member`. After removal, the audit returned no auth signup adapter/schema consumers.

Verification:

```text
node node_modules/jest/bin/jest.js --runInBand --watchman=false --runTestsByPath tests/auth/authApi.test.js tests/auth/config.test.js tests/auth/context.test.jsx tests/auth/oauth.test.js tests/auth/returnTarget.test.js tests/domain/api-contracts.test.js
```

Binary observable: 6 suites and 30 tests passed. Owned ESLint exited 0 and Prettier matched all files.

Production import smoke:

```text
node node_modules/webpack/bin/webpack.js --mode production
```

Binary observable: webpack 5.109.2 compiled successfully in 4037 ms. It reported only the existing asset/entrypoint size warnings for the profile illustration and main bundle; no missing auth exports or imports occurred.
