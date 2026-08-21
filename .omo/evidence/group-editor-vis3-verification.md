# Group editor VIS-3 verification

Date: 2026-08-21 (Asia/Seoul)

## Changelist

- Replaced the manage page's `01/02/03` editor architecture with an in-place two-column detail hero and a directly adjacent compact description editor.
- Added `RepresentativeImage.jsx`: a real representative image remains read-only; the backend default image is rendered from the exact Figma `edit-01/02/03/08.svg` assets. No upload action exists.
- Reduced the description editor from 9 to 6 rows and placed its supported save action in the editor heading. Schedule replacement/removal and lifecycle controls remain below their existing API-backed forms.
- Added local semantic geometry tokens and responsive reflow. No raw color literals or pixel geometry were introduced in the owned manage implementation.
- Added an owned regression test for the unnumbered hierarchy, read-only image region, absent upload action, and compact editor.

## Evidence matrix

| Success criterion | Scenario / invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| TDD RED | Node 24 Jest, `tests/pages/group-editor/group-editor-pages.test.jsx`, before implementation | Exit 1; 9 passed, 1 failed because `읽기 전용 대표 이미지` did not exist | `.omo/evidence/group-editor-vis3-red.json` (14,255 bytes) |
| Owned behavior GREEN | Node 24 Jest, same test file, `--runInBand --no-watchman` | Exit 0; 10/10 tests passed | `.omo/evidence/group-editor-vis3-green.json` (4,635 bytes) |
| Static analysis | Node 24 ESLint on `src/pages/group-editor tests/pages/group-editor` | Exit 0; 7 files, 0 errors, 0 warnings | `.omo/evidence/group-editor-vis3-eslint.json` (1,874 bytes) |
| Formatting | Node 24 Prettier `--check src/pages/group-editor tests/pages/group-editor` | Exit 0; `All matched files use Prettier code style!` | This report plus unchanged formatted source files |
| Production compile | Node 24 webpack `--mode production` | Exit 0; webpack compiled successfully. Only the repository's existing asset/entrypoint size warnings remained. | `frontend/dist/index.html` and `frontend/dist/assets/` |
| Responsive + accessibility | Playwright Chromium grep: `group-manage renders at (mobile-360|tablet-768|desktop-1440)` | 3/3 passed; desktop run includes axe critical/serious audit and finished with no violation | `.omo/evidence/visual-qa/group-manage-mobile-360.png`, `group-manage-tablet-768.png`, `group-manage-desktop-1440.png` |
| Figma-sized visual surface | Playwright Chromium: `group-manage-edit-1440x1349 matched Figma capture` | Passed; screenshot is exactly 1440×1349 and shows the compact hero/editor hierarchy | `.omo/evidence/visual-qa/matched/group-manage-edit-1440x1349.png` (SHA-256 `2cda20a719211104b883e1263dddf36f4e0c6c02baad6d03a18e5bbabf4dc0d1`) |
| API flow preservation | Playwright Chromium: `group creation and edit lifecycle mutations use server contracts` | Passed; real form interaction reached the fixture-observed create/edit/schedule/lifecycle contracts | Same 5-test Playwright invocation output; screenshots above bind the compiled surface |

## Manual visual observations

- At 1440px, the mint hero is the same compact two-column rhythm as the reference: editable title/intro at left and the Figma-derived read-only illustration at right. The old 22.5rem ring placeholder and numbered titles are absent.
- The description editor begins immediately after the hero and its save action shares the heading row, removing the former large footer band.
- At 360px, the hero reflows to one column; `프론트엔드` remains intact instead of splitting mid-word. At 768px, all form controls remain within the viewport.
- The final browser pass was 5/5: mobile, tablet, desktop with axe, matched-Figma capture, and create/edit lifecycle.

## Environment note

`omo ulw-loop status --json` was unavailable (`omo: command not found`), so evidence was recorded under the repository fallback `.omo/evidence/` directory as required.
