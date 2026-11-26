# Arena assets

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
