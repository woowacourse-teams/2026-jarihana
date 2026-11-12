const DURATION = 900;
const BITE_AT = 420;
const CONSUMABLES = new Set(["cookie", "coffee", "latte", "tea"]);
const smooth = (value) => value * value * (3 - 2 * value);

// Only a new authoritative consumption transition starts a gesture. Snapshots,
// layout replacement and moving an item to a surface must never replay a bite.
export function detectHeldConsumption(previous, next, memberId) {
  if (!previous || next.type !== "ROOM_STATE" || next.controlSeq <= previous.controlSeq ||
    next.roomEpoch !== previous.roomEpoch || next.connectionGeneration !== previous.connectionGeneration ||
    next.layoutRevision !== previous.layoutRevision) return null;
  const before = previous.participants.find((actor) => actor.memberId === memberId);
  const after = next.participants.find((actor) => actor.memberId === memberId);
  const item = previous.items.find((entry) => entry.id === before?.heldItemId);
  if (!after || !item || item.location !== "HELD" || !CONSUMABLES.has(item.kind)) return null;
  const current = next.items.find((entry) => entry.id === item.id);
  const reduced = after.heldItemId === item.id && current?.location === "HELD" && current.remaining < item.remaining;
  const lastBite = item.kind === "cookie" && !current && !after.heldItemId;
  if (!reduced && !lastBite) return null;
  return { item, remaining: current?.remaining ?? 0, startedAt: next.serverTime, lastBite };
}

export function consumptionFrame(consumption, now, reducedMotion = false) {
  const elapsed = consumption ? Math.max(0, now - consumption.startedAt) : DURATION;
  const active = !reducedMotion && elapsed < DURATION;
  const lift = !active ? 0 : elapsed < 350 ? smooth(elapsed / 350)
    : elapsed < 520 ? 1 : 1 - smooth((elapsed - 520) / (DURATION - 520));
  return { active, lift, bitten: elapsed >= BITE_AT,
    visible: active && !(consumption.lastBite && elapsed >= BITE_AT),
    remaining: consumption ? elapsed < BITE_AT ? consumption.item.remaining : consumption.remaining : 0 };
}
