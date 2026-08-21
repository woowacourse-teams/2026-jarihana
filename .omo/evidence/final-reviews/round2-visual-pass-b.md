# Round 2 Visual QA — Pass B

VERDICT: REVISE

CONFIDENCE: HIGH

SUMMARY: The requested CJK fixes are visibly present: `운영하는 모임`, `스터디`, and `없어요` no longer split mid-word in the inspected 360px `/my`, OAuth-result, and showcase surfaces. The design language is otherwise coherent across responsive routes, but this evidence set cannot support a final PASS because several of the 56 required fresh captures are visibly incomplete or blank despite valid PNG signatures.

## Scope and evidence checked

- Directly opened all 48 route captures in `.omo/evidence/visual-qa/` (16 routes at 360/768/1440).
- Directly opened all 8 captures in `.omo/evidence/visual-qa/matched/`.
- Checked `.omo/evidence/e2e-fixture/final-verification.md` for the 66-test run, axe claims, route count, and freshness timestamps.
- Checked all 8 JSON files in `.omo/evidence/visual-qa/diffs/`; all report matching dimensions and intact alpha. Similarity scores are 50/82/72/64/78 for the final2 groups/detail/my/edit/manage groups and 17/44/45 for draft create/member/recruitment groups.
- Checked all 8 Figma PNG references in `.omo/evidence/figma/` and the reference-authority decisions in `frontend/DESIGN.md`.
- Checked capture implementation at `frontend/tests/e2e/app.spec.js:117-124`.
- Verified PNG signatures/dimensions with `file` for the 48 route and 8 matched captures.

## Evidence trace

- Final2 diff hotspots on groups (score 50) are dominated by the intentional shared AppShell/content-density differences documented in `frontend/DESIGN.md`, not a CJK failure. Direct inspection shows the same black inset shell, mint accent, illustration language, filters, and rounded cards across breakpoints.
- Group detail (82) is the closest final2 match; its high-difference hero-center cells correspond to fixture imagery/content rather than missing layout anatomy.
- My (72), edit (64), and manage registrations (78) retain the reference hierarchy and shared tokens; the remaining hotspots align with actual backend-driven data and the unified AppShell decision.
- Draft create/member/recruitment scores (17/44/45) are not pixel authority per the brief. Direct inspection shows these routes use the final2 design language while preserving functional controls and real data.
- The previous CJK defects are fixed: `.omo/evidence/visual-qa/my-mobile-360.png` shows `운영하는 모임` on one line; `.omo/evidence/visual-qa/showcase-mobile-360.png` shows `스터디` and `아직 내용이 없어요` without mid-word splitting; `.omo/evidence/visual-qa/oauth-callback-tablet-768.png` renders the corrected `/my` result.
- Across the otherwise complete captures, no tofu, one-character Korean orphan, detached particle/ending, document-level horizontal overflow, or baseline clipping was observed.

## Findings

1. [evidence] [BLOCKING] The capture set contains visibly incomplete compositor output, contradicting the required complete-fresh-capture gate.
   - `.omo/evidence/visual-qa/not-found-mobile-360.png`: only a tiny fragment of the header wordmark renders in the black bar.
   - `.omo/evidence/visual-qa/not-found-tablet-768.png`: only the right-side `마이페이지` fragment renders; brand, central navigation, and action are absent.
   - `.omo/evidence/visual-qa/not-found-desktop-1440.png`: same partial-header failure.
   - `.omo/evidence/visual-qa/signup-desktop-1440.png`: black header is present but only the far-right `가입 계속하기` action is rasterized.
   - `.omo/evidence/visual-qa/recruitments-manage-desktop-1440.png`: header and the leading page heading/tabs are partially blank/clipped, while the matched capture of the same route renders them correctly.
   - `.omo/evidence/visual-qa/matched/members-manage-1440x1120.png`: header contains only isolated navigation fragments, while the ordinary desktop/tablet captures render the shared header correctly.
   - `.omo/evidence/visual-qa/oauth-callback-mobile-360.png`: the entire 360x2015 image is black, while the same route at 768/1440 resolves to the complete `/my` surface.
   - Concrete fix: recapture these states in clean standalone Chromium contexts (or fix the capture warm-up/compositor path), directly open the replacements, then regenerate any affected diffs. Do not claim capture integrity from signatures, dimensions, DOM bounds, or test counts alone.

## What is good

- The previously blocking Korean mid-word splits are resolved at 360px.
- Complete captures show natural responsive reflow at 360/768/1440 with a consistent AppShell, typography, mint/black palette, radii, panels, cards, and management tabs.
- No screenshot is substituted into the UI; rendered screens are live component surfaces.
- PNG signatures, requested dimensions for matched captures, and alpha flags are valid.

## BLOCKING

- [evidence] Replace and directly verify the seven incomplete/blank captures listed above. A final PASS requires every one of the 56 required images to be fully composited.

