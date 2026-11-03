const MARGIN = 8;
const GAP = 10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Place near the speaker when possible; use another row when the width is crowded.
export function placeSpeechBubbles(bubbles, stageWidth, obstacles = []) {
  const placed = [...obstacles];
  return bubbles.map(({ headX, headY, width, height, direction }) => {
    const maxLeft = Math.max(MARGIN, stageWidth - width - MARGIN);
    const preferred = clamp(headX + (direction < 0 ? 24 - width : -24), MARGIN, maxLeft);
    const candidates = [preferred, headX + (direction < 0 ? -24 : 24 - width),
      headX - width / 2, ...placed.flatMap(box => [box.left - width - GAP, box.right + GAP]),
      MARGIN, maxLeft].map(left => clamp(left, MARGIN, maxLeft));
    const choices = candidates.map(left => {
      let bottom = headY;
      for (let pass = 0; pass <= placed.length; pass++) {
        const collisions = placed.filter(box => left < box.right + GAP && left + width + GAP > box.left
          && bottom > box.top - GAP && bottom - height < box.bottom + GAP);
        if (!collisions.length) break;
        bottom = Math.min(...collisions.map(box => box.top - GAP));
      }
      const tailDistance = Math.abs(headX - left - clamp(headX - left, 12, Math.max(12, width - 12)));
      return { left, bottom, score: (headY - bottom) * 2 + Math.abs(left - preferred) * 0.15 + tailDistance };
    });
    const selected = choices.reduce((best, choice) => choice.score < best.score ? choice : best);
    const { left, bottom } = selected;
    const tailTip = clamp(headX, MARGIN, Math.max(MARGIN, stageWidth - MARGIN)) - left;
    const tail = clamp(tailTip, 12, Math.max(12, width - 12));
    placed.push({ left, right: left + width, top: bottom - height, bottom });
    return { center: left + width / 2, bottom, tail, tailTip, tailHeight: Math.max(10, headY - bottom + 10) };
  });
}
