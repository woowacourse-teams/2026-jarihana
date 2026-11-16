const EMPTY = Object.freeze({ participants: [], items: [], assets: {}, selfId: null });

export function createRoomStore({ now = Date.now } = {}) {
  let state = EMPTY;
  let status = Object.freeze({ status: "idle", error: null, layoutRevision: null });
  let clockOffset = 0;
  const listeners = new Set();
  const statusListeners = new Set();
  const samples = new Map();
  function setStatus(next, error = null) {
    const revision = state.layoutRevision ?? null;
    if (status.status === next && status.error === error && status.layoutRevision === revision) return;
    status = Object.freeze({ status: next, error, layoutRevision: revision });
    statusListeners.forEach((listener) => listener());
  }
  function notify() { listeners.forEach((listener) => listener(state)); }
  function sample(actor, serverTime) {
    const previous = samples.get(actor.memberId) ?? [];
    samples.set(actor.memberId, [...previous, { ...actor, serverTime }].slice(-4));
  }
  function apply(message) {
    const snapshot = message.type === "ROOM_SNAPSHOT";
    if (!snapshot && (message.roomEpoch !== state.roomEpoch || message.connectionGeneration !== state.connectionGeneration)) return "stale";
    if (!snapshot && message.layoutRevision < state.layoutRevision) return "stale";
    if (message.type === "MOVEMENT_FRAME") {
      if (message.controlSeq < state.controlSeq || message.frameSeq <= state.frameSeq) return "stale";
      if (message.controlSeq > state.controlSeq || message.layoutRevision !== state.layoutRevision) return "resync";
      const updates = new Map(message.participants.map((actor) => [actor.memberId, actor]));
      state = { ...state, type: message.type, frameSeq: message.frameSeq, serverTime: message.serverTime,
        participants: state.participants.map((actor) => updates.has(actor.memberId) ? { ...actor, ...updates.get(actor.memberId) } : actor) };
      state.participants.forEach((actor) => { if (updates.has(actor.memberId)) sample(actor, message.serverTime); });
    } else {
      if (!snapshot && message.controlSeq < state.controlSeq) return "stale";
      if (snapshot || message.layoutRevision !== state.layoutRevision) samples.clear();
      const members = new Set(message.participants.map((actor) => actor.memberId));
      for (const memberId of samples.keys()) if (!members.has(memberId)) samples.delete(memberId);
      state = message;
      state.participants.forEach((actor) => sample(actor, message.serverTime));
    }
    clockOffset = message.serverTime - now();
    setStatus("connected");
    notify();
    return "applied";
  }
  function interpolate(memberId, time = now()) {
    const history = samples.get(memberId);
    if (!history?.length) return null;
    const target = time + clockOffset - 100;
    const after = history.find((entry) => entry.serverTime >= target) ?? history.at(-1);
    const before = [...history].reverse().find((entry) => entry.serverTime <= target) ?? history[0];
    if (after === before || after.serverTime <= before.serverTime || after.seat || before.seat) return after;
    const alpha = Math.max(0, Math.min(1, (target - before.serverTime) / (after.serverTime - before.serverTime)));
    const deltaYaw = Math.atan2(Math.sin(after.yaw - before.yaw), Math.cos(after.yaw - before.yaw));
    return { ...after, yaw: before.yaw + deltaYaw * alpha,
      position: Object.fromEntries(["x", "y", "z"].map((axis) => [axis, before.position[axis] + (after.position[axis] - before.position[axis]) * alpha])) };
  }
  return {
    getState: () => state, getStatus: () => status, serverNow: () => now() + clockOffset,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeStatus(listener) { statusListeners.add(listener); return () => statusListeners.delete(listener); },
    setStatus, apply, interpolate, refresh: notify,
    clear(next = "idle") { state = EMPTY; samples.clear(); setStatus(next); notify(); }
  };
}
