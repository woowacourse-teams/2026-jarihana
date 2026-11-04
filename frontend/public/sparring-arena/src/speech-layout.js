const MARGIN = 8;
const GAP = 10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Place near the speaker when possible; use another row when the width is crowded.
export function placeSpeechBubbles(bubbles, stageWidth, obstacles = []) {
  const placed = [...obstacles];
  return bubbles.map(({ headX, headY, width, height, direction, region }) => {
    const minLeft = Math.max(MARGIN, region?.left ?? MARGIN);
    const maxLeft = Math.max(minLeft, Math.min(stageWidth - MARGIN, region?.right ?? stageWidth) - width);
    const preferred = clamp(headX + (direction < 0 ? 24 - width : -24), minLeft, maxLeft);
    const candidates = [preferred, headX + (direction < 0 ? -24 : 24 - width),
      headX - width / 2, ...placed.flatMap(box => [box.left - width - GAP, box.right + GAP]),
      minLeft, maxLeft].map(left => clamp(left, minLeft, maxLeft));
    const choices = candidates.map(left => {
      let bottom = Math.max(height + MARGIN, headY);
      for (let pass = 0; pass <= placed.length; pass++) {
        const collisions = placed.filter(box => left < box.right + GAP && left + width + GAP > box.left
          && bottom > box.top - GAP && bottom - height < box.bottom + GAP);
        if (!collisions.length) break;
        const next = Math.max(height + MARGIN, Math.min(...collisions.map(box => box.top - GAP)));
        if (next === bottom) break;
        bottom = next;
      }
      const tailDistance = Math.abs(headX - left - clamp(headX - left, 12, Math.max(12, width - 12)));
      const overlap = placed.reduce((area, box) => area +
        Math.max(0, Math.min(left + width, box.right) - Math.max(left, box.left)) *
        Math.max(0, Math.min(bottom, box.bottom) - Math.max(bottom - height, box.top)), 0);
      return { left, bottom, score: overlap + Math.abs(headY - bottom) * 2 + Math.abs(left - preferred) * 0.15 + tailDistance };
    });
    const selected = choices.reduce((best, choice) => choice.score < best.score ? choice : best);
    const { left, bottom } = selected;
    const tailTip = clamp(headX, MARGIN, Math.max(MARGIN, stageWidth - MARGIN)) - left;
    const tail = clamp(tailTip, 12, Math.max(12, width - 12));
    placed.push({ left, right: left + width, top: bottom - height, bottom });
    return { center: left + width / 2, bottom, tail, tailTip, tailHeight: Math.max(10, headY - bottom + 10) };
  });
}
