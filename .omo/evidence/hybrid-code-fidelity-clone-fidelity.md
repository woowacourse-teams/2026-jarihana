# Hybrid group-management clone fidelity review

**Recommendation: REQUEST_CHANGES**

## Review scope

- Goal: verify the group create/edit and leader-management UI is a reusable live React implementation, follows the old `최종 디자인` Figma drafts, and exposes only backend-supported actions.
- Governing reference/evidence index: `.omo/evidence/figma/final-design2-compare/verification.md`.
- Figma images inspected: `.omo/evidence/figma/group-create-462-1337.png`, `.omo/evidence/figma/final-design2-compare/old-edit-394-2460.png`, `.omo/evidence/figma/recruitment-manage-445-144.png`, `.omo/evidence/figma/member-manage-445-252.png`, and `.omo/evidence/figma/final-design2-compare/old-manage-applicants-399-1435.png`.
- Rendered captures inspected: `.omo/evidence/visual-qa/hybrid-final/{group-create,group-edit,recruitment-manage,members-manage,registrations-manage}-1440x1120.png` and `.omo/evidence/visual-qa/{members-manage,recruitments-manage,registrations-manage}-mobile-360.png`.
- Source inspected: `frontend/src/pages/group-editor/**`, `frontend/src/pages/manage/**`, the group/member/recruitment/registration APIs and hooks, `frontend/src/shared/styles/{tokens,ui}.css`, shared UI primitives, router guards, contracts, and focused tests.

## Confirmed

- **Real component tree.** The screens are composed from React forms, semantic sections/tables/lists, `Button`, `ConfirmDialog`, `Modal`, `StatusBadge`, `CursorList`, field primitives, and query hooks. There is no canvas, iframe, `dangerouslySetInnerHTML`, CSS `url()`/`background-image`, or Figma/raster screenshot import in the reviewed group-editor/manage source. The bundled Figma assets are not imported by this UI.
- **Tokens and reuse.** Colour, type, spacing, radii, borders, touch targets, and motion are supplied through `frontend/src/shared/styles/tokens.css:1-81` and consumed in `frontend/src/shared/styles/ui.css`, `frontend/src/pages/group-editor/styles.css`, and `frontend/src/pages/manage/manage.css`. No raw hexadecimal/RGB colour or raw pixel design scale exists in the reviewed UI CSS. Page-local geometry aliases are scoped CSS variables, not duplicated palettes.
- **Server-owned representative image.** Create/edit use `/images/default-group.png` or `representativeImageUrl` only (`NewGroupPage.jsx:198-206`, `RepresentativeImage.jsx:1-13`); the backend owns the same `images/default-group.png` fallback (`GroupQueryService.java:32`, `GroupCommandService.java:38`). There is no fake upload UI.
- **Mutation contract fidelity.** The frontend maps to the actual controllers: group create/PUT and schedule PUT/DELETE (`group/api.js:31-72`; `GroupCommandController.java:41-117`); recruitment POST and `CLOSED` PATCH only (`recruitment/api.js:30-43`; `RecruitmentCommandController.java:30-59`); leader transfer only (`member/api.js:24-29`; `GroupMemberCommandController.java:24-34`); and registration `APPROVED`/`REJECTED` decisions (`registration/api.js:47-52`; `RegistrationCommandController.java:56-70`). No expulsion, recruitment edit/reopen, or image-upload mutation is exposed.
- **Structure and accessibility.** The management context is route-backed with `aria-current` (`ManagementContext.jsx:5-46`); members use a semantic table with labelled responsive cards (`ManageMembersPage.jsx:114-170`, `manage.css:797-854`); registrations use a labelled applicant region and operational aside (`ManageRegistrationsPage.jsx:105-192`, `239-296`); controls have visible labels/confirmations and dialogs provide focus trapping (`shared/ui/Fields.jsx:10-125`, `shared/ui/Overlay.jsx:53-139`). The inspected 360px captures show single-column layouts without horizontal clipping.

## Findings

### CRITICAL

None. The implementation is not a pasted visual, a raster substitute, or an unsupported-action mock.

### HIGH

1. **Management visual evidence is stale relative to the final CSS, so final Figma fidelity is not verifiable.** `frontend/src/pages/manage/manage.css` has modification time `2026-08-21 15:35:11`, after the inspected hybrid desktop captures at `15:31:03`–`15:31:05` and after the recruitment/registration 360px captures at `15:34:37`–`15:34:38`. These captures cannot prove the final stylesheet at desktop or tablet, and only the members mobile capture (`15:35:46`) postdates it. This is an evidence-integrity blocker for the required visual-fidelity gate, not a claim that the current DOM is fake.

### MEDIUM

1. **The group-edit draft's compact back action is absent from the live page despite a contrary verification claim.** The Figma edit reference shows a `← 모임 관리로` action. `GroupManagePage.jsx:256-427` renders the management context and editor but no back control; the only associated selector is dead CSS at `styles.css:121-132`. `.omo/evidence/group-editor-verification.md:109-111` says the page was rebuilt with a “compact back action,” which source does not support. Either restore an equivalent accessible navigation affordance or explicitly record the intentional reference deviation.

### LOW

1. **A few component dimensions remain local literals rather than named geometry tokens** (`group-editor/styles.css:288-297`, `395-401`; `manage.css:116`, `349`, `401`). They do not introduce colour/type/spacing slop, but naming the repeated image and preview dimensions would make reference tuning more traceable.

## Blockers before approval

1. Produce fresh, reproducible browser captures from the final management CSS at 360px, 768px, and 1440px for recruitments, members, and registrations; include the source/build identity or timestamps proving the final stylesheet was loaded.
2. Resolve or explicitly accept the missing group-edit back navigation and correct the unsupported “compact back action” verification statement.

## Conclusion

The code itself is a real, reusable, token-driven React design system and correctly constrains UI actions to live backend contracts. Approval is withheld solely because the final management visual surface lacks trustworthy post-CSS evidence, plus the documented group-edit back-action mismatch. No CRITICAL implementation-faking issue was found.

## Re-audit addendum (2026-08-21 15:41 KST)

The group-edit navigation issue is resolved. `frontend/src/pages/group-editor/GroupManagePage.jsx:256-261` now renders a real React Router `Link` to `/my/groups?role=LEADER`, and `frontend/src/pages/group-editor/styles.css:121-135` makes it a token-styled inline link. I directly inspected the regenerated desktop `.omo/evidence/visual-qa/matched/group-manage-edit-1440x1349.png` (15:41:22) and mobile `.omo/evidence/visual-qa/group-manage-mobile-360.png` (15:41:21); both visibly contain the `←모임 관리로` affordance and retain the live editable form layout.

The refreshed management desktop evidence is also valid: the matched recruitment, member, and registration captures at 15:39:36–15:39:38 all postdate `manage.css` at 15:35:11, as do the three mobile captures at 15:35:46 and 15:39:32–15:39:34. I directly opened each; the surfaces are complete live layouts with the expected desktop and mobile component structure.

**Remaining HIGH evidence blocker:** the only management 768px captures are still `.omo/evidence/visual-qa/{members-manage,recruitments-manage,registrations-manage}-tablet-768.png` timestamped 13:28:02–13:28:04, before the final `manage.css` update. No newer 768px capture or pass artifact with a path was supplied or found. Since the stated fidelity verification expressly covers 360/768/1440 and the final stylesheet could affect all breakpoints, the final responsive fidelity gate remains **REQUEST_CHANGES** until the three tablet captures are regenerated from the current source and directly cited.

## Final re-audit (2026-08-21 15:43 KST)

**Recommendation: APPROVE. This verdict supersedes the earlier REQUEST_CHANGES recommendations.**

The five current-source tablet captures are all newer than the final relevant styles: `group-create-tablet-768.png` (15:43:12), `group-manage-tablet-768.png` (15:43:13), `members-manage-tablet-768.png` (15:43:14), `recruitments-manage-tablet-768.png` (15:43:15), and `registrations-manage-tablet-768.png` (15:43:16). They postdate `manage.css` (15:35:11) and the group-editor back-link JSX/CSS (15:40:48).

I directly opened all five. They have intact shared headers and local navigation; tablet form, table, rail, and list structures are fully composited; Korean text stays whole and legible; and neither horizontal clipping nor missing layers appears. Together with the current 360px management captures and matched 1440px captures inspected in the re-audit, this completes the requested responsive visual evidence. The group-edit back link is visible at both 768px and 1440px.

### Final severity disposition

- **CRITICAL:** none.
- **HIGH:** none; the stale-capture blocker is cleared.
- **MEDIUM:** none; the back-navigation mismatch is resolved by the live `Link`.
- **LOW:** local geometry literals noted above remain a maintainability observation only and do not undermine the token-driven colour/type/spacing system or the rendered target fidelity.
