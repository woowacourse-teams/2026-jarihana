# Shared App Shell Visual/CJK QA — Pass B2

## Scope

Read-only review of the shared header/shell only. Page content and data differences were excluded.

Actual captures inspected directly with `view_image`:

- `.omo/evidence/visual-qa/groups-desktop-1440.png` (1440×1046)
- `.omo/evidence/visual-qa/groups-mobile-360.png` (360×1262)
- `.omo/evidence/visual-qa/signup-desktop-1440.png` (1440×1032)

Reference captures inspected directly with `view_image`:

- `.omo/evidence/figma/groups-438-2659.png` (1526×1009)
- `.omo/evidence/figma/my-438-2904.png` (1440×1000)

Source inspected:

- `frontend/src/app/AppShell.jsx`
- `frontend/src/app/AppShell.css`
- `frontend/src/shared/styles/tokens.css`
- `frontend/DESIGN.md`

## Verdict

**VERDICT: REVISE**  
**CONFIDENCE: HIGH**

The responsive shell geometry, white canvas, contrast, and Korean rendering pass. Two shared-header fidelity differences remain against both references: the brand wordmark omits the reference space, and the desktop/member navigation adds a fourth `마이` item absent from both reference headers.

## Findings

1. **[product] [medium] Brand wordmark copy differs from both references.**
   - Actual, desktop and mobile: `자리하나?`
   - Both references: `자리 하나?`
   - Source: `frontend/src/app/AppShell.jsx:89-91`
   - Fix: render the reference wordmark spacing (`자리 하나?`) and update the accessible label consistently if exact header fidelity is required.

2. **[product] [medium] Shared desktop navigation contains an extra item.**
   - Actual desktop captures: `탐색 / 모임 만들기 / 모임 관리 / 마이`
   - Both references: `탐색 / 모임 만들기 / 모임 관리`
   - Source: `frontend/src/app/AppShell.jsx:9-14`
   - Effect: the nav remains mathematically centered, but its anatomy/width no longer matches the target shared header.
   - Fix: remove `마이` from the shared header navigation or obtain explicit acceptance for this deliberate product extension.

## Passing observations — keep these

- **White canvas:** `.app-shell` uses `--color-surface` (`#ffffff`), matching the requested white shell canvas.
- **Desktop geometry:** both 1440px actual captures visibly use a centered black header from x≈40 to x≈1400 (1360px), y≈32 to y≈104 (72px), with rounded corners. Source encodes `--container-shell: 85rem`, `--header-height: 4.5rem`, 32px desktop gutter/top margin, and `--radius-md`.
- **Centered nav / edge anchors:** `grid-template-columns: 1fr auto 1fr` places the nav in the true center column while the logo and auth action occupy opposite edges.
- **Responsive mobile shell:** the 360px capture has a full-width, square-cornered black header, 20px horizontal inset, and a visible 44×44 menu control; desktop nav/action are hidden below 48rem.
- **Korean/CJK rendering:** no clipped glyphs, tofu, baseline loss, or unnatural wrapping occurs inside the reviewed headers. All header labels stay on one line.
- **Contrast:** computed token contrast is 21.00:1 for white on black, 10.59:1 for muted nav text (`#b8b8b8`) on black, and 7.58:1 for ink (`#1d1d1f`) on mint (`#2ac1bc`). The transparent logout action also remains readable in the actual desktop capture.
- **Auth-state variants:** `로그아웃` and `가입 계속하기` differ from the anonymous reference action because the captures show different auth states; their placement and contrast satisfy the requested shell criteria and are not treated as blockers.

## Evidence matrix

| Criterion / scenario | Invocation | Binary observable | Captured artifact |
|---|---|---|---|
| 1440 groups shared shell | `view_image(groups-desktop-1440.png)` and direct comparison to both Figma references | Black 1360px inset rounded header on white canvas; centered nav; readable logo/action | `.omo/evidence/visual-qa/groups-desktop-1440.png` |
| 1440 signup shared shell | `view_image(signup-desktop-1440.png)` and direct comparison to both Figma references | Same shell geometry; centered nav; edge mint action with readable text | `.omo/evidence/visual-qa/signup-desktop-1440.png` |
| 360 responsive shell | `view_image(groups-mobile-360.png)` | Full-width black header, no desktop inset/radius, 44px menu control, unbroken Korean wordmark | `.omo/evidence/visual-qa/groups-mobile-360.png` |
| Reference anatomy | `view_image(groups-438-2659.png)` and `view_image(my-438-2904.png)` | Both references show `자리 하나?` and exactly three centered nav items | `.omo/evidence/figma/groups-438-2659.png`, `.omo/evidence/figma/my-438-2904.png` |
| Token/source integrity | `nl -ba AppShell.jsx`, `nl -ba AppShell.css`, `nl -ba tokens.css` | Token-driven 1360/72 geometry, grid centering, 48rem mobile breakpoint, and two source-level fidelity differences located | This report plus the source files listed above |
| Header contrast | Node WCAG relative-luminance calculation over shared token pairs | All three tested ratios are ≥ 4.5:1: 21.00, 10.59, 7.58 | This report, “Passing observations” |

## Blocking

- Align the visible brand wordmark copy with the reference (`자리 하나?`) or record explicit acceptance of the compressed form.
- Align shared nav anatomy with the three-item reference or record explicit acceptance of the additional `마이` destination.

