const DURATION = 320;

export function createCupLift() {
  return { from: 0, to: 0, until: 0 };
}

function amountAt(lift, now) {
  const t = Math.max(0, Math.min(1, 1 - (lift.until - now) / DURATION));
  return lift.from + (lift.to - lift.from) * t * t * (3 - 2 * t);
}

export function cupLiftAmount(lift, raised, now, immediate = false) {
  const target = Number(raised);
  if (immediate) {
    lift.from = target;
    lift.to = target;
    lift.until = now;
  } else if (target !== lift.to) {
    lift.from = amountAt(lift, now);
    lift.to = target;
    lift.until = now + DURATION;
  }
  return amountAt(lift, now);
}

export function isCup(kind) {
  return ["cup", "coffee", "latte", "tea"].includes(kind);
}
