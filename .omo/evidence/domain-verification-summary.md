# Domain contract verification

Verified at the current shared worktree state on 2026-08-21.

| Scenario | Invocation | Binary observable | Artifact | Judgment |
| --- | --- | --- | --- | --- |
| Domain schemas, query builders, cursor merging, validation, API payloads | `npm test -- tests/domain` from `frontend/` | Jest reports 4 suites passed and 35 tests passed; process exit 0 | `domain-verification-tests.log` | PASS |
| Owned JavaScript static checks | `./node_modules/.bin/eslint src/entities src/features/group src/features/member src/features/recruitment src/features/registration tests/domain --format json --output-file ../.omo/evidence/domain-verification-eslint.json` from `frontend/` | Every JSON result has an empty messages array; process exit 0 | `domain-verification-eslint.json` | PASS |
| Whole frontend production bundle | `npm run build` from `frontend/` | Webpack cannot resolve `frontend/src/index.jsx`; process exit 1 | `domain-verification-build.log` | FAIL |

The domain-owned implementation is test- and lint-clean. The frontend as a whole is not yet verified because its separately owned Webpack entry file does not exist in the current worktree. No overall completion claim is made.
