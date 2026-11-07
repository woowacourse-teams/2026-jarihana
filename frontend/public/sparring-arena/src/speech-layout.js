const MARGIN = 8;
const GAP = 10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Place near the speaker when possible; use another row when the width is crowded.
export function placeSpeechBubbles(bubbles, stageWidth, obstacles = [], { allowOverlap = false, stageHeight = 0 } = {}) {
  const placed = [...obstacles];
  return bubbles.map(({ headX, headY, width, height, direction, region }) => {
    const avoid = allowOverlap ? placed.filter(box => box.blocking) : placed;
    const minLeft = Math.max(MARGIN, region?.left ?? MARGIN);
    const maxLeft = Math.max(minLeft, Math.min(stageWidth - MARGIN, region?.right ?? stageWidth) - width);
    const preferred = clamp(headX + (direction < 0 ? 24 - width : -24), minLeft, maxLeft);
    const candidates = allowOverlap && !avoid.length ? [preferred] : [...new Set([preferred, headX + (direction < 0 ? -24 : 24 - width),
      headX - width / 2, ...avoid.flatMap(box => [box.left - width - GAP, box.right + GAP]),
      minLeft, maxLeft].map(left => clamp(left, minLeft, maxLeft)))];
    const maxBottom = stageHeight > 0 ? Math.max(height + MARGIN, stageHeight - MARGIN) : Infinity;
    const choices = candidates.flatMap(left => {
      const nearby = avoid.filter(box => left < box.right + GAP && left + width + GAP > box.left);
      let bottom = Math.max(height + MARGIN, headY);
      for (let pass = 0; pass <= nearby.length; pass++) {
        const collisions = nearby.filter(box => bottom > box.top - GAP && bottom - height < box.bottom + GAP);
        if (!collisions.length) break;
        const next = Math.max(height + MARGIN, Math.min(...collisions.map(box => box.top - GAP)));
        if (next === bottom) break;
        bottom = next;
      }
      // A full crowd can also use space below the heads instead of piling up at the top edge.
      const bottoms = (stageHeight > 0 && !allowOverlap) || nearby.some(box => box.blocking)
        ? [bottom, headY, height + MARGIN, ...(Number.isFinite(maxBottom) ? [maxBottom] : []),
          ...nearby.flatMap(box => [box.top - GAP, box.bottom + GAP + height])]
        : [bottom];
      return [...new Set(bottoms.map(value => clamp(value, height + MARGIN, maxBottom)))].map(bottom => {
        const tailDistance = Math.abs(headX - left - clamp(headX - left, 12, Math.max(12, width - 12)));
        let overlap = 0, blockingOverlap = 0;
        for (const box of nearby) {
          const area = Math.max(0, Math.min(left + width, box.right) - Math.max(left, box.left)) *
            Math.max(0, Math.min(bottom, box.bottom) - Math.max(bottom - height, box.top));
          overlap += area;
          if (box.blocking) blockingOverlap += area;
        }
        return { left, bottom, overlap, blockingOverlap,
          score: Math.abs(headY - bottom) * 2 + Math.abs(left - preferred) * 0.15 + tailDistance };
      });
    });
    const selected = choices.reduce((best, choice) => choice.blockingOverlap < best.blockingOverlap || choice.blockingOverlap === best.blockingOverlap &&
      (choice.overlap < best.overlap || choice.overlap === best.overlap && choice.score < best.score) ? choice : best);
    const { left, bottom } = selected;
    const tailTip = clamp(headX, MARGIN, Math.max(MARGIN, stageWidth - MARGIN)) - left;
    const tail = clamp(tailTip, 12, Math.max(12, width - 12));
    placed.push({ left, right: left + width, top: bottom - height, bottom });
    const tailAbove = bottom - height > headY;
    return { center: left + width / 2, bottom, tail, tailTip, tailAbove,
      tailHeight: Math.max(10, tailAbove ? bottom - height - headY - 10 : headY - bottom + 10) };
  });
}
