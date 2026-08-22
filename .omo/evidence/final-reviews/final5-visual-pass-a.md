# Final 5 visual QA — Pass A

## Verdict

**PASS** (high confidence)

## Scope and authority

I independently inspected the complete settled surface: all 48 canonical route captures (16 routes at 360, 768, and 1440), all 8 current matched captures, all 8 Figma references, all 8 diff JSONs, `frontend/DESIGN.md`, the shared shell/router, the account CJK styles, and the freshness/copy manifest. The five `최종 디자인 2` references (`groups`, `group-detail`, `my`, `group-edit`, `group-manage`) are fidelity targets. The three older draft references (`group-create`, `member-manage`, `recruitment-manage`) are context only.

## User-visible outcome review

The shipped surface is a complete React/DOM product UI, not a screenshot substitute. Across 360/768/1440 it consistently reflows from a full-bleed mobile header and one-column content to the inset common desktop AppShell and appropriate multi-column/table layouts. Every reviewed route has a complete header and body. I found no viewport overflow, clipped controls, tofu, orphaned Korean glyphs, mid-word Korean splitting, opaque/black compositor defects, or missing regions.

The five authoritative matched pages preserve the references' intended hierarchy and anatomy: archive/search/card discovery, two-column group detail, account profile/activity dashboard, editable mint group hero and form, and registration management with operations rail. Live product copy/assets account for pixel differences; the essential final2 black/mint/white system and page structures are present. The three context-only pages are complete, coherent extensions of the same system.

The direct full-size checks requested for risky artifacts passed:

- `01-not-found-mobile-360-current.png`: complete mobile AppShell, balanced Korean copy, intact card and action.
- `04-signup-desktop-1440-current.png`: complete signup header/form, honest read-only profile disclosure, no clipping or wrapping defect.
- `06-members-manage-1440x1120-current.png`: complete navigation, member summary and five-row table; no cached/stale layer artifact.
- Current `my-groups-mobile-360.png`: `내 모임`, tab labels, card titles and descriptions preserve Korean word boundaries with no orphan/tofu/overflow.
- Current `signup-mobile-360.png`: the two-line title breaks at phrase boundaries; explanatory and form copy remain intact and readable.

## Capture integrity and freshness

All 56 current PNGs have valid PNG signatures and plausible requested dimensions; alpha integrity is true in every stored matched diff. The latest rendered source is `frontend/src/pages/account/account.css` (13:26:24), while the canonical captures are later. The two final targeted CJK captures are 13:33:18. The three `public-fidelity-*` images older than source are not among the canonical 48-route + 8-matched review set and were not used for approval.

The eight unique risky copies under `.omo/evidence/final-reviews/artifacts/final-current/` were inspected from those exact paths. Their SHA-256 values reproduce `manifest.md`; the manifest records `cmp` exit 0 against each canonical source. This resolves the earlier path-keyed preview-cache concern.

## Diff evidence

All eight `.omo/evidence/visual-qa/diffs/*.json` files report matching dimensions and intact alpha. Scores/ratios are: groups 50/0.4960, group detail 82/0.1810, my 72/0.2794, group edit 64/0.3551, registrations 78/0.2158, group create 17/0.8346, member manage 44/0.5610, and recruitment manage 45/0.5484. These numbers are supporting evidence, not the verdict; direct inspection confirms that low scores on the three draft/context-only references do not represent failures against an authoritative target.

## Design-system, product-honesty, and slop pass

`AppRouter.jsx` wraps the route registry in one `AppShell`; `AppShell.jsx` supplies the shared semantic header, navigation, auth action, mobile drawer, skip link, and main landmark. `DESIGN.md`, `tokens.css`, shared primitives, and responsive page CSS encode a reusable system rather than page-specific pasted compositions. Production search found no canvas/drawImage/createImageBitmap/toDataURL, embedded data-image/base64 UI, evidence imports, or screenshot substitution. The PNG backgrounds found in production are bounded product illustrations, while text, forms, cards, tables, navigation, and layouts remain live DOM.

The account CJK rules are a focused layout correction (`word-break: keep-all`, `overflow-wrap: anywhere` fallback, balanced headings), not unnecessary parsing/normalization or an abstraction added to satisfy screenshots. No visual evidence or production structure suggests deletion-only, tautological, implementation-mirroring, or overfit screenshot behavior. Large existing CSS files are a maintenance note, not a failure of the stated visual criteria.

## Complete capture inventory checked

The 48 route captures comprise these route stems at each of `mobile-360`, `tablet-768`, and `desktop-1440`: `root`, `groups`, `group-detail`, `recruitment-detail`, `group-create`, `group-manage`, `members-manage`, `recruitments-manage`, `registrations-manage`, `my`, `my-groups`, `my-registrations`, `oauth-callback`, `signup`, `not-found`, and `showcase`.

The 8 matched captures checked are `groups-1526x1009`, `group-detail-1440x1349`, `my-1440x1000`, `group-manage-edit-1440x1349`, `manage-registrations-1440x1000`, `group-create-1440x1120`, `members-manage-1440x1120`, and `recruitments-manage-1440x1120`.

## Blockers

None.

## Notes / exact evidence gaps

- Static settled screenshots do not replay hover, focus, drawer, mutation, or animation timing. Those are outside this requested settled visual pass and are not used as blockers.
- No numeric similarity threshold was specified; structural fidelity and authority classification determine the verdict.
- The five final2 references are desktop-only, so 360/768 are judged against the documented responsive contract rather than exact pixel targets.

