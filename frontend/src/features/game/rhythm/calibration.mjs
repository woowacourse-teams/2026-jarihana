// window는 박 간격(60 / bpm)의 절반보다 작아야 한 입력이 한 박에만 대응한다.
export const SYNC_CONFIG = Object.freeze({
  bpm: 120,
  warmup: 4,
  beats: 20,
  window: 0.24,
  minSamples: 14,
  maxOffset: 150
});
const STORAGE_KEY = "haengseong-input-offset-v1";
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function readOffset(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    const number =
      value === null || value === undefined || value.trim() === "" ? NaN : Number(value);
    return Number.isInteger(number) && Math.abs(number) <= SYNC_CONFIG.maxOffset ? number : 0;
  } catch {
    return 0;
  }
}

export function writeOffset(storage, value) {
  if (!Number.isInteger(value) || Math.abs(value) > SYNC_CONFIG.maxOffset) return false;
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, String(value));
    return true;
  } catch {
    return false;
  }
}

export class CalibrationRun {
  constructor() {
    this.interval = 60 / SYNC_CONFIG.bpm;
    this.measureStart = SYNC_CONFIG.warmup * this.interval;
    this.endAt = (SYNC_CONFIG.warmup + SYNC_CONFIG.beats - 1) * this.interval + SYNC_CONFIG.window;
    this.samples = new Map();
    this.duplicates = 0;
    this.offbeat = 0;
  }

  tap(time) {
    if (
      !Number.isFinite(time) ||
      time < this.measureStart - SYNC_CONFIG.window ||
      time > this.endAt + 1e-8
    )
      return false;
    const index = Math.round(time / this.interval) - SYNC_CONFIG.warmup;
    if (index < 0 || index >= SYNC_CONFIG.beats) return false;
    const delta = time - (index + SYNC_CONFIG.warmup) * this.interval;
    if (Math.abs(delta) > SYNC_CONFIG.window + 1e-8) {
      this.offbeat++;
      return false;
    }
    if (this.samples.has(index)) {
      this.duplicates++;
      return false;
    }
    this.samples.set(index, delta * 1000);
    return true;
  }

  result() {
    const ordered = [...this.samples].sort((a, b) => a[0] - b[0]).map(([, delta]) => delta);
    if (ordered.length < SYNC_CONFIG.minSamples)
      return { reliable: false, reason: "few", used: ordered.length, total: SYNC_CONFIG.beats };
    const center = median(ordered);
    const deviation = median(ordered.map((value) => Math.abs(value - center)));
    const cutoff = Math.max(30, deviation * 1.4826 * 3);
    const kept = ordered.filter((value) => Math.abs(value - center) <= cutoff);
    const offset = Math.round(median(kept)) || 0;
    const spread = Math.round(median(kept.map((value) => Math.abs(value - offset))) * 1.4826);
    const half = Math.floor(kept.length / 2);
    const drift = Math.abs(median(kept.slice(0, half)) - median(kept.slice(-half)));
    const reliable =
      kept.length >= SYNC_CONFIG.minSamples &&
      kept.length >= ordered.length * 0.75 &&
      spread <= 35 &&
      drift <= 45 &&
      this.duplicates <= Math.max(3, ordered.length * 0.2) &&
      this.offbeat <= 3;
    const inRange = Math.abs(offset) <= SYNC_CONFIG.maxOffset;
    return {
      reliable: reliable && inRange,
      reason: !reliable ? "unstable" : !inRange ? "range" : "ok",
      offset,
      spread,
      used: kept.length,
      total: SYNC_CONFIG.beats,
      excluded: ordered.length - kept.length,
      duplicates: this.duplicates
    };
  }
}
