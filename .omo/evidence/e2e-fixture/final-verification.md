# Final browser verification

Verified on 2026-08-21 Asia/Seoul against the final workspace source.

## Commands and binary observables

Working directory: `/Users/ohjonghyuk0717/Desktop/jarihana/frontend`

```text
npx prettier --check playwright.config.js scripts/e2e-preview.js tests/e2e/api-fixture.js tests/e2e/app.spec.js
```

Exit 0: all four owned files match Prettier formatting.

```text
npm run test:e2e -- --list
```

Exit 0: `Total: 66 tests in 1 file`.

```text
npm run test:e2e
```

Exit 0: `66 passed (1.1m)`. Playwright built the production bundle and served it from an isolated static preview at `http://127.0.0.1:4174`; `reuseExistingServer` was `false`. The run covered 48 route/viewport scenarios, 8 matched-size scenarios, and 10 interaction/error scenarios.

The post-full-run raster repair command was:

```text
npm run test:e2e -- --grep '(not-found renders at|signup renders at desktop-1440|recruitments-manage renders at desktop-1440|oauth-callback renders at mobile-360|my-registrations renders at desktop-1440|members-manage-1440x1120)'
```

Exit 0: `8 passed (14.3s)`, one Playwright worker. Every selected route test launches and closes its own Chromium browser; `members-manage-1440x1120` does the same. The isolated browsers use software rasterization (`--disable-gpu`) and the permanent PNG is the only screenshot call after the page/font/scroll preparation step.

Direct inspection found incomplete header raster layers in two outputs from the grouped repair run, so each was refreshed in its own preview/worker/browser process:

```text
npm run test:e2e -- --grep 'not-found renders at mobile-360'
npm run test:e2e -- --grep 'signup renders at desktop-1440'
```

Both commands exited 0 with `1 passed`; their final PNGs were opened again and contained the complete header, navigation/action, and body.

## Browser gates

- All 16 desktop route scenarios completed `@axe-core/playwright` scans with zero critical or serious violations.
- Every route asserted exactly one `main`, zero body/document horizontal overflow, `window.scrollX === 0`, no negative visible-element bounds, and intact brand/H1/main-panel horizontal bounds.
- Normal routes had zero browser console/page errors and zero unexpected API 4xx/5xx responses. Injected 403/404 console fetch errors were filtered only from the browser-error collector while unexpected-response assertions remained active.
- Anonymous continuation, signup continuation, discovery filters, registration create/withdraw, account focus fallback, group create/edit, leader transfer, recruitment close, registration decision, drawer focus trapping/restoration, and 403/404/network recovery all passed.

## Capture inventory and freshness

Exact verification commands counted 48 top-level route PNGs after excluding the three separately named `public-fidelity-*` review files, plus 8 matched PNGs. Searches for zero-byte files in both requested sets returned no output.

Latest product source mtime:

```text
1787286384 | Aug 21 13:26:24 2026 | frontend/src/pages/account/account.css
```

Oldest route and matched capture mtimes:

```text
1787286456 | Aug 21 13:27:36 2026 | .omo/evidence/visual-qa/root-mobile-360.png
1787286505 | Aug 21 13:28:25 2026 | .omo/evidence/visual-qa/matched/groups-1526x1009.png
```

The oldest requested capture is 72 seconds newer than the latest product source. All 56 requested files are non-empty and current. The separately requested members verification copy is not included in this count.

## Account CJK inspection

Both account-fix targets were opened directly from the refreshed route matrix:

- `my-groups-mobile-360.png`: the `세션` badge is intact with no mid-word break, and the session card body wraps only at valid CJK boundaries.
- `signup-mobile-360.png`: the heading is balanced across two lines and does not leave `주세요` alone on a third line.

| Artifact | Dimensions | Bytes | mtime epoch | SHA256 |
| --- | ---: | ---: | ---: | --- |
| `my-groups-mobile-360.png` | 360×1104 | 45063 | 1787286463 | `1be2d3ac5a7b535fe942cc0203413afab264c92a8b08a0b3cb7907ef41ef298d` |
| `signup-mobile-360.png` | 360×800 | 34823 | 1787286461 | `faa78f558fd1452dc196e3360ff35a1b02fb681611623a5dab2d0447d52a71e1` |

## Directly inspected raster-risk artifacts

All eight PNGs were opened directly after the isolated repair run. Each visibly contains the complete header and body without a black/blank surface, missing brand/navigation, clipping, or horizontal displacement. `sips` confirmed the expected dimensions.

| Artifact | Dimensions | Bytes | mtime epoch | SHA256 |
| --- | ---: | ---: | ---: | --- |
| `not-found-mobile-360.png` | 360×800 | 17135 | 1787286586 | `9e3c62666d72c33d71b506767226899d56c6bb09cc512d41ba78a9535102535e` |
| `not-found-tablet-768.png` | 768×1024 | 25419 | 1787286530 | `38bdd4f58b0527de5ffa63872afbea426fbf14a4aa135a9a2ee62ce1e25113ea` |
| `not-found-desktop-1440.png` | 1440×1000 | 28293 | 1787286535 | `21c58bd174540651b52ae99ef64f4c987445cf06f4f23e15e2c2005a50019801` |
| `signup-desktop-1440.png` | 1440×1000 | 48336 | 1787286598 | `63e2878d0b3ceac6912aba9ebb341188a20abd24a7e5d7a6bfb07f2917b61080` |
| `recruitments-manage-desktop-1440.png` | 1440×1000 | 79591 | 1787286534 | `cb958c63ac494d46efac584722edf21377d0a46b1aca2fc7ee9a936bc318bd46` |
| `matched/members-manage-1440x1120.png` | 1440×1120 | 75822 | 1787286536 | `8181082bddc7246cccbe618c09b4b2962f080129b9c5a22ffe5af43dff657b90` |
| `oauth-callback-mobile-360.png` | 360×2015 | 152733 | 1787286528 | `5ddacc7fb47a79398192a41de5534ce8b3263d4b288563abf49799357f092efb` |
| `my-registrations-desktop-1440.png` | 1440×1000 | 41959 | 1787286532 | `3db9965dcdeae466b73d8e86bdf923633d1ac6963c32de53e81154668a85da1e` |

## Unique-path members verification copy

The matched members artifact was copied byte-for-byte to a cache-independent path and opened directly from that unique path. It contains the complete header, five-row member table, controls, and body. `cmp -s` exited 0, and both SHA256 values are identical:

```text
8181082bddc7246cccbe618c09b4b2962f080129b9c5a22ffe5af43dff657b90  .omo/evidence/visual-qa/matched/members-manage-1440x1120.png
8181082bddc7246cccbe618c09b4b2962f080129b9c5a22ffe5af43dff657b90  .omo/evidence/final-reviews/artifacts/members-manage-current-1440x1120.png
```

Verification copy: 1440×1120, 75822 bytes, mtime epoch `1787286548`. It is deliberately excluded from the 56 requested route/matched count.

Artifact roots:

```text
/Users/ohjonghyuk0717/Desktop/jarihana/.omo/evidence/visual-qa/
/Users/ohjonghyuk0717/Desktop/jarihana/.omo/evidence/visual-qa/matched/
/Users/ohjonghyuk0717/Desktop/jarihana/.omo/evidence/final-reviews/artifacts/members-manage-current-1440x1120.png
```
