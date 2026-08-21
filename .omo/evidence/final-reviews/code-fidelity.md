# Clone / design-system fidelity review

## Recommendation

**REQUEST_CHANGES**

The implementation is a live React UI with a meaningful reusable component layer, not a screenshot substitute. However, its own same-size comparison artifacts show substantial, systematic divergence from all five Figma-matched target frames (similarity 19–73/100). That fails the requested visual-fidelity gate. The evidence also does not directly compare three supplied reference families, so the whole surface cannot be approved as reference-faithful.

## Scope and evidence inspected

- Goal and constraints supplied to this review: shared React/Webpack JavaScript/JSX design system; Figma `final2` is the visual contract; backend controls content/behavior; no fake screen/image UI.
- Design contract: `frontend/DESIGN.md`; `frontend/docs/IMPLEMENTATION_MAP.md`.
- Component and route system: `frontend/src/app/AppRouter.jsx`, `frontend/src/app/AppShell.jsx`, `frontend/src/shared/ui/*.jsx`, all route page modules and their CSS under `frontend/src/pages/`.
- Figma references: `.omo/evidence/figma/groups-438-2659.png`, `group-detail-438-2779.png`, `my-438-2904.png`, `group-edit-438-3012.png`, `group-manage-438-3116.png`, plus the supplied create/member/recruitment reference files.
- Actual captures: 48-route matrix and five matched captures in `.omo/evidence/visual-qa/`; mobile captures reviewed for `/groups` and registration management.
- Measured diffs: `.omo/evidence/visual-qa/diffs/*.json`.
- Browser/test claim inspected but treated as supporting, not dispositive: `.omo/evidence/e2e-fixture/final-verification.md`.

## Findings

### CRITICAL

None.

The app is not a pasted screenshot: `AppRouter` mounts route components inside one live `AppShell` ([`frontend/src/app/AppRouter.jsx:83`](../../../frontend/src/app/AppRouter.jsx:83)); cards, fields, overlays, tabs, states, buttons, and toast are actual reusable React primitives. The assets in `src/shared/assets/figma/` inspected for the hero and detail decoration are small vector illustrations, not page screenshots. Their use in [groups CSS lines 42–53](../../../frontend/src/pages/groups/groups.css:42) and [lines 242–289](../../../frontend/src/pages/groups/groups.css:242) is legitimate Figma-art reuse.

### HIGH

1. **Measured visual fidelity is materially below the reference across every directly matched desktop frame.** The five captures have correct dimensions and intact alpha, but their similarity scores are 73 (group detail), 58 (group-manage edit), 56 (groups), 19 (manage registrations), and 57 (my). Corresponding diff ratios are 0.2664, 0.4234, 0.4417, 0.8129, and 0.4272. This is not isolated copy/data variance: the reviewed pairs show different page density, canvas treatment, profile/card anatomy, and content/rail geometry. In particular, the management-registration pair has an 81.29% differing-pixel ratio and 19/100 similarity. Evidence: [`group_detail.json`](../visual-qa/diffs/group_detail.json), [`group_manage_edit.json`](../visual-qa/diffs/group_manage_edit.json), [`groups.json`](../visual-qa/diffs/groups.json), [`manage_registrations.json`](../visual-qa/diffs/manage_registrations.json), [`my.json`](../visual-qa/diffs/my.json), and the matching PNGs under [`visual-qa/matched`](../visual-qa/matched/).

   The code confirms that these are deliberate alternate compositions rather than a minor tuning issue: the management route uses a new `ManagementPageHeading` plus card/operations-rail composition ([`frontend/src/pages/manage/ManageRegistrationsPage.jsx:100`](../../../frontend/src/pages/manage/ManageRegistrationsPage.jsx:100), [`frontend/src/pages/manage/ManageRegistrationsPage.jsx:237`](../../../frontend/src/pages/manage/ManageRegistrationsPage.jsx:237)), while the reference’s desktop hierarchy is materially different. Backend-controlled row count/copy is excluded from this finding; the failing assessment is layout and visual grammar.

### MEDIUM

1. **The system is only partly token-driven for geometry.** Color and most text/spacing rules correctly use `tokens.css`, but a rigorously token-driven system would not scatter unaliased component dimensions through route CSS. Examples include `248px` hero height and `88px` filter minimum ([`frontend/src/pages/groups/groups.css:42`](../../../frontend/src/pages/groups/groups.css:42), [`frontend/src/pages/groups/groups.css:109`](../../../frontend/src/pages/groups/groups.css:109)); profile image and feature-panel dimensions ([`frontend/src/pages/account/account.css:125`](../../../frontend/src/pages/account/account.css:125), [`frontend/src/pages/account/account.css:156`](../../../frontend/src/pages/account/account.css:156)); and management widths/column tracks ([`frontend/src/pages/manage/manage.css:74`](../../../frontend/src/pages/manage/manage.css:74), [`frontend/src/pages/manage/manage.css:186`](../../../frontend/src/pages/manage/manage.css:186)). These may be valid page-specific geometry, but they bypass the stated design-token scale and prevent systematic adjustment to Figma measurements.

2. **Direct Figma comparison coverage is incomplete.** There are five matched/diffed captures, whereas supplied reference families also include group creation, recruitment management, and member management. Route screenshots exist, but no same-size counterparts or diff JSON establish their fidelity to [`group-create-462-1337.png`](../figma/group-create-462-1337.png), [`recruitment-manage-445-144.png`](../figma/recruitment-manage-445-144.png), or [`member-manage-445-252.png`](../figma/member-manage-445-252.png). The 48 route captures prove rendering/responsiveness, not reference fidelity for those frames.

### LOW

1. `ShowcasePage` includes a one-off inline skeleton height ([`frontend/src/pages/ShowcasePage.jsx:220`](../../../frontend/src/pages/ShowcasePage.jsx:220)). It is a private showcase route rather than production UI, but it is inconsistent with the otherwise token-based primitive styling.

## What is sound and should remain

- One shared app shell, route registry, guards, and lazy route construction: [`frontend/src/app/AppShell.jsx`](../../../frontend/src/app/AppShell.jsx), [`frontend/src/app/AppRouter.jsx`](../../../frontend/src/app/AppRouter.jsx), [`frontend/src/app/routes.js`](../../../frontend/src/app/routes.js).
- Reused primitives cover the core grammar: buttons, field frames, cards, overlays/dialogs/drawer, state views, tabs, toast, and page layout under [`frontend/src/shared/ui`](../../../frontend/src/shared/ui).
- Colors and typography are centralized in [`frontend/src/shared/styles/tokens.css`](../../../frontend/src/shared/styles/tokens.css); no raw CSS color literal was found outside that token source.
- Mobile captures demonstrate live responsive reflow rather than a fixed desktop image. The reviewed `/groups` and registration-management mobile captures have meaningful single-column/mobile-nav layouts.
- Browser verification records concrete artifact paths and a passing 63-scenario run, so there is no misleading success assertion without evidence paths.

## Blockers before approval

1. Rework the matching route-family layouts until fresh same-size Figma comparisons show close visual fidelity for all five current matched targets, prioritizing management registrations, groups, management edit, and my page.
2. Produce fresh paired captures and diff artifacts for every remaining supplied Figma reference family (group create, recruitment manage, member manage), then review their rendered hierarchy against the reference.
3. Move recurring route-level dimensions that encode the design scale into named semantic/layout tokens, retaining direct dimensions only where the asset or responsive algorithm genuinely requires them.
