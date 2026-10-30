// Keep each tail attached to its character and prefer the other side when it
// reduces overlap with speech bubbles already placed on the stage.
export function placeSpeechBubbles(bubbles, stageWidth) {
  const placed = [];
  return bubbles.map(({ headX, headY, width, height, direction }) => {
    const candidate = side => {
      const left = Math.max(8, Math.min(Math.max(8, stageWidth - width - 8),
        headX + (side < 0 ? 24 - width : -24)));
      const top = headY - height;
      const overlap = placed.reduce((total, box) => total
        + Math.max(0, Math.min(left + width, box.right) - Math.max(left, box.left))
        * Math.max(0, Math.min(headY, box.bottom) - Math.max(top, box.top)), 0);
      return { left, top, right: left + width, bottom: headY, overlap };
    };
    const preferred = candidate(direction);
    const opposite = candidate(-direction);
    const selected = opposite.overlap < preferred.overlap ? opposite : preferred;
    placed.push(selected);
    return { center: selected.left + width / 2,
      tail: Math.max(12, Math.min(width - 12, headX - selected.left)) };
  });
}
