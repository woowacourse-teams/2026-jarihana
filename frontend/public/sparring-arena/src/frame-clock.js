const FRAME_MS = 1000 / 120;
const EARLY_TOLERANCE_MS = 0.5;

// Keep a stable deadline rather than restarting the interval after a late frame.
export function createFrameClock() {
  let previous = 0, due = 0;
  return {
    reset(now) { previous = now - FRAME_MS; due = now; },
    take(now) {
      if (now + EARLY_TOLERANCE_MS < due) return 0;
      const delta = Math.min(Math.max(0, now - previous) / 1000, 0.05);
      previous = now;
      due += Math.max(1, Math.floor((now - due + EARLY_TOLERANCE_MS) / FRAME_MS) + 1) * FRAME_MS;
      return delta;
    },
  };
}
