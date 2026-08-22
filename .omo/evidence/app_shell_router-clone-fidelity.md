# Clone / Design-System Fidelity Review — app_shell_router

## Recommendation

**APPROVE**

The current shared AppShell is a live, reused, token-driven implementation and its fresh desktop/mobile captures meet the specified common-shell fidelity contract.

## Review scope and evidence inspected

- Full new-file diffs: `frontend/src/app/AppShell.jsx`, `frontend/src/app/AppShell.css`, and `frontend/src/shared/styles/tokens.css`. The repository index does not track `frontend/`, so each was compared to `/dev/null` as its complete review diff.
- Shared-shell wiring: `frontend/src/app/AppRouter.jsx`.
- Design-system contract: `frontend/DESIGN.md`.
- Fresh actual captures, both modified `2026-08-21 12:28:27`, after `AppShell.jsx` and `AppShell.css` at `12:27:46`:
  - `.omo/evidence/visual-qa/groups-desktop-1440.png` — valid RGB PNG, 1440 × 1032.
  - `.omo/evidence/visual-qa/groups-mobile-360.png` — valid RGB PNG, 360 × 1234.
- Figma reference packet inspected directly:
  - `.omo/evidence/figma/groups-438-2659.png`
  - `.omo/evidence/figma/group-create-462-1337.png`
  - `.omo/evidence/figma/group-detail-438-2779.png`
  - `.omo/evidence/figma/group-edit-438-3012.png`
  - `.omo/evidence/figma/group-manage-438-3116.png`
- Independent visual/CJK oracle: **PASS** on the same current captures.

The desktop reference frames conflict on header Y position: the groups image is about y=63, while four frames are approximately y=0–4. The specified y=32 common-shell compromise was treated as accepted, not as a finding.

## Findings

### CRITICAL

None. `AppShell` is a live React component tree containing semantic `header`, `nav`, `Link`, `NavLink`, `button`, `Drawer`, and `main` elements; it is shared by the route tree in `frontend/src/app/AppRouter.jsx:82-86`. No shell image, canvas, or CSS `background-image` substitutes for live UI.

### HIGH

None. The shell’s contract-level colors, sizing, spacing, radius, borders, container, header height, and breakpoint behavior resolve through `frontend/src/shared/styles/tokens.css` and are consumed by `frontend/src/app/AppShell.css`.

### MEDIUM

None.

### LOW

None. The remaining local font weights/tracking and hamburger stroke geometry in `AppShell.css:45-46,68,106,142-153` are accepted intrinsic component details, not orphaned color/spacing/typography-scale tokens. The contract-level raw values formerly at issue (header 72px, shell 1360px, touch 44px, border 1px, active line 3px, and loading action width 108px) are shared tokens.

## Verified strengths

- The desktop actual has a 1360px black navigation bar inset 40px on each side of the 1440px white canvas, 72px tall with rounded corners. The y=32 position is the explicitly accepted cross-reference compromise.
- The authenticated desktop capture visibly has exactly three centered base links — `탐색`, `모임 만들기`, and `모임 관리` — with `마이페이지` separated into the right action group before `로그아웃`. Source keeps this anatomy: `HeaderLinks` renders only the three base links (`AppShell.jsx:9-27`), while `MyPageLink` is conditional in `.app-header__desktop-action` (`:109-112`).
- The wordmark is live Korean text and visibly reads `자리 하나?` (`AppShell.jsx:101-103`), with the question mark styled as a child span.
- The shell background uses `--color-surface`; desktop is inset and rounded at 48rem+, while the 360px capture proves the mobile black header is full-width with no desktop radius (`AppShell.css:171-203`). No header CJK clipping, tofu, or unnatural word breaking is visible.
- Principal shell color, size, spacing, radius, border, and container decisions consume shared tokens. Measured contrast is strong: white/black 21.00:1 and muted-header text (`#b8b8b8`)/black 10.59:1.

## Blockers before approval

None.
