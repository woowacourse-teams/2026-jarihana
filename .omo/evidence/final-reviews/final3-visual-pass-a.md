# Final3 visual QA — Pass A

## Verdict

**REVISE** (high confidence)

The current capture set is fresh, complete, nonblank, and overwhelmingly coherent across 360/768/1440. The previously reported general raster corruption is not present in the 48 route captures. However, direct inspection reproduces one defective matched capture and two mobile Korean wrapping defects, so the complete surface does not yet satisfy the stated evidence-integrity and CJK precision gates.

## Scope and authority

- Inspected all **56 requested current PNGs** directly: 48 top-level route captures under `.omo/evidence/visual-qa/` after excluding the three `public-fidelity-*` files, plus all 8 files under `.omo/evidence/visual-qa/matched/`.
- Inspected the five final2 pixel-authority references directly: `.omo/evidence/figma/{groups-438-2659,group-detail-438-2779,my-438-2904,group-edit-438-3012,group-manage-438-3116}.png`.
- Treated `.omo/evidence/figma/{group-create-462-1337,member-manage-445-252,recruitment-manage-445-144}.png` as functional context only, as required.
- Cross-checked `.omo/evidence/e2e-fixture/final-verification.md`: latest product source epoch `1787285352` precedes oldest requested capture epoch `1787285966`. The eight listed repair hashes were recomputed and match the record exactly.

## Blocking findings

1. **[evidence] Matched member-management capture is still horizontally displaced/corrupted.**  
   `.omo/evidence/visual-qa/matched/members-manage-1440x1120.png` begins with a black header containing only detached fragments (`모임 만들기`, a partial `모...`, and the right action outline); the brand and most navigation are absent. The body begins normally at x≈80, while the ordinary `.omo/evidence/visual-qa/members-manage-desktop-1440.png` shows the complete common AppShell. This is not a historical observation: the current file was opened directly and its SHA-256 is the verification record's `8181082bddc7246cccbe618c09b4b2962f080129b9c5a22ffe5af43dff657b90`. Recapture this matched frame with the same intact shell/bounds assertions used by the route matrix.

2. **[product] Korean word is split inside a syllable sequence at 360px.**  
   In `.omo/evidence/visual-qa/my-groups-mobile-360.png`, the third card description renders `접근성 실무 사례를 나누는 한 번의 집중 세` followed by `션` on the next line. This is an explicit unnatural CJK word split. Source inspection shows shared text rules combine `word-break: keep-all` with `overflow-wrap: anywhere` (`frontend/src/shared/styles/ui.css`), which allows this fallback. Preserve whole Korean words in the mobile card description (or adjust available width/type/truncation) and recapture the 360 route.

3. **[product] Signup display heading splits an auxiliary phrase awkwardly at 360px.**  
   `.omo/evidence/visual-qa/signup-mobile-360.png` renders `자리하나에서 사용할 정보를 알려` / `주세요`, leaving the auxiliary `주세요` alone on the next line. The source string is a single heading (`frontend/src/pages/account/SignupPage.jsx`). Adjust the mobile heading measure/type or introduce an intentional phrase-safe grouping so `알려 주세요` remains together, then recapture 360px.

## Full capture trace

Directly opened each 360/768/1440 triplet for: `root`, `groups`, `group-detail`, `group-create`, `group-manage`, `members-manage`, `recruitments-manage`, `registrations-manage`, `my`, `my-groups`, `my-registrations`, `recruitment-detail`, `oauth-callback`, `not-found`, `signup`, and `showcase` (48 files). Directly opened all matched captures: `groups-1526x1009`, `group-detail-1440x1349`, `my-1440x1000`, `group-manage-edit-1440x1349`, `manage-registrations-1440x1000`, `group-create-1440x1120`, `members-manage-1440x1120`, and `recruitments-manage-1440x1120` (8 files).

## What passes

- All 56 requested artifacts are real RGB PNGs, nonzero, fully composited, and show product content rather than blank/black pages. The specifically requested signup desktop, all three not-found frames, recruitments-manage desktop, oauth-callback mobile, and my-registrations desktop are complete and undisplaced.
- The route matrix reflows materially at 360/768/1440: mobile uses the menu trigger and stacked cards/forms, tablet uses intermediate grids/tables, and desktop uses wide rails/two-column compositions. No inspected route capture shows viewport-edge clipping or horizontal displacement.
- One reusable `AppShell` is present in source (`frontend/src/app/AppShell.jsx`) and visibly consistent across the intact captures. Navigation, active underline, mint/black/white palette, rounded bordered surfaces, status pills, form error red, disabled controls, and destructive actions form a coherent system with clear state cues.
- The five final2-authority matched frames retain the reference hierarchy and visual grammar while reflecting live fixture/auth data. The three older create/member/recruitment families visibly use the same current system and were not judged as pixel targets.
- Source inspection found a live React DOM/component implementation, shared shell, tokens, and reusable controls. The few raster assets are content/illustration assets (profile/companion/group artwork), not screenshots used to fake interactive pages.
- No tofu, missing glyphs, clipped baselines, blank panels, or illegible low-contrast primary text was observed beyond the three blockers above.

## Required recheck

After repair, directly reopen the three affected files and then perform the final complete-set freshness check: `matched/members-manage-1440x1120.png`, `my-groups-mobile-360.png`, and `signup-mobile-360.png`. Approval requires the matched shell to be intact and the two Korean phrases to wrap only at semantic boundaries.
