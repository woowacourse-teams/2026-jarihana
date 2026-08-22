# Round 2 pixel/reference gate

## recommendation

**APPROVE**

## blockers

None.

## originalIntent

Ship the complete JavaScript/JSX + Webpack/Jest frontend using the five Figma `최종 디자인2` frames as visual authority, real backend contracts as the authority for data/actions/permissions, and one coherent shared `AppShell`. The older create/member/recruitment-management frames are functional coverage references only and must be expressed in the final2 visual system. Unsupported mutations must not be simulated.

## desiredOutcome

All five final2 routes retain their reference hierarchy, density, geometry, black/mint/white grammar, and reusable live DOM implementation after reconciling authenticated data and the common shell. The three draft-derived flows must be present and visibly belong to the same final2 system without being required to pixel-clone the drafts.

## userOutcomeReview

The fresh matched artifacts satisfy that outcome. Direct full-frame and centered 1100x620 crop inspection of all eight pairs shows the previous structural VIS-1..5 failures are resolved:

- Groups retains the split discovery hero, inline search/filter band, three-card grid, and reference card proportions. Its **50/100** score is dominated by authenticated shell state, real titles/counts, and two backend/image-fallback cards rather than a replacement layout.
- Group detail is the closest exact target at **82/100**. The mint information hero, illustration panel, right recruitment rail, tabs, and content hierarchy match. Remaining center-hero hotspots are data/asset geometry and the backend-owned recruitment state.
- My is **72/100** and now retains the final2 profile/companion left rail plus bordered activity dashboard, three summary counts, two-column activity cards, and paging. Live profile/avatar/data differences are allowed.
- Group edit is **64/100** and now uses the final2 mint two-column editable hero followed by a compact Markdown editor. The unsupported image mutation is explicitly non-actionable; later schedule controls are backend-owned functionality below the reference crop. This resolves the prior numbered-card replacement architecture.
- Manage registrations is **78/100**, improving from 19. It now matches the final2 gray operational canvas, horizontal management tabs, unboxed applicant rows, compact filters/actions, wide member rail, and recruitment-state card. Names, counts, status labels, and available actions correctly follow backend capability.
- The three draft pairs score 17/44/45, but direct inspection confirms coverage rather than pixel parity: create uses the final2 mint hero/form-panel grammar and safe default-image treatment; member management uses the common shell, tabs, status pills, and clean table; recruitment management uses the same page heading, summary tile, bordered form/list panels, and state badges. Their large diffs are expected redesigns from draft content/layout and do not violate the stated authority order.

The shared inset black shell is consistent across all eight actuals. Authenticated `마이페이지`/`로그아웃` replacing draft/Figma GitHub login is allowed. No missing unsupported upload, profile edit, member removal, or direct-join action was counted as a fidelity defect.

## Diff evidence consumed

Every field and every hotspot entry in all eight JSON files was consumed: `command`, `dimensionsMatch`, reference/actual width and height, `totalPixels`, `diffPixels`, `diffRatio`, `similarityScore`, `alphaChannelIntact`, every hotspot's grid coordinates/pixel rectangle/ratio, and `summary`. All report `image-diff`, exact matching dimensions, internally consistent pixel totals, intact alpha, and valid hotspot arrays.

| Pair | Dimensions | Diff pixels / ratio | Score | Hotspots | Disposition |
|---|---:|---:|---:|---:|---|
| groups | 1526x1009 | 763,732 / .4960 | 50 | 62 | final2 structure passes; top/header and card-image hotspots are allowed shell/data/assets |
| group detail | 1440x1349 | 351,601 / .1810 | 82 | 51 | passes; six >=.8 center-hero cells are allowed data/illustration variance |
| my | 1440x1000 | 402,387 / .2794 | 72 | 64 | passes; three >=.8 body cells reflect live card/profile content |
| group edit | 1440x1349 | 689,735 / .3551 | 64 | 57 | passes; hero/editor hotspots do not indicate the former architecture defect |
| registrations | 1440x1000 | 310,725 / .2158 | 78 | 63 | passes; sole >=.8 cell is lower member/rail content, not page hierarchy |
| create draft | 1440x1120 | 1,345,971 / .8346 | 17 | 64 | coverage-only; final2 redesign passes |
| member draft | 1440x1120 | 904,720 / .5610 | 44 | 64 | coverage-only; final2 redesign passes |
| recruitment draft | 1440x1120 | 884,528 / .5484 | 45 | 64 | coverage-only; final2 redesign passes |

## Checked artifact paths

- References: `.omo/evidence/figma/{groups-438-2659,group-detail-438-2779,my-438-2904,group-edit-438-3012,group-manage-438-3116,group-create-462-1337,member-manage-445-252,recruitment-manage-445-144}.png`
- Actuals: `.omo/evidence/visual-qa/matched/{groups-1526x1009,group-detail-1440x1349,my-1440x1000,group-manage-edit-1440x1349,manage-registrations-1440x1000,group-create-1440x1120,members-manage-1440x1120,recruitments-manage-1440x1120}.png`
- Objective diffs: all eight `.omo/evidence/visual-qa/diffs/*.json`
- Contract/source: `frontend/DESIGN.md`, `frontend/src/app`, `frontend/src/shared`, and relevant route JSX/CSS under `frontend/src/pages`
- Prior reports checked as untrusted context: `.omo/evidence/final-reviews/{pixel-compare,code-fidelity,visual-pass-a,visual-pass-b}.md`
- Inspection crops: `/tmp/jarihana-pixel.IPnMSW/*.png` (centered 1100x620 review derivatives only; originals remained unchanged)

## Anti-slop / programming review

Direct inspection found a real shared React/component system, not screenshot-sized raster substitution or per-route shell duplication. Referenced images are bounded illustration/profile assets; no production source points at evidence screenshots. No debug logging or TODO/FIXME residue was found in the reviewed production surface. Tests are not deletion-only or tautological visual-removal assertions; the screenshot suite is broad and uses observable rendered behavior. Large stylesheet/module size remains a maintenance note, but it does not violate the stated fidelity criteria and therefore is not a blocker. The older code-fidelity report applied the same screenshot-fake/token perspective but is stale on scores and draft coverage; this direct round supersedes it.

## Exact evidence gaps

- No numeric similarity threshold was specified; approval is based on direct structural comparison and the authority exceptions, not score alone.
- The captures prove settled static states, dimensions, alpha, and freshness relative to the supplied final verification. This pixel gate does not independently replay motion or mutations.
- Some hotspots cannot be attributed pixel-for-pixel to a single cause because live backend copy/assets differ from Figma fixtures. Direct paired crops show no remaining structural blocker in those regions.

