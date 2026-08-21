# Management pages clone-fidelity review

**Recommendation: REQUEST_CHANGES**

Reviewed 2026-08-21. This is a read-only source and artifact audit; no code was
changed by this review.

## Scope and evidence inspected

- Target references:
  - `.omo/evidence/figma/group-manage-438-3116.png`
  - `.omo/evidence/figma/member-manage-445-252.png`
  - `.omo/evidence/figma/recruitment-manage-445-144.png`
- Design contract: `frontend/DESIGN.md:5-15`, `83-108`, `131-153`.
- Live React source:
  - `frontend/src/pages/manage/ManagementContext.jsx:4-59`
  - `frontend/src/pages/manage/ManageMembersPage.jsx:23-147`
  - `frontend/src/pages/manage/ManageRecruitmentsPage.jsx:23-235`
  - `frontend/src/pages/manage/ManageRegistrationsPage.jsx:35-225`
  - `frontend/src/pages/manage/manage.css:1-460`
- Route/guard preservation:
  - `frontend/src/app/routes.js:16-31`
  - `frontend/src/app/AppRouter.jsx:21-62`
  - `frontend/src/app/LeaderGuard.jsx:9-69`
- DOM/CSS contract and verification logs:
  - `frontend/tests/pages/manage/manage-pages.test.jsx:107-292`
  - `frontend/tests/pages/manage/manage-css.test.js:7-22`
  - `.omo/evidence/management-pages/figma-fidelity-tests.log` (14/14 pass)
  - `.omo/evidence/management-pages/figma-fidelity-lint.log` (no lint output)
  - `.omo/evidence/management-pages/manage-token-audit.log`
- Existing visual files:
  - `.omo/evidence/visual-qa/members-manage-{desktop-1440,mobile-360}.png`
  - `.omo/evidence/visual-qa/registrations-manage-{desktop-1440,mobile-360}.png`

## Confirmed strengths

- The UI is live React DOM, not a screenshot or raster substitute. The management
  surface is composed from `ManagementContext`, native `table`, `section`,
  `CursorList`, `Button`, `StatusBadge`, `ConfirmDialog`, and `Modal` primitives.
  No `background-image`/`url()` use was found under `src/pages/manage`.
- The shared `ManagementContext` establishes a real route-backed group H1, local
  navigation, and `aria-current` state (`ManagementContext.jsx:4-43`). The
  member table is semantic and has its own labelled panel
  (`ManageMembersPage.jsx:74-130`). The applicant list is similarly a labelled
  panel (`ManageRegistrationsPage.jsx:106-181`).
- Management styling now consumes semantic colour, spacing, type, border, radius,
  and touch-target tokens. In particular, repeated borders use `--border-thin`,
  minimum controls use `--touch-target`, and narrow text uses `word-break:
  keep-all` (`manage.css:1-7`, `9-64`, `116-189`, `218-228`, `349-460`).
- API calls, mutations, router IDs, and leader guarding remain route-backed and
  intact. The source audit found no removal or replacement of the leader routes
  and guards cited above. The focused DOM tests cover transfer, create lock,
  close, filtering, approval, rejection, safe errors, context nav, table, and
  applicant region.

## Findings

### CRITICAL

None found. No pasted screenshot/raster replacement, hardcoded hex palette, or
removed route/guard was found in the reviewed management code.

### HIGH

1. **Fresh post-change visual evidence is missing, so reference fidelity cannot
   be approved.** `ManagementContext.jsx` was modified at 12:19:54 and
   `manage.css` at 12:20:07, whereas all four inspected management screenshots
   are timestamped 12:17. Those old captures visibly show default blue,
   concatenated local links and the pre-change sparse/mobile table treatment.
   They therefore neither prove nor disprove the current source; they do prove
   that no current browser capture accompanies the fidelity claim. This is an
   evidence blocker, not a confirmed product-rendering defect. Re-run browser
   visual QA after the current assets are bundled, at 360/768/1440, and compare
   each management route to the three supplied Figma references.

### MEDIUM

1. **The route tabs do not preserve the target information order.** The final
   Figma screen orders the local controls as group edit, member management,
   application management, then recruitment settings. The implementation emits
   edit, member, recruitment, then conditionally application management
   (`ManagementContext.jsx:7-19`). On the registrations route this makes the
   active application tab last rather than third. This is a visible hierarchy
   deviation from the final reference; verify and align the route labels/order
   if the final Figma is the governing contract.

2. **The management context adds a persistent eyebrow absent from the supplied
   final reference.** `ManagementContext.jsx:23-25` inserts “모임장 관리” above
   the group H1. The reference begins directly with the group title beneath the
   global header. This may be intentional product copy, but it shifts the
   vertical rhythm and needs confirmation against a fresh render.

### LOW

1. A few content-specific geometry values remain raw (`manage.css:81`, `87`,
   `193`, `231`, `294`), such as `720px`, `160px`, and the column tracks. They
   are layout constraints rather than duplicate foundation tokens and are not a
   design-system blocker, but promoting repeated constraints to page-scoped
   custom properties would make future reference tuning easier.

## Blockers before approval

1. Supply fresh, post-12:20 browser screenshots (or equivalent reproducible
   capture evidence) for members, recruitments, and registrations at 360, 768,
   and 1440. The captures must demonstrate the applied nav styling/current
   state, table-to-card responsive conversion, and intact Korean words.
2. Resolve or explicitly accept the local tab ordering/label difference from
   the final group-management Figma reference.

## Conclusion

The code is a genuine, reusable, token-driven React implementation and the
previous structural blockers are resolved in source. However, the visual QA
artifacts predate the final CSS/context changes, and the tab hierarchy differs
from the final reference. For those reasons the fidelity gate remains
**REQUEST_CHANGES** until fresh capture evidence and the hierarchy decision are
provided.

## Re-review addendum (2026-08-21, source-level product findings only)

**Result: PASS for the prior source-level product findings.** The overall
recommendation remains **REQUEST_CHANGES** exclusively because fresh integration
browser evidence is still absent.

- The extra eyebrow has been removed: `ManagementContext.jsx:22-25` now starts
  the group context directly with its H1.
- The registrations route now emits exactly the final-reference sequence
  “모임 수정, 멤버 관리, 신청 관리, 모집 설정”
  (`ManagementContext.jsx:7-20`), with `aria-current="page"` applied by the
  shared link rendering at `27-38`.
- The member route correctly omits the recruitment-specific application tab,
  retaining “모임 수정, 멤버 관리, 모집 설정”.
- The DOM contracts directly assert the registration order/current state
  (`manage-pages.test.jsx:275-289`) and the member order plus absence of
  “모임장 관리” (`119-137`). The current focused run is recorded at
  `.omo/evidence/management-pages/figma-fidelity-tests.log` and passed 14/14.

No source-level product blocker remains from the two previous MEDIUM findings.
Fresh 360/768/1440 browser captures remain an integration-owned evidence gap;
they are required to change the overall fidelity recommendation, but are not a
new source defect.
