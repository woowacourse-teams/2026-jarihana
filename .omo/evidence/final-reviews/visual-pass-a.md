# Visual QA Pass A — design-system and functional integrity

VERDICT: REVISE

CONFIDENCE: HIGH

## Summary

The production frontend is a genuine React/component implementation with a coherent shared token and primitive system, real API contracts, responsive layouts, and no screenshot-as-UI substitution. All 53 required PNGs were enumerated and directly opened. The final capture set is not certifiable because three required full-page route captures are visibly horizontally clipped/miscaptured even though equivalent route/matched captures demonstrate that the underlying UI can render correctly.

## Findings

1. [evidence] [capture integrity] [blocking] `.omo/evidence/visual-qa/root-desktop-1440.png` omits the left-side wordmark and clips the left edge of the hero/content, while `.omo/evidence/visual-qa/groups-desktop-1440.png` and `.omo/evidence/visual-qa/matched/groups-1526x1009.png` show the same `GroupsPage` route rendered intact. This makes the root desktop artifact unreliable rather than proving a stable product defect. Recapture after explicitly resetting/asserting `window.scrollX === 0` immediately before the screenshot.

2. [evidence] [capture integrity] [blocking] `.omo/evidence/visual-qa/my-registrations-desktop-1440.png` clips the AppShell wordmark and the left edge of the `MY APPLICATIONS`/`내 신청` heading. The corresponding mobile and tablet captures are intact. Recapture and assert the header brand and H1 bounding boxes are fully inside the viewport before writing the PNG.

3. [evidence] [capture integrity] [blocking] `.omo/evidence/visual-qa/registrations-manage-tablet-768.png` clips the AppShell brand, the management title (`신청 관리` appears truncated), and the left side of the applicant panel. The same route is intact at mobile, desktop, and in `.omo/evidence/visual-qa/matched/manage-registrations-1440x1000.png`. Recapture with horizontal-scroll position reset and add capture-time bounds assertions for the header brand, H1, and main panel.

4. [product] [design system] [pass] `frontend/src/shared/styles/tokens.css`, `frontend/src/shared/styles/ui.css`, `frontend/src/app/AppShell.jsx`, and `frontend/src/app/AppShell.css` establish reusable semantic colors, type/spacing/radius/touch/z/motion tokens, shared button/field/card/tab/overlay/state primitives, and one shared responsive AppShell. Page CSS consistently consumes those tokens.

5. [product] [real implementation] [pass] Source inspection found a live semantic DOM/component tree, not a pasted screenshot or route-sized background. Figma SVG/PNG assets are used only as illustrations/hero/profile artwork. UI content, fields, tabs, tables, dialogs, navigation, and responsive layout remain real DOM.

6. [product] [backend integrity] [pass] `frontend/src/shared/api/client.js` implements same-origin API calls, credentials, XSRF propagation, strict envelope/schema parsing, 204 handling, and bounded 401 refresh. Group, recruitment, member, and registration pages call production hooks/APIs; no production mock fixture or fallback-success dataset was found. Unsupported image upload, profile editing, member removal, and direct-join success actions are not exposed.

7. [product] [interaction/accessibility] [pass] `frontend/src/shared/ui/Overlay.jsx` implements focus entry/trap, Escape dismissal, scroll lock, and focus return; `frontend/src/shared/ui/Tabs.jsx` implements roving keyboard selection and semantic tab relationships. Motion is limited to interaction/state affordances and is disabled under reduced-motion.

8. [product] [anti-slop/programming] [note] Direct slop/overfit review found no screenshot fake, production fixture leakage, debug logging, deletion-only tests, or meaningless decorative animation in the inspected implementation. Several source/style modules exceed the anti-slop 250-pure-LOC guideline (`ui.css`, `groups.css`, `manage.css`, `account.css`, `GroupManagePage.jsx`, `GroupDetailPage.jsx`, `ManageRegistrationsPage.jsx`), but that is a maintainability note rather than a failure of the stated visual/function criteria. The route tests assert observable outcomes and API payloads; the screenshot matrix itself is broad, though its capture-time checks did not detect the three clipped artifacts.

## What is good

- The 360px layouts are consistently legible, single-column, and preserve touch targets without visible horizontal overflow.
- The 768px and 1440px layouts generally use the intended inset black AppShell, responsive grid changes, card anatomy, and mint/black visual language.
- The five matched captures preserve the Figma hierarchy while correctly reconciling the inconsistent Figma headers into one shared shell.
- Figma comparison PNGs and diff JSONs have matching dimensions and intact alpha; the lower similarity scores are substantially explained by intentional data/auth/content differences and the shared-shell decision, not by a raster fake.
- Management, editor, detail, account, error, signup, and showcase surfaces all exist and use one recognizable design language.

## Blocking

- Regenerate `root-desktop-1440.png` with a verified zero horizontal scroll and fully visible brand/content bounds.
- Regenerate `my-registrations-desktop-1440.png` with the full AppShell brand and heading visible.
- Regenerate `registrations-manage-tablet-768.png` with the full AppShell, title, and applicant panel visible.
- Re-run the complete capture manifest/freshness check after recapture; do not retain a PASS claim from the current three defective artifacts.

## Checked artifacts

- Contract/source: `frontend/DESIGN.md`, `frontend/docs/IMPLEMENTATION_MAP.md`, all files under `frontend/src`, `frontend/tests/e2e/app.spec.js`, `frontend/tests/e2e/api-fixture.js`, `frontend/playwright.config.js`.
- Verification/manifests: `.omo/evidence/e2e-fixture/final-verification.md`; all five `.omo/evidence/visual-qa/diffs/*.json`.
- References: `.omo/evidence/figma/groups-438-2659.png`, `group-detail-438-2779.png`, `my-438-2904.png`, `group-edit-438-3012.png`, `group-manage-438-3116.png`.
- Matched actuals: all five PNGs under `.omo/evidence/visual-qa/matched/`.
- Route matrix, every viewport opened: `root`, `groups`, `group-detail`, `recruitment-detail`, `oauth-callback`, `signup`, `my`, `my-groups`, `my-registrations`, `group-create`, `group-manage`, `members-manage`, `recruitments-manage`, `registrations-manage`, `not-found`, and `showcase`, each at `mobile-360`, `tablet-768`, and `desktop-1440` (48 PNGs total).

## Exact evidence gaps

- The manifest proves count, dimensions, and freshness, but it does not prove that content begins at horizontal scroll position zero or that critical regions are fully inside the capture viewport.
- No capture-time assertion checks `window.scrollX`, the AppShell brand bounding box, the route H1 bounding box, or the main panel bounding box immediately before `page.screenshot({ fullPage: true })`.
