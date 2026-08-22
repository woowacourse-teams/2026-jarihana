# Round 2 Visual QA Pass A

VERDICT: REVISE

RECOMMENDATION: REJECT

CONFIDENCE: HIGH

## Original intent

Ship a complete backend-connected React frontend in JavaScript/JSX with Webpack/Jest, with backend authority for data/actions/permissions, Figma `final2` authority for the visual language, one common `AppShell`, responsive 360/768/1440 layouts, and no fake support for upload, profile editing, or direct join.

## Desired outcome

Every required route and state renders as live semantic DOM in the shared design system; all 48 route captures and 8 matched captures are fresh, complete, unclipped, and valid evidence of the final source.

## User outcome review

The product implementation itself is broadly coherent and the inspected responsive surfaces render as real components. However, the supplied evidence set does not satisfy the stated capture-validity outcome: the freshly recaptured desktop My Applications artifact still loses almost the entire shared header. Because this exact artifact is part of the required 56-image proof set and was specifically claimed corrected, the final result cannot be certified from the current artifacts.

## Findings

1. [evidence] [BLOCKING] `my-registrations-desktop-1440.png` is still visibly corrupt/incomplete. At 1440×1000, the black `AppShell` header is absent from x=0 through roughly x=1200; only the far-right `마이페이지` fragment remains. The wordmark, center navigation, and logout control are missing. This directly contradicts the final-verification claim that the refreshed artifact has a complete “header, brand, centered navigation, page content, and right action.”

2. [product] [PASS] Direct inspection of `root-desktop-1440.png` and `registrations-manage-tablet-768.png` confirms the earlier left-clipping defects on those two artifacts are corrected. Their shared header, primary heading, and content bounds are complete.

3. [product] [PASS] All 56 requested PNGs were opened, not sampled: 48 route captures across 16 routes × 3 widths and 8 matched captures. The mobile/tablet layouts consistently reflow into usable single-column or compact management layouts without visible horizontal overflow. Desktop discovery, detail, account, editor, and management compositions are populated and coherent.

4. [product] [PASS] Source inspection confirms real React DOM and shared implementation rather than screenshots as UI: `AppRouter` uses one `AppShell`; shared tokens/primitives are consumed across route CSS; illustration assets are used as artwork, not full-page raster substitutes. Unsupported upload/profile/direct-join flows are documented as omitted rather than faked.

5. [evidence] [PASS] All eight diff JSON files report `dimensionsMatch: true` and `alphaChannelIntact: true`. Their similarity scores range from 17 to 82, but the current gate blocker is evidence completeness, not an unstated numeric similarity threshold.

6. [product] [NOTE] The direct `remove-ai-slops`/`programming` pass found no screenshot fake, production fixture leakage, debug logging, deletion-only tests, requested-removal-only tests, tautological prose pins, or unnecessary visual motion in the inspected scope. Several CSS/JSX modules exceed the skills' 250-pure-LOC guideline; that is maintenance debt, not a blocker tied to the stated visual outcome. Existing review artifacts explicitly cover the same anti-slop perspective, including overfit/deletion-only criteria.

## Blockers

- violatedCriterion: `CAPTURE-VALIDITY-56` — every required route/matched PNG must be a complete, unclipped, fresh representation of the final source. Observation: the required desktop My Applications capture omits most of the common header. evidencePointer: `.omo/evidence/visual-qa/my-registrations-desktop-1440.png` (compare intact shared shell in `.omo/evidence/visual-qa/root-desktop-1440.png` and the contradictory claim in `.omo/evidence/e2e-fixture/final-verification.md`).

## Good aspects

- The two other specifically requested regression artifacts are now visibly intact.
- The 360px layouts preserve readable Korean text, controls, and content hierarchy.
- Management registrations now presents four operational applicant states plus member/recruitment context at tablet width.
- The shared black/mint/white visual grammar and common shell are recognizable across all route families.
- Capture freshness ordering is supported: the oldest requested capture is newer than the latest product source timestamp.

## Checked artifact paths

- All 48 top-level requested PNGs in `.omo/evidence/visual-qa/` (excluding the three separately named `public-fidelity-*` files).
- All 8 PNGs in `.omo/evidence/visual-qa/matched/`.
- All 8 JSON files in `.omo/evidence/visual-qa/diffs/`.
- `.omo/evidence/e2e-fixture/final-verification.md`.
- `.omo/evidence/final-reviews/code-fidelity.md`, `visual-pass-a.md`, `visual-pass-b.md`, and `pixel-compare.md`.
- `frontend/DESIGN.md`, `frontend/docs/IMPLEMENTATION_MAP.md`, and `frontend/src/`.

## Exact evidence gaps

- A new, directly inspected `.omo/evidence/visual-qa/my-registrations-desktop-1440.png` with the entire shared header visible is missing.
- The claimed standalone recapture passed automation but did not produce a visually complete artifact, so the existing bounds/raster checks are insufficient to prove the common header was painted into the PNG.

