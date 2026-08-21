# Final 4 visual QA — Pass A

- **recommendation:** REVISE
- **reviewType:** Fresh read-only design-system / functional-integrity / raster-completeness pass
- **originalIntent:** Ship the complete backend-connected React frontend in the Figma `final2` visual system, using one common `AppShell`, real backend authority, responsive 360/768/1440 layouts, and live DOM rather than screenshot substitution. The five `final2` frames are visual targets; the create/member/recruitment-management drafts provide flow context only.
- **desiredOutcome:** All 48 route captures and 8 matched-size captures are complete and legible, with no partial/blank composited layers, horizontal displacement, malformed CJK wrapping, or missing shared-shell content. The five target routes retain the final2 black/mint/white grammar and hierarchy.

## User outcome review

REVISE. The account CJK fix itself is visible and correct: `my-groups-mobile-360.png` keeps `세션` intact and wraps the card description on natural Korean boundaries, while `signup-mobile-360.png` balances the heading over two lines without orphaning `주세요`. The matrix otherwise shows coherent breakpoint reflow and a real shared design system. However, two current permanent route PNGs still contain incomplete header layers: the mobile not-found frame has only a black header rectangle, and the desktop signup frame has only its right-side signup CTA on the black header. This directly violates the required no-partial-layer outcome and contradicts the inspected verification prose.

## Blocking findings

1. **[evidence] [raster completeness] HIGH — `not-found-mobile-360.png` has an incomplete AppShell header.**
   - `violatedCriterion`: Every requested route capture must contain a complete header/body with no partial or blank layers; the common `AppShell` must be visible across routes.
   - `evidencePointer`: `.omo/evidence/visual-qa/not-found-mobile-360.png` — direct native-resolution open shows a solid black 72px header with neither the `자리 하나?` brand nor the hamburger control. Compare `.omo/evidence/visual-qa/signup-mobile-360.png` and current `frontend/src/app/AppShell.jsx`, both of which show/define those elements.
   - Required correction: recapture this permanent PNG in an isolated fresh browser and directly reopen the resulting path before rerunning the complete final gate.

2. **[evidence] [raster completeness] HIGH — `signup-desktop-1440.png` has an incomplete AppShell header.**
   - `violatedCriterion`: Every requested route capture must contain a complete header/body with no partial or blank layers; the common `AppShell` must be visible across routes.
   - `evidencePointer`: `.omo/evidence/visual-qa/signup-desktop-1440.png` — direct native-resolution open shows the black header and `가입 계속하기` action, but the brand and all three centered navigation links are absent. Current `frontend/src/app/AppShell.jsx` always renders brand and desktop navigation.
   - Required correction: recapture this permanent PNG in an isolated fresh browser and directly reopen the resulting path before rerunning the complete final gate.

## Checked artifact paths

### 48 route PNGs — all opened in this pass

- `group-create-{desktop-1440,mobile-360,tablet-768}.png`
- `group-detail-{desktop-1440,mobile-360,tablet-768}.png`
- `group-manage-{desktop-1440,mobile-360,tablet-768}.png`
- `groups-{desktop-1440,mobile-360,tablet-768}.png`
- `members-manage-{desktop-1440,mobile-360,tablet-768}.png`
- `my-{desktop-1440,mobile-360,tablet-768}.png`
- `my-groups-{desktop-1440,mobile-360,tablet-768}.png`
- `my-registrations-{desktop-1440,mobile-360,tablet-768}.png`
- `not-found-{desktop-1440,mobile-360,tablet-768}.png`
- `oauth-callback-{desktop-1440,mobile-360,tablet-768}.png`
- `recruitment-detail-{desktop-1440,mobile-360,tablet-768}.png`
- `recruitments-manage-{desktop-1440,mobile-360,tablet-768}.png`
- `registrations-manage-{desktop-1440,mobile-360,tablet-768}.png`
- `root-{desktop-1440,mobile-360,tablet-768}.png`
- `showcase-{desktop-1440,mobile-360,tablet-768}.png`
- `signup-{desktop-1440,mobile-360,tablet-768}.png`

Root for the above: `.omo/evidence/visual-qa/`.

### 8 matched PNGs — all opened in this pass

- `.omo/evidence/visual-qa/matched/group-create-1440x1120.png`
- `.omo/evidence/visual-qa/matched/group-detail-1440x1349.png`
- `.omo/evidence/visual-qa/matched/group-manage-edit-1440x1349.png`
- `.omo/evidence/visual-qa/matched/groups-1526x1009.png`
- `.omo/evidence/visual-qa/matched/manage-registrations-1440x1000.png`
- `.omo/evidence/visual-qa/matched/members-manage-1440x1120.png`
- `.omo/evidence/visual-qa/matched/my-1440x1000.png`
- `.omo/evidence/visual-qa/matched/recruitments-manage-1440x1120.png`

### Direct-open risk set

- Direct-opened `my-groups-mobile-360.png` and `signup-mobile-360.png` at native resolution.
- Direct-opened all eight named raster-risk artifacts: `not-found-mobile-360.png`, `not-found-tablet-768.png`, `not-found-desktop-1440.png`, `signup-desktop-1440.png`, `recruitments-manage-desktop-1440.png`, `matched/members-manage-1440x1120.png`, `oauth-callback-mobile-360.png`, and `my-registrations-desktop-1440.png`.
- Direct-opened `.omo/evidence/final-reviews/artifacts/members-manage-current-1440x1120.png`. The first PNG viewer response was spuriously black, but independent decode reported RGB 1440×1120, nonempty full-frame bounds, and channel extrema 0–255; decoding that exact file to a fresh JPEG path rendered the complete five-row members page. `cmp -s` exited 0 and both PNG paths have SHA256 `8181082bddc7246cccbe618c09b4b2962f080129b9c5a22ffe5af43dff657b90`. This is a viewer-cache anomaly, not a defective artifact.

### References

Directly opened the five pixel-authority `final2` targets:

- `.omo/evidence/figma/groups-438-2659.png`
- `.omo/evidence/figma/group-detail-438-2779.png`
- `.omo/evidence/figma/my-438-2904.png`
- `.omo/evidence/figma/group-edit-438-3012.png`
- `.omo/evidence/figma/group-manage-438-3116.png`

Also opened the three context-only draft frames: `.omo/evidence/figma/group-create-462-1337.png`, `member-manage-445-252.png`, and `recruitment-manage-445-144.png`; they were not treated as pixel targets.

### Source and prose evidence

- `.omo/evidence/e2e-fixture/final-verification.md`
- `frontend/DESIGN.md`
- `frontend/docs/IMPLEMENTATION_MAP.md`
- Current `frontend/src/app/`, `frontend/src/pages/`, `frontend/src/shared/ui/`, and shared/page CSS inspected for shell reuse, responsive rules, tokens, CJK wrapping, and screenshot substitution.

## Dimension review

- **Responsive 360/768/1440:** PASS for product layout. The route families visibly reflow from single-column/mobile-drawer layouts to tablet grids and desktop rails/tables without page-level horizontal displacement.
- **Common AppShell:** PASS in source and in the majority of captures; two evidence PNGs fail to composite the complete rendered shell and therefore block the evidence set.
- **CJK precision:** PASS on both requested account-fix targets and the remaining directly inspected text. No tofu, mid-word Korean split, particle/ending orphan, or clipped descender was found.
- **Contrast:** PASS on direct visual inspection. Mint text uses darker ink tokens; muted, danger, warning, and success states remain legible on their surfaces. The supplied final verification also records zero serious/critical axe findings for desktop routes.
- **Real DOM / no screenshot fake:** PASS. `AppRouter` mounts all routes under one `AppShell`; pages render reusable fields, cards, tabs, tables, dialogs, and state primitives. No production import/reference to `.omo/evidence`, matched captures, or Figma screenshot frames was found. Raster/SVG assets are bounded illustration and fallback art, not full-page substitutes.
- **Final2 fidelity:** PASS at the stated structural-system level. The five target families retain the black inset shell, mint accents, rounded white/gray surfaces, route-specific hierarchy, and responsive extrapolation. Backend/auth fixture differences were not treated as failures. The three older drafts were context only.

## Anti-slop / programming pass

Production source is live component code with shared tokens and primitives; no screenshot-pasting, route-sized raster background, debug logging, stale TODO/FIXME, broad catch-swallow path, or needless production parser/normalizer was found in the reviewed UI surface. The test suite includes observable E2E route/interactions, but several CSS tests (`account-css.test.js`, `manage-css.test.js`, `app-shell-css.test.js`, `cjk-layout.test.js`) assert implementation strings. Those are implementation-mirroring and can create false confidence; this is a maintenance NOTE, not a blocker, because the stated visual criteria are independently exercised by the real-browser matrix and direct artifact review. No deletion-only or requested-removal-only tests were found.

## Exact evidence gaps

- The statement in `.omo/evidence/e2e-fixture/final-verification.md` that all eight risk artifacts contain a complete header/body is contradicted by the two direct-open pointers above.
- A fresh full final matrix after repairing those two permanent captures is missing. Existing good files cannot establish an approving same-build set while two required files remain incomplete.

## Good — preserve

- The final account CJK rules visibly solve the reported `세션` and signup-heading wrap problems.
- All breakpoint families maintain coherent information priority and avoid horizontal clipping.
- The implementation uses a genuine shared shell, token layer, responsive CSS, and semantic React DOM.
- The cache-independent members file is byte-identical to the matched original and decodes to the complete page.

## Completion gate

Not satisfied. Recapture the two blocking PNGs and then reopen every required route/matched artifact in a fresh final pass. Stop condition for this pass: **REVISE**.
