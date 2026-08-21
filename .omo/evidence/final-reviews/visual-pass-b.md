# Final Visual QA Pass B — visual fidelity and Korean/CJK precision

VERDICT: REVISE

CONFIDENCE: HIGH

## Original intent and desired outcome

Deliver the complete React application from the Figma `final2` language while honoring real backend DTOs/actions, one shared `AppShell`, JavaScript/JSX + Webpack + Jest, and no fake production data/actions. The rendered result must remain coherent at 360/768/1440 and must not contain clipping, overflow, tofu, or unnatural Korean word/particle/ending splits.

## Evidence checked directly

- All 48 route-matrix PNGs under `.omo/evidence/visual-qa/` (16 named routes × mobile/tablet/desktop), excluding the three separately named `public-fidelity-*` captures.
- All five matched-size actual captures under `.omo/evidence/visual-qa/matched/`.
- All five Figma references: `groups-438-2659.png`, `group-detail-438-2779.png`, `my-438-2904.png`, `group-edit-438-3012.png`, `group-manage-438-3116.png`.
- Every field in all five diff JSON files under `.omo/evidence/visual-qa/diffs/`.
- `.omo/evidence/e2e-fixture/final-verification.md`, `frontend/DESIGN.md`, `frontend/docs/IMPLEMENTATION_MAP.md`, and relevant JSX/CSS under `frontend/src`.

Capture integrity is good: the verification record proves 53/53 non-empty requested captures, exact matched dimensions, and all requested captures newer than the final relevant source edit. All five diffs report `dimensionsMatch: true` and `alphaChannelIntact: true`.

## Findings

1. `[product] [Korean/CJK] [blocking]` At 360 px, the `운영하는 모임` count label is split inside the Korean word as `운영하는 모` / `임`. It appears in both `my-mobile-360.png` and `oauth-callback-mobile-360.png` (the callback settles onto the same authenticated page). This violates the explicit no-unnatural-Korean-split requirement. Cause: `.dashboard-counts` fixes three equal narrow columns while `.dashboard-counts a` has no `word-break: keep-all`; the responsive rule changes flex direction but preserves the narrow three-column grid. Evidence: captures at the top of the `내 모임` panel; `frontend/src/pages/account/account.css:170-194, 376-381`; `frontend/src/pages/account/MyPage.jsx:74-87`.

2. `[product] [Korean/CJK showcase coverage] [blocking]` The required long-Korean-copy showcase visibly reproduces multiple intra-word/ending or orphan splits at 360 px: the first card title ends `스터` / `디`, the forbidden-state title ends `없어` / `요`, and multiple state descriptions leave short endings on isolated lines. The showcase exists specifically to validate long Korean copy (`frontend/DESIGN.md`, primitive inventory), so this is not merely cosmetic developer copy. Cause: shared card/state title styles do not apply `word-break: keep-all`/suitable wrapping constraints in the narrow auto-fit grid. Evidence: `.omo/evidence/visual-qa/showcase-mobile-360.png`; `frontend/src/shared/styles/ui.css:556-590, 661-705`; `frontend/src/shared/ui/Cards.jsx:43-64`.

3. `[product] [responsive action wrapping] [non-blocking note]` At 768 px, compact management action controls become awkward circular/stacked text (`20번 / 모집 / 마감하기` and `하나 / 승인`), even though they remain in bounds and functional. Prefer a column/card reflow before compressing action labels to 2–3 lines. Evidence: `recruitments-manage-tablet-768.png` and `registrations-manage-tablet-768.png`. This is a quality note; the clear blocking criterion is already established by findings 1–2.

4. `[evidence] [fidelity hotspot interpretation] [note]` Diff scores are groups 56, group detail 73, my 57, group edit 58, and manage registrations 19. The highest regions correspond mainly to accepted real-data/auth/common-shell differences: actual authenticated navigation versus Figma GitHub login, one fixture-backed group versus three mock cards, absent unsupported upload/profile/member-removal features, and actual API-oriented management panels. Those score deltas alone do not block. Dimensions and alpha are exact. The actual still consistently uses the final2 black/mint/white language, rounded bordered surfaces, typography hierarchy, and one AppShell across all routes.

## Evidence trace — material hotspots to cause

| Surface / hotspot | Objective evidence | Direct visual observation | Cause / disposition |
|---|---|---|---|
| Groups, central/lower grid; 56 score, 0.4417 ratio, 63 regions | `diffs/groups.json`; several 1.0 cells | Actual has one real fixture card with API image fallback while Figma has three illustrative mock cards; search/filter mechanics also differ | Backend data/DTO and no-fake-data policy; accepted, not a fidelity blocker |
| Group detail, hero center/top; 73 score, 0.2664 ratio, 51 regions | `diffs/group_detail.json`; max 1.0 around hero | Actual DTO copy, fallback illustration, recruitment CTA and unified authenticated shell differ; hierarchy and responsive rail behavior remain coherent | API/auth/common-shell reconciliation; accepted |
| My page, body grids; 57 score, 0.4272 ratio, 64 regions | `diffs/my.json`; strongest body cells 0.888/0.8695 | Actual real profile/avatar and summary cards replace Figma mock card list; desktop structure remains profile + activity split | Real API data accepted; mobile count-label split is separately blocking |
| Group edit, hero/forms; 58 score, 0.4234 ratio, 57 regions | `diffs/group_manage_edit.json`; hero/form cells up to 1.0 | Unsupported image upload/extra controls are absent and real editable fields are used | Backend precedence accepted; final2 component grammar retained |
| Manage registrations, nearly whole frame; 19 score, 0.8129 ratio, 64 regions | `diffs/manage_registrations.json`; many 1.0 cells | Actual frame uses one real recruitment/applicant operations layout rather than Figma's dense mock applicant/member dashboard | API/action precedence explains content/layout delta; not blocked solely by score |
| Mobile account counts | `my-mobile-360.png`, `oauth-callback-mobile-360.png` | `운영하는 모임` splits within `모임` | Missing Korean-safe wrapping in fixed 3-column count grid; blocking |
| Mobile showcase cards/states | `showcase-mobile-360.png` | `스터디` and `없어요` split inside words/endings | Missing Korean-safe wrapping on shared title surfaces; blocking |

## Anti-slop / programming perspective

Direct pass over the visual implementation found no screenshot-as-UI substitution, fake production success data, or route-by-route cloned shell. Tokens/primitives and the single `AppShell` are real and reused. No new test-only or production extraction is proposed by this review. The blocking fixes should remain small CSS/layout changes; adding screenshot-string tests or deletion-only tests would create false confidence and is not recommended.

## Blocking

- Fix Korean-safe wrapping for `.dashboard-counts` at 360 px so `모임` and similar semantic units never split mid-word; recapture at least `/my` and `/oauth/callback` at 360, then include them in a fresh complete final set.
- Fix the shared card/state long-Korean wrapping exposed by `/__showcase` at 360 px; recapture the 360 showcase and rerun the complete final visual gate.

