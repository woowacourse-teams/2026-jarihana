# Final3 visual QA — Pass B

- recommendation: **REVISE**
- originalIntent: Ship the complete backend-connected React frontend in the Figma `final2` visual system, with one shared `AppShell`, real backend authority for content/actions/permissions, coherent 360/768/1440 layouts, and complete capture evidence without clipping, black/blank regions, partial layers, tofu, or unnatural Korean wrapping. The older create/member/recruitment-management frames are functional context, not pixel targets.
- desiredOutcome: Every one of the 48 route captures and 8 matched-size captures is a complete, legible rendering; the five final2 targets preserve their hierarchy and shared design grammar; production pages remain live DOM backed by API hooks rather than screenshot or fake-data implementations.

## User outcome review

**REVISE.** Direct inspection of all 56 current route/matched PNGs found one current capture-integrity failure in the isolated-repair set: `matched/members-manage-1440x1120.png` is a partial-layer raster. Its shared header is almost entirely black/blank (brand and most navigation are missing), and the page heading/context above the tabs is also absent. The same route's ordinary desktop capture renders those elements correctly, proving this is not intentional responsive composition. This directly violates the explicit complete-capture/no-partial-layer criterion and makes the 56-image evidence set unshippable as-is.

The other 55 directly opened route/matched captures are nonblank, legible, and free of horizontal displacement or tofu. The 360/768/1440 families visibly reflow from mobile cards/drawers through tablet grids/tables to desktop rails and multi-column layouts. Korean copy generally wraps at acceptable word boundaries; no tofu was observed. The five final2 target pairs retain the black/mint/white system, rounded bordered surfaces, hierarchy, and route-specific anatomy. Their score differences are materially explained by authenticated shell state and backend fixture content; score alone is not used as a rejection.

## Blockers

1. `violatedCriterion`: **VIS-CAPTURE-COMPLETE — all 56 requested PNGs must be complete and contain no black/blank/partial layers.**
   - Observation: `.omo/evidence/visual-qa/matched/members-manage-1440x1120.png` is visibly incomplete: the 72px black header lacks the `자리 하나?` brand and most navigation/action content, and the management page heading/context is missing above the surviving `멤버 관리` / `모집 설정` tabs.
   - `evidencePointer`: `.omo/evidence/visual-qa/matched/members-manage-1440x1120.png` (SHA256 `8181082bddc7246cccbe618c09b4b2962f080129b9c5a22ffe5af43dff657b90`), contrasted with `.omo/evidence/visual-qa/members-manage-desktop-1440.png`, which contains the complete header and page heading.
   - Required correction: regenerate this matched capture in isolation until the permanent PNG itself contains the complete shell and body; then open the exact written file directly and update the verification hash.

## Capture inventory checked directly

- 48 route PNGs: every mobile/tablet/desktop file for `root`, `groups`, `group-detail`, `recruitment-detail`, `group-create`, `group-manage`, `members-manage`, `recruitments-manage`, `registrations-manage`, `my`, `my-groups`, `my-registrations`, `oauth-callback`, `signup`, `not-found`, and `showcase` under `.omo/evidence/visual-qa/` (excluding the three separately named `public-fidelity-*` files).
- 8 matched PNGs: all files under `.omo/evidence/visual-qa/matched/`.
- 5 final2 references: `.omo/evidence/figma/groups-438-2659.png`, `group-detail-438-2779.png`, `my-438-2904.png`, `group-edit-438-3012.png`, and `group-manage-438-3116.png`.
- Current isolated-repair set: all eight files listed in `.omo/evidence/e2e-fixture/final-verification.md`; current SHA256 values reproduce the report exactly, including the defective matched-members raster.

## Diff metadata checked

All eight JSON files in `.omo/evidence/visual-qa/diffs/` were read. Each reports `dimensionsMatch: true` and `alphaChannelIntact: true`. Current scores/ratios are: groups 50/.4960, detail 82/.1810, my 72/.2794, edit 64/.3551, registrations 78/.2158, and context-only create 17/.8346, member 44/.5610, recruitment 45/.5484. Metadata integrity does not override the directly visible partial raster.

## Product honesty and source review

- Checked current `frontend/src/app/AppShell.jsx`, `AppShell.css`, route registry/router composition, all route page modules, feature API/hooks, shared UI, tokens/styles, and the E2E capture code.
- The implementation is live React DOM. Route content is sourced through feature hooks/API schemas; the E2E data fixture remains under `frontend/tests/e2e/`, not production source. No screenshot-as-page, canvas page, `dangerouslySetInnerHTML`, or production fixture/mock-data boundary violation was found.
- Shared tokens, primitives, AppShell, status badges, cards, tabs, forms, rails, and responsive breakpoints are reused consistently.

## Programming / anti-slop pass

- Direct overfit/slop review found no deletion-only tests, requested-removal tests, prompt/prose pins, tautological output-derived expectations, screenshot-as-production implementation, or unnecessary production parsing/normalization introduced solely for the visual evidence.
- Notes, not blockers: several production JSX/CSS modules exceed the programming skill's preferred pure-LOC ceiling (`ui.css`, `groups.css`, `manage.css`, `account.css`, `GroupManagePage.jsx`, `ManageRegistrationsPage.jsx`, `GroupDetailPage.jsx`, `group-editor/styles.css`). This is maintenance debt but is not tied to the stated visual success criteria, so it does not block this gate.

## Exact evidence gaps

- Missing required evidence: a complete current `matched/members-manage-1440x1120.png` whose directly inspected pixels contain the shared brand/navigation and full page heading/context.
- The prose assertion in `.omo/evidence/e2e-fixture/final-verification.md` that all eight repaired files contain complete header/body is contradicted by the referenced PNG itself.

