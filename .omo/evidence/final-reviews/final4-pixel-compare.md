# Final 4 pixel/structure gate

## recommendation

**APPROVE**

## blockers

None.

## originalIntent

Ship a real React frontend whose five `최종 디자인2` frames are the visual targets, while the three older draft frames remain coverage/context only. Preserve the final2 black/mint/white visual system, complete routes, real backend/auth content, and live DOM behavior. The last account CJK source change must preserve Korean word boundaries and balanced headings without regressing desktop fidelity.

## desiredOutcome

All eight current matched captures are complete and correctly paired. The five authoritative pairs retain the target hierarchy and geometry; the three context-only routes remain complete final2-system pages. The account `keep-all` / `balance` change does not introduce desktop wrapping, clipping, overflow, or layout movement. Production contains no screenshot/canvas/data-URI substitution.

## userOutcomeReview

APPROVE. I directly opened all 16 full-size PNGs and all 16 centered 1100x620 crops. The five authoritative pairs preserve their target structure:

- `groups`: archive hero, illustration, search/filter row, and three-card grid remain intact.
- `group_detail`: mint two-column hero, recruitment rail, tabs, and content column remain intact.
- `my`: profile/companion rail, bordered dashboard, three summary counts, two-column activity cards, and pagination remain intact. The new CJK declarations do not change desktop line count, panel width, card height, or label alignment.
- `group_manage_edit`: editable mint hero and Markdown panel remain intact; the additional backend-supported schedule surface continues below the target crop.
- `manage_registrations`: gray management canvas, tabs, applicant rows, member rail, and recruitment status panel remain intact.

The `group_create`, `member_manage`, and `recruitment_manage` pairs are draft/context-only. Their actuals are complete, coherent final2-system pages; their intentionally low pixel similarity is not a fidelity failure against the stated authority model.

The last account source edit is fresh in the captures: `AccountLayout.jsx` is 13:26:04 and `account.css` is 13:26:24; every matched capture is later (13:28:25–13:28:56). The desktop account target capture (`my`) is 13:28:26. Source inspection confirms `account-heading__title` applies `text-wrap: balance` plus `word-break: keep-all`, account prose/cards use `word-break: keep-all` with `overflow-wrap: anywhere` as the unbreakable-token fallback, and dashboard labels remain non-breaking. The current `my` full image and crop show no clipped or newly wrapped Korean text and no desktop fidelity regression.

## diff and hotspot evidence

Every top-level field and every hotspot object in all eight JSON files was inspected. All commands are `image-diff`; dimensions match; reference and actual sizes match; `totalPixels` equals width x height; diff counts and ratios are bounded; alpha integrity is true; and all hotspot grid indices, rectangles, bounds, and ratios are valid.

Although the stored JSON files have 13:04 timestamps, I reran the bundled visual-QA image-diff command directly against every current 13:28 matched PNG. Every recomputed top-level value, summary, hotspot count, and hotspot sequence is identical to the stored JSON, so the current captures are quantitatively covered rather than inferred from stale results.

| Pair | Authority | Dimensions | Score / ratio | Hotspots | Result |
|---|---|---:|---:|---:|---|
| groups | final2 target | 1526x1009 | 50 / 0.4960 | 62 | pass |
| group detail | final2 target | 1440x1349 | 82 / 0.1810 | 51 | pass |
| my | final2 target | 1440x1000 | 72 / 0.2794 | 64 | pass; current account CJK source produces the same diff |
| group edit | final2 target | 1440x1349 | 64 / 0.3551 | 57 | pass |
| registrations | final2 target | 1440x1000 | 78 / 0.2158 | 63 | pass |
| group create | context only | 1440x1120 | 17 / 0.8346 | 64 | pass as complete redesign |
| member manage | context only | 1440x1120 | 44 / 0.5610 | 64 | pass as complete redesign |
| recruitment manage | context only | 1440x1120 | 45 / 0.5484 | 64 | pass as complete redesign |

The current recomputation exactly matching the pre-change JSON is especially strong evidence that the `keep-all` / `balance` source change caused zero pixel movement in the authoritative desktop `my` capture.

## anti-fakery, programming, and slop pass

Production under `frontend/src` was scanned for canvas rendering, `drawImage`, `createImageBitmap`, `toDataURL`, embedded `data:image` / base64 UI, screenshot/evidence imports, and reference-frame substitution. None exists. The bounded PNG/SVG references are product illustrations or card artwork; they do not replace live text, controls, cards, tables, or layout. All reviewed pages are React/DOM implementations using shared CSS/tokens.

The CJK change is a focused style correction, not an unnecessary abstraction or normalization layer. The associated CSS tests assert observable layout contracts rather than deletion, prose removal, or implementation-generated expected values. No screenshot-only test or removal-only/tautological test is being used to justify approval. Existing large CSS/modules are a maintenance note, not a failure of the stated visual criteria.

## checked artifact paths

- References: `.omo/evidence/figma/{groups-438-2659,group-detail-438-2779,my-438-2904,group-edit-438-3012,group-manage-438-3116,group-create-462-1337,member-manage-445-252,recruitment-manage-445-144}.png`
- Actuals: `.omo/evidence/visual-qa/matched/{groups-1526x1009,group-detail-1440x1349,my-1440x1000,group-manage-edit-1440x1349,manage-registrations-1440x1000,group-create-1440x1120,members-manage-1440x1120,recruitments-manage-1440x1120}.png`
- Direct crops: `/tmp/jarihana-final4-crops/*.png` (16 PNGs, each 1100x620)
- Stored diffs: every file in `.omo/evidence/visual-qa/diffs/*.json`
- Fresh direct diff recomputation: bundled `visual-qa.mjs image-diff` run against all eight current pairs during this gate
- Account source: `frontend/src/pages/account/{account.css,AccountLayout.jsx,AccountCards.jsx,MyPage.jsx}`
- Supporting evidence consulted as untrusted context: `.omo/evidence/account-pages/verification.md`, `.omo/evidence/final-reviews/final3-pixel-compare.md`

## exactEvidenceGaps

- No numeric similarity threshold was specified. Approval rests on direct structural inspection and the explicit five-target/three-context authority split, not score alone.
- The stored diff JSON timestamps predate the last account edit, but direct recomputation against every current matched image produced identical full JSON content; there is no remaining quantitative gap.
- This gate verifies settled static captures and source structure. It does not replay motion or mutations, which were not part of the requested last-change desktop regression check.
- Live backend/auth data and product assets differ from static reference copy/assets, so not every changed pixel can be attributed to a single factor. Direct full-frame/crop inspection found no target-structure failure in those regions.
