# Round 2 clone/design-system fidelity review (code)

- **Recommendation:** REQUEST_CHANGES
- **Scope:** fresh read-only review of `frontend/src`, `frontend/DESIGN.md`, `frontend/docs/IMPLEMENTATION_MAP.md`, the eight reference/actual pairs and diff JSON files, and final browser verification evidence.
- **Decision rule:** the five `final2` captures are visual targets. The create/member/recruitment-management draft captures were reviewed only for evidence completeness and live implementation; they are not pixel targets.

## Evidence inspected

- Design contract: `frontend/DESIGN.md`, `frontend/docs/IMPLEMENTATION_MAP.md`.
- Global shell/tokens/primitives: `frontend/src/app/AppShell.{jsx,css}`, `frontend/src/shared/styles/tokens.css`, `frontend/src/shared/styles/ui.css`, and every module under `frontend/src/shared/ui/`.
- Route/component implementation: the complete `frontend/src/app`, `frontend/src/pages`, `frontend/src/features`, and `frontend/src/entities` tree (9,589 LOC of JS/JSX/CSS), with focused inspection of Groups, account/MyActivityBoard, group editor, and management surfaces.
- Visual authority/reference captures: `.omo/evidence/figma/{groups-438-2659,group-detail-438-2779,my-438-2904,group-edit-438-3012,group-manage-438-3116}.png`.
- All matched captures and all eight `.omo/evidence/visual-qa/diffs/*.json` files. Each pair has exact reference dimensions and intact alpha. Current `final2` scores are groups 50, detail 82, my 72, edit 64, and registrations 78; these numbers were interpreted with direct image inspection, rather than treated as a threshold.
- Browser/e2e evidence: `.omo/evidence/e2e-fixture/final-verification.md` records a production-build 66/66 Playwright pass, 48 route/viewport scenarios, eight matched captures, ten interaction/error scenarios, 16 desktop axe scans with zero critical/serious violations, and freshness (oldest requested capture 856 seconds newer than the last product-source change).

## Findings

### CRITICAL

None. The rendered pages are a real React component tree: routes render through one `AppShell`, route pages consume shared primitives, and API hooks supply runtime data. No page uses a screenshot/raster as its UI surface, no data URI/canvas screenshot technique was found, and no production mock-success path was found. The small raster files are scoped Figma illustration assets (512x512 or smaller), while the surrounding header, forms, cards, list rows, buttons, and state surfaces are live DOM.

### HIGH

1. **Repeated design-scale literals bypass the token system in shared primitives.** The global tokens already define `--border-thin` and `--touch-target` in [`tokens.css:61-64`](../../../frontend/src/shared/styles/tokens.css#L61), but `ui.css` hard-codes their same values repeatedly: `0.0625rem` borders at [`ui.css:34`](../../../frontend/src/shared/styles/ui.css#L34), [`146`](../../../frontend/src/shared/styles/ui.css#L146), [`240`](../../../frontend/src/shared/styles/ui.css#L240), [`508`](../../../frontend/src/shared/styles/ui.css#L508), [`563`](../../../frontend/src/shared/styles/ui.css#L563), and [`701`](../../../frontend/src/shared/styles/ui.css#L701); and `2.75rem` touch geometry at [`41`](../../../frontend/src/shared/styles/ui.css#L41), [`90`](../../../frontend/src/shared/styles/ui.css#L90), [`113`](../../../frontend/src/shared/styles/ui.css#L113), [`149`](../../../frontend/src/shared/styles/ui.css#L149), [`195`](../../../frontend/src/shared/styles/ui.css#L195), [`349-350`](../../../frontend/src/shared/styles/ui.css#L349), and [`378`](../../../frontend/src/shared/styles/ui.css#L378). This is not intrinsic illustration sizing or deliberate page-local geometry: these are global primitive rules, repeated ten and nine times respectively, and they duplicate declared semantic tokens. Replace them with the existing token aliases (and add named variants only where the size is genuinely distinct). This is a design-system architecture blocker under the stated token-driven criterion.

### MEDIUM

None. The former repeated page-scale geometry issue is materially improved: account, groups, group-editor, and management layers now use appropriately scoped local variables for their unique rails, art, content widths, and responsive algorithms. Those values are intentional surface geometry, not global-token candidates.

### LOW

None.

## What passed

- The reusable system is real: `Button`, fields, cards, tabs, overlay/drawer/dialog, toast, states, cursor list, and layout primitives are live components reused by public, account, editor, and management routes. The common navigation is supplied once by [`AppShell.jsx`](../../../frontend/src/app/AppShell.jsx), not cloned per page.
- Colour and type foundations are centralized. A raw-color scan found colour literals only in [`tokens.css`](../../../frontend/src/shared/styles/tokens.css), not route CSS/JSX.
- The scoped Figma SVG/PNG illustrations support only local art panels; they do not substitute for a complete page. The five visual-target captures visibly preserve the black/mint/white system, rounded/inset desktop shell, hierarchy, and responsive layout; backend-authoritative differences (auth state, real DTO text/counts, unavailable image mutation) do not justify a fidelity rejection.
- The CJK fixes are present and verified in fresh 360px evidence: `dashboard-counts` changes to two columns with the last item spanning both ([`account.css:449-462`](../../../frontend/src/pages/account/account.css#L449)); label wrapping is protected at [`199-202`](../../../frontend/src/pages/account/account.css#L199)); shared card/state title and description wrapping uses `word-break: keep-all` ([`ui.css:277-283`](../../../frontend/src/shared/styles/ui.css#L277), [`591-603`](../../../frontend/src/shared/styles/ui.css#L591)). The fresh `/my` and showcase mobile captures show no earlier intra-word Korean split.
- Eight paired captures/diffs now exist. The three draft-context families have complete paired evidence, satisfying the former evidence gap without incorrectly treating them as `final2` pixel contracts.

## Blocker to approval

1. Alias the repeated global primitive border/touch dimensions to the declared design tokens (or introduce documented semantic variant tokens where needed), then run the existing token audit and regenerate the fidelity report/evidence against the changed CSS.
