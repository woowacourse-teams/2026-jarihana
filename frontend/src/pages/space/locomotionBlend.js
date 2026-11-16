const DURATION = 180;
const weights = (mode) => ({ walking: Number(mode === "walking"), running: Number(mode === "running"), jumping: Number(mode === "jumping") });

export function createLocomotionBlend() {
  return { mode: null, phase: 0, lastTime: null, startedAt: 0, from: weights("idle"), current: weights("idle"), active: false };
}

export function sampleLocomotion(blend, mode, time, immediate = false) {
  if (blend.mode === null || immediate) {
    blend.mode = mode;
    blend.from = blend.current = weights(mode);
    blend.startedAt = time - DURATION;
  } else if (blend.mode !== mode) {
    blend.from = { ...blend.current };
    blend.mode = mode;
    blend.startedAt = time;
  }
  const elapsed = blend.lastTime === null ? 0 : Math.max(0, Math.min(50, time - blend.lastTime));
  const progress = Math.max(0, Math.min(1, (time - blend.startedAt) / DURATION));
  const alpha = progress * progress * (3 - 2 * progress);
  const target = weights(mode);
  const previousRate = blend.current.walking * 0.006 + blend.current.running * 0.009;
  blend.current = Object.fromEntries(Object.keys(target).map((key) => [key, blend.from[key] + (target[key] - blend.from[key]) * alpha]));
  const { walking, running, jumping } = blend.current;
  blend.phase += elapsed * (previousRate + walking * 0.006 + running * 0.009) / 2;
  blend.lastTime = time;
  blend.active = progress < 1 && Object.keys(target).some((key) => blend.from[key] !== target[key]);
  return { walking, running, jumping, phase: blend.phase, stride: Math.sin(blend.phase) * (walking + running), active: blend.active };
}
