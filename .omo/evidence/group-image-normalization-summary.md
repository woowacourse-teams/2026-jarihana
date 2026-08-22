# Group image normalization evidence

Verified on the current shared worktree on 2026-08-21.

| Scenario | Invocation | Binary observable | Artifact | Verdict |
| --- | --- | --- | --- | --- |
| RED: live relative representative image path | `npm test -- tests/domain/domain-contracts.test.js` from `frontend/` before implementation | Expected `/images/default-group.png`, received `images/default-group.png`; 1 test failed; process exit 1 | `group-image-normalization-red.log` | Expected RED |
| GREEN: group entity normalization and all owned regressions | `npm test -- tests/domain --json --outputFile=../.omo/evidence/group-image-normalization-green.json` from `frontend/` | 5 suites passed; 55 tests passed; process exit 0 | `group-image-normalization-green.json` | PASS |
| Owned JavaScript lint | `./node_modules/.bin/eslint src/entities src/features/group src/features/member src/features/recruitment src/features/registration tests/domain --format json --output-file ../.omo/evidence/group-image-normalization-eslint.json` from `frontend/` | Parsed report covers 27 files with 0 errors and 0 warnings; process exit 0 | `group-image-normalization-eslint.json` | PASS |

`groupListItemSchema` now normalizes nonempty relative image paths to root-relative paths at the entity boundary. It preserves `null`, existing root-relative paths, and absolute HTTP(S) URLs. Because `groupDetailSchema` extends this schema, list and detail responses share the same behavior.
