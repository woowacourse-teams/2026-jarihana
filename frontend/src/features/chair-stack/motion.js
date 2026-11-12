export const AIM_LIMIT = 18;
export const SCALE = 100;

export function swayAt({ amplitude, periodMs }, elapsedMs) {
  const phase = Math.floor(elapsedMs) % periodMs;
  const distance = phase <= periodMs / 4
    ? phase
    : phase < (periodMs * 3) / 4
      ? periodMs / 2 - phase
      : phase - periodMs;
  const slope = Math.trunc(4 * distance * 1024 / periodMs);
  const eased = 3 * slope * 1024 ** 2 - slope ** 3;
  return Math.trunc(amplitude * eased / (2 * 1024 ** 3)) / SCALE;
}

export function clampAim(value) {
  return Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, Math.round(value)));
}
