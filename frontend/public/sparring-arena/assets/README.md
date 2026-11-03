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

`arena-preview-planet-{day,sunset,night}-desktop.webp` (1440 × 998) and
`arena-preview-planet-{day,sunset,night}-mobile.webp` (390 × 774) are DOM
screenshots of the actual playground arena captured on 2026-11-03. They
show the white background, smooth mint yard, original trees, seesaw and pebbles,
empty tank, hoses and composer characters. The three period filenames share
the same image for each device size while the background direction is being
reviewed; there are no planets or craters.

They use empty fixture data and contain no personal information, topic text,
votes or messages. The parent page selects the current Seoul time period
using the arena's `playgroundPeriod` helper and displays the device-sized image
while initial data, character textures, hose layout and the first WebGL frame
are being prepared. These are decorative loading previews, not vote data.

## Seated capsule characters

`seated-characters.webp` is a transparent 1024 × 1024 atlas rendered from the
actual articulated characters and team-colored chairs in `walking-characters.js` and
`sparring-chairs.js`. Its four equal tiles show the crew on the left and coach
on the right, seated on mint chairs in the top row and coral chairs in the
bottom row. Character type and team color are selected independently. The tank uses this atlas to keep its capsule
characters consistent with the 3D chair characters without rendering a full
rig for every capsule.

To regenerate it, serve the frontend directory from the repository root:

```sh
python3 -m http.server 8000 --directory frontend
```

Open `http://localhost:8000/scripts/render-seated-characters.html`, click the
WebP download button, and replace
`frontend/public/sparring-arena/assets/seated-characters.webp` with the downloaded
file. The generator preserves the atlas camera, poses and lighting, uses
Neutral tone mapping with exposure 0.9, and exports WebP at quality 0.96.
Regenerate the atlas when the seated poses, character models or chairs change.
