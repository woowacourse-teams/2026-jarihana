# Clone Fidelity Review — header full-bleed

## Recommendation

**APPROVE**

## Scope and success criteria

One route (`/groups`) was reviewed at three required viewport widths: 375px, 768px, and 1159px. The required outcome is a square-cornered black AppShell header that fills the full viewport width, while its wordmark, navigation, and actions remain on the same content rail as the page. The captures must not contain outer white gutters, a React Scan overlay, overflow, clipping, tofu, or incomplete compositor layers.

## Evidence inspected

- `frontend/src/app/AppShell.jsx:108-142` — semantic live `div`, `header`, `nav`, `Link`, and `button` tree; no header screenshot/raster substitute.
- `frontend/src/app/AppShell.css:23-40` — outer header uses `width: 100%`, `--color-nav`, and no radius; only `app-header__inner` has the container maximum, automatic centering, and page-gutter padding.
- `frontend/src/shared/styles/tokens.css:2-86` — the header's color, height, rail, spacing, typography, border, and z-index values are declared tokens.
- `frontend/DESIGN.md:15-19,81-83,97-105,109-112,184-190` — source design contract explicitly requires full-bleed black header background and shell/gutter-aligned inner content.
- `.omo/evidence/header-fullbleed/groups-mobile-375.png` — valid RGB PNG, 375x3781, capture mtime 2026-08-21 14:19:46 +0900.
- `.omo/evidence/header-fullbleed/groups-tablet-768.png` — valid RGB PNG, 768x2422, capture mtime 2026-08-21 14:19:46 +0900.
- `.omo/evidence/header-fullbleed/groups-desktop-1159.png` — valid RGB PNG, 1159x1699, capture mtime 2026-08-21 14:19:47 +0900.

All captures have the canonical PNG signature and postdate `AppShell.css` (14:13:12) and `DESIGN.md` (14:13:54), so the evidence is fresh for the reviewed source.

## Findings

### CRITICAL

None. The global header is a live semantic component tree, not a raster/screenshot or a `background-image` replacement.

### HIGH

None. The outer/header-inner split is token-driven and matches the documented design system: `--color-nav`, `--header-height`, `--container-shell`, and `--page-gutter` drive its surface and rail.

### MEDIUM

None. At each required width, the top 72px is black from viewport edge to viewport edge with square outer corners. The inner wordmark/action rails visually match the page rail: approximately 20px at 375px and 32px at 768px/1159px.

### LOW

None. No React Scan overlay, outer gutter, page-level horizontal overflow, clipped/tofu text, or partially composited regions were observed. The partially visible mobile filter pill is contained within the intentional scrollable filter control and does not affect the viewport or header.

## Independent QA passes

- Integrity pass: PASS, high confidence. It directly inspected all three captures, validated freshness/signatures/dimensions, and traced the DOM/CSS implementation.
- Visual pass: PASS, 0.98 confidence. It directly inspected all three captures for the required edge fill, rail alignment, CJK rendering, overlay absence, and compositor integrity.

## Blockers

None.
