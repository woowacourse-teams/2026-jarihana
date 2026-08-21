# Domain integration hardening evidence

Verified on the current shared worktree on 2026-08-21.

| Scenario | Invocation | Binary observable | Artifact | Verdict |
| --- | --- | --- | --- | --- |
| RED: nullable group image, repeated cursors in every infinite hook, falsey identifiers, strict signup boundary | `npm test -- tests/domain` from `frontend/` before implementation | 4 suites failed; 15 tests failed and 35 passed; process exit 1 | `domain-hardening-red.log` | Expected RED |
| GREEN: all owned domain behavior | `npm test -- tests/domain --json --outputFile=../.omo/evidence/domain-hardening-green.json` from `frontend/` | 5 suites passed; 50 tests passed; process exit 0 | `domain-hardening-green.json` | PASS |
| Owned JavaScript lint | `./node_modules/.bin/eslint src/entities src/features/group src/features/member src/features/recruitment src/features/registration tests/domain --format json --output-file ../.omo/evidence/domain-hardening-eslint.json` from `frontend/` | Parsed report covers 27 files with 0 errors and 0 warnings; process exit 0 | `domain-hardening-eslint.json` | PASS |

Implemented behavior:

- Group list/detail schemas preserve nullable `representativeImageUrl` for the existing UI fallback.
- `getSafeNextCursor(lastPage, allPages)` returns no cursor for closed, missing, or repeated cursor pages.
- Every infinite domain hook delegates `getNextPageParam` to the shared cursor guard.
- Identifier-backed group, member, recruitment, and registration queries use Boolean enabled guards.
- `signupMember` parses the strict Hangul 2-4 character signup schema before HTTP and sends `skipAuthRefresh: true`.

Integration note: `SignupPage` currently calls the separately owned auth `signup` function. The root executor was notified to route that page through the strict member signup boundary.
