# App-shell-router clone/design-system fidelity review

## Recommendation

**REQUEST_CHANGES** — visual QA verdict: **REVISE**.

## Scope and artifacts inspected

- Target: `.omo/evidence/figma/groups-438-2659.png` (1526 × 1009 RGBA).
- Fresh desktop actual: `.omo/evidence/visual-qa/groups-desktop-1440.png` (1440 × 1046 RGB), modified 2026-08-21 12:20:13; later than each reviewed source.
- Fresh mobile actual: `.omo/evidence/visual-qa/groups-mobile-360.png` (360 × 1262 RGB), modified 2026-08-21 12:20:12.
- Cross-route desktop actual: `.omo/evidence/visual-qa/signup-desktop-1440.png` (1440 × 1032 RGB), modified 2026-08-21 12:20:12.
- Source and complete new-file diffs inspected: `frontend/src/app/AppShell.jsx`, `frontend/src/app/AppShell.css`, and `frontend/src/shared/styles/tokens.css`.

The full-page content, cards, auth state, and data differ by instruction and were excluded from the judgment. PNG signatures and dimensions were valid; no raster/screenshot substitution exists in the reviewed shell implementation.

## Findings

### CRITICAL

None. The header is rendered by semantic React components (`header`, `nav`, `Link`, `NavLink`, and `button`), rather than by a screenshot, canvas, or CSS background image. See `frontend/src/app/AppShell.jsx:83`.

### HIGH

None. Shell color, spacing, type, dimensions, radii, and responsive breakpoints come from shared custom properties rather than per-instance hex/spacing declarations. See `frontend/src/app/AppShell.css:1` and `frontend/src/shared/styles/tokens.css:1`.

### MEDIUM

1. **[product] Desktop header vertical geometry does not match the Figma shell.** The Figma target places the 72px black header at approximately y=63, with the next content block about 24px below it. Both desktop captures place the equally tall header at y=32 and leave approximately 56px before the next content block. This reverses the intended visual relationship even though its 1360px width, radius, and horizontal centering match. The source is `margin: var(--space-8) auto 0` in `frontend/src/app/AppShell.css:183`; `--space-8` is 2rem/32px in `frontend/src/shared/styles/tokens.css:47`.

### LOW

1. **[code quality] The hamburger stroke geometry is the only shell micro-geometry bypassing the token system.** `20px`, `2px`, and the two translate offsets in `frontend/src/app/AppShell.css:139` are local literals. This does not falsify the design system, but a small icon-size/stroke token would keep the stated token discipline complete.

## Good, keep it

- The 1440px desktop captures show a 1360px-wide black header centered with 40px side insets, a 72px height, and rounded corners; those match the reference's scaled horizontal geometry.
- Desktop uses a true three-column grid for logo / centered navigation / trailing action (`frontend/src/app/AppShell.css:187`), so navigation remains centered independently of brand and action widths.
- At 360px the header becomes full bleed, preserves the 72px height, hides desktop navigation/action, and exposes a 44px menu control. See `frontend/src/app/AppShell.css:168`.
- The white shell canvas, black header, white/muted navigation, teal active rule/action, and focus skip link are token-driven. The relevant contrast combinations are comfortably above normal-text WCAG thresholds.
- Authentication variants and mobile drawer are real conditional component states (`frontend/src/app/AppShell.jsx:31`, `frontend/src/app/AppShell.jsx:113`), not visual stand-ins.

## Blockers before approval

- Align the desktop header’s top inset and the header-to-main vertical relationship to the Figma reference, then re-capture desktop groups and signup on the same revision. The requested scope does not require changing the page-owned body content.
