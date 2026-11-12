const SCALE_STEP = 0.85;

export function createRoomFrameQuality() {
  let refreshInterval = 1000 / 60;
  let slowTime = 0;
  let smoothTime = 0;
  let scale = 1;

  return {
    get scale() { return scale; },
    setRefreshInterval(elapsed) { refreshInterval = elapsed; },
    sample(elapsed, minimumScale) {
      if (elapsed <= 0) return;
      if (elapsed > Math.max(24, refreshInterval * 1.35)) {
        // Count repeated missed frames, without letting one stall drive a downgrade.
        slowTime += Math.min(elapsed, 70);
        smoothTime = 0;
        if (slowTime >= 600) {
          scale = Math.max(minimumScale, scale * SCALE_STEP);
          slowTime = 0;
        }
      } else {
        slowTime = Math.max(0, slowTime - elapsed * 2);
        smoothTime = elapsed <= Math.max(20, refreshInterval * 1.15) ? smoothTime + elapsed : 0;
        if (smoothTime >= 2000) {
          scale = Math.min(1, scale / SCALE_STEP);
          smoothTime = 0;
        }
      }
    },
    reset() { slowTime = smoothTime = 0; scale = 1; }
  };
}
