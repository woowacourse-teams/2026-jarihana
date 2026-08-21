# Final pixel/reference compare

- recommendation: **REQUEST_CHANGES**
- originalIntent: Ship a complete backend-connected React frontend whose shared design system and AppShell derive from Figma `final2`; backend remains authoritative for data/actions/permissions, and unsupported upload/profile/direct-join behavior is not faked.
- desiredOutcome: Each supplied desktop capture preserves the reference's visual system, hierarchy, and target geometry while tolerating data/auth/header-state differences required by the backend and the common-shell instruction.
- userOutcomeReview: The implementation has a coherent shared token system and common AppShell, and it correctly avoids a fake image-upload control. However, four of five screens diverge across large structural regions, and the fifth (detail) still has a materially different hero/rail composition. These are layout/fidelity failures rather than acceptable backend-data differences.

## Blockers

### VIS-1 — Groups discovery geometry and card treatment do not match the reference

- violatedCriterion: Figma `final2` is visual authority for hierarchy and target geometry; implementation must derive a coherent shared design system rather than merely resemble it.
- evidencePointer: `visual-qa/diffs/groups.json` reports **56/100**, 680,028/1,539,734 differing pixels. Top hotspots include `(190,630,191x126)=1.0`, `(763,630,190x126)=0.9544`, and `(953,252,191x126)=0.92`.
- observation: In the reference crop, search is a bare icon and the three recommendation cards form a full-width row with illustrated dark image panels. The actual crop adds a prominent mint Search button, pushes results down, shows a single narrow card, and substitutes a flat pale placeholder image. The reference count/sort hierarchy is also absent/replaced.
- sourcePointer: `frontend/src/pages/groups/groups.css:61` (tool grid/search), `frontend/src/pages/groups/groups.css:146` (three-column grid), `frontend/src/shared/ui/Cards.jsx:41` (generic backend-image card). The stated three-column CSS cannot restore parity when only one item is rendered; the card visual grammar is also materially different from the reference.

### VIS-2 — My page replaces the reference's dense activity board with a different sparse dashboard composition

- violatedCriterion: Preserve Figma hierarchy, panels, target geometry, type ramp, spacing and visual grammar while connecting real backend data.
- evidencePointer: `visual-qa/diffs/my.json` reports **57/100**, 615,136/1,440,000 differing pixels; the central grid hotspots span `(360..1260,375..750)` at roughly 0.67–0.89 diff ratios.
- observation: The reference uses a bordered activity panel with compact two-column illustrated rows and an internal pagination footer. Actual uses large standalone outline cards in a mostly empty column, different section hierarchy, and far less information density. This is not caused by prohibited profile editing: the profile card correctly says read-only, but the primary activity surface is still a different design.
- sourcePointer: `frontend/src/pages/account/account.css:107` (270px dashboard split), `frontend/src/pages/account/account.css:161` (dashboard panel), `frontend/src/pages/account/account.css:170` (counts), and `frontend/src/pages/account/account.css:316` (generic two-column lists).

### VIS-3 — Group edit is a different form architecture from the reference

- violatedCriterion: Figma `final2` remains visual authority for the edit screen, except unsupported image upload must not be faked.
- evidencePointer: `visual-qa/diffs/group_manage_edit.json` reports **58/100**, 822,498/1,942,560 differing pixels. Hero hotspots are effectively total (`x=540..1080,y=168..505`, 0.988–1.0), and the main editor band at `y=674` is 0.902–0.953.
- observation: The reference is an in-place editable detail hero followed by a compact Markdown editor. Actual changes this to numbered section cards, a huge non-editable ring placeholder, a separate large description form, and later schedule panels. Removing the unsupported image-change button is correct, but it does not require replacing the reference illustration/hero geometry or editor hierarchy.
- sourcePointer: `frontend/src/pages/group-editor/GroupManagePage.jsx:218` and `:230` define the numbered editor architecture; `frontend/src/pages/group-editor/styles.css:57` and `:131` establish the large two-column card and 22.5rem image panel.

### VIS-4 — Applicant management is visually unrelated to the reference at page level

- violatedCriterion: Complete frontend must use the final2 management screen as visual authority for page hierarchy and target geometry, while backend controls available actions/data.
- evidencePointer: `visual-qa/diffs/manage_registrations.json` reports **19/100**, 1,170,535/1,440,000 differing pixels and all 64 grid regions as hotspots; multiple top regions are 1.0.
- observation: Reference uses a light-gray full-page operational dashboard, compact status pills, unboxed applicant rows, and a wide member panel. Actual uses a white canvas, a heading/stat card, a large bordered applicant card with select/filter toolbar, and stacked narrow side-rail cards. Different names/counts and backend-safe action labels are acceptable; the surface, density, grid, and hierarchy are not.
- sourcePointer: `frontend/src/pages/manage/ManageRegistrationsPage.jsx:100` through `:190` defines the alternative hierarchy; `frontend/src/pages/manage/manage.css:1`, `:59`, `:109`, `:281`, and `:285` encode white-canvas bordered panels and a 2fr/0.9fr rail rather than the reference dashboard.

### VIS-5 — Shared shell and hero sizing create systematic top-of-page drift

- violatedCriterion: Extract one common AppShell, but the shared result must still honor final2's visual proportions rather than reproduce contradictory frame states.
- evidencePointer: Header-row hotspots recur in every diff (for example Groups has 0.68–0.72 across most `y=0..126` cells; Detail/Edit have about 0.56–0.59 across much of `y=0..168`). Detail is the best pair at **73/100**, yet its hero center has 0.91–1.0 hotspots.
- observation: A common inset header is an allowed design decision, and auth text/state differences are non-blocking. The blocker is the systematic change in proportions: 72px inset shell plus 32px top gap compresses/offsets content, while detail's actual hero uses a much larger figure and narrower main/rail geometry than the reference. This shared drift compounds every route.
- sourcePointer: `frontend/src/app/AppShell.css:23`, `:31`, and `:182`; `frontend/src/shared/styles/tokens.css:72`–`:74`; `frontend/src/pages/groups/groups.css:193`–`:215`.

## Pair-by-pair evidence

| Pair | Exact dimensions | Similarity | Region conclusion |
|---|---:|---:|---|
| Groups | 1526x1009 | 56/100 | Hero artwork is close; search/result/card band is structurally different. |
| Group detail | 1440x1349 | 73/100 | Best match; major hero illustration/rail and shared-header drift remain. |
| My | 1440x1000 | 57/100 | Profile rail concept matches; activity panel composition does not. |
| Group edit | 1440x1349 | 58/100 | Mint/white palette matches; hero/editor architecture does not. |
| Manage registrations | 1440x1000 | 19/100 | Page-level background, density, panels and grid are different. |

## Checked artifacts

- References: `.omo/evidence/figma/groups-438-2659.png`, `group-detail-438-2779.png`, `my-438-2904.png`, `group-edit-438-3012.png`, `group-manage-438-3116.png`.
- Actuals: `.omo/evidence/visual-qa/matched/groups-1526x1009.png`, `group-detail-1440x1349.png`, `my-1440x1000.png`, `group-manage-edit-1440x1349.png`, `manage-registrations-1440x1000.png`.
- Diff metadata: all five JSON files in `.omo/evidence/visual-qa/diffs/`; dimensions matched and alpha was intact in every pair. Every JSON field and hotspot list was consumed; top hotspot coordinates are mapped above.
- Source/design: `frontend/DESIGN.md`, `frontend/src/app/AppShell.css`, `frontend/src/shared/styles/tokens.css`, `frontend/src/shared/ui/Cards.jsx`, and relevant Groups/Account/GroupEditor/Manage JSX/CSS.
- Direct inspection: full images plus matched crops for each pair (discovery/card band, detail hero/rail, my activity board, edit hero/editor, management applicant/rail).

## Anti-slop/programming pass

Direct review found no visual blocker caused by screenshot-pasting or per-screen cloned headers; the implementation genuinely uses shared tokens/components. No deletion-only or requested-removal tests are relevant to this pixel gate. There is some needless one-off visual divergence (generic cards/panels reused where the reference calls for specific shared visual variants), but it is reported only where it directly violates the visual-authority criterion above. Backend-safe omissions (image upload/profile editing/direct join) are not treated as failures.

## Evidence gaps / notes

- No blocker is based on auth-state text, live counts/names, missing unsupported upload/profile mutations, or a demand to clone inconsistent headers frame-by-frame.
- The supplied exact-size captures and JSON are sufficient to reject on visual fidelity. No additional visual threshold was stated, so the decision rests on region-level structural differences, not a numeric cutoff alone.
