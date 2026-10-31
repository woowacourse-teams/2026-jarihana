# Capsule character atlas

`crew-coach-atlas.png` is a generated transparent image atlas derived from the existing
Jarihana signup crew/coach illustrations in `src/shared/assets/illustrations/`.
It preserves the gray sweater/backpack and black outfit/mint badge. The renderer uses
alpha-tested image planes (2.5D); tank, pipes, capsules and physics remain 3D.

Created with the built-in image generation tool on 2026-10-29. No runtime generation,
remote image request or additional asset service is required. Brand fidelity remains
subject to the owner's visual review; this is not an exact 3D reconstruction.

## Facing character poses

`character-duel-atlas.png` is a transparent 2×2 atlas generated on 2026-10-29
from `crew-coach-atlas.png` with the built-in image tool. Top row: crew; bottom
row: coach. Left column: protesting toward the right; right column: listening
with crossed arms toward the right. The opposing figure is mirrored in CSS.

The prompt preserves the original round white head, short black hair, gray
crew sweater/backpack/blue jeans and black coach outfit/mint lanyard. It asks
for a playful assertive expression, a forward palm gesture, an arms-crossed
reaction, consistent full-body framing and no chairs, capsules, weapons or
background. The service animates pose crossfades, short forward steps and
recoils; it does not use a rigged 3D character.

## Initial arena preview

`arena-preview-desktop.webp` (1440 × 998) and `arena-preview-mobile.webp`
(390 × 774) are canvas captures of the existing renderer on 2026-10-30.
They show an empty tank, hoses and composer characters without topic text,
votes or messages. The parent page displays them while initial data, character
textures, hose layout and the first WebGL frame are being prepared. They are
decorative loading previews, not vote data. Camera and material settings were
not changed to capture them.
