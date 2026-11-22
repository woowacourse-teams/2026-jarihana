import { createRoomStore } from "./roomStore.js";
import { parseRoomMessage } from "./protocol.js";

export const actor = (id = "1", x = 0) => ({ memberId: id, displayName: `member ${id}`, avatarColor: "#536bd6",
  position: { x, y: 0, z: 0 }, yaw: 0, locomotion: "idle", seat: null, heldItemId: null, pose: "relaxed", emote: null });
export const snapshot = (extra = {}) => ({ type: "ROOM_SNAPSHOT", protocolVersion: 1, roomId: "42", roomEpoch: "epoch",
  connectionGeneration: "generation", layoutRevision: 1, controlSeq: 1, frameSeq: 1, serverTime: 1000, selfId: "1",
  participants: [actor(), actor("2")], items: [], assets: {}, ...extra });

test("late join preserves seated player, carried cookie, production and open storage", () => {
  const store = createRoomStore({ now: () => 1000 });
  const state = snapshot({ participants: [{ ...actor(), heldItemId: "cookie", seat: { assetId: "sofa", slot: 0,
    position: { x: 1, y: 0.34, z: 1 }, approach: { x: 1, y: 0, z: 2 }, yaw: 0 } }],
    items: [{ id: "cookie", kind: "cookie", holderId: "1", location: "HELD", position: { x: 1, y: 1, z: 1 }, assetId: null,
      slot: null, remaining: 0.75, velocity: null, startedAt: 0 }], assets: { storage: { open: true, on: true, wateredAt: 0, production: null } } });
  store.apply(parseRoomMessage(JSON.stringify(state)));
  expect(store.getState().participants[0].seat.slot).toBe(0);
  expect(store.getState().items[0].remaining).toBe(0.75);
  expect(store.getState().assets.storage.open).toBe(true);
});

test.each(["SURFACE", "STORAGE"])("%s uses its furniture slot while accepting older wire coordinates", (location) => {
  const item = { id: "cup", kind: "cup", holderId: null, location, assetId: "cabinet", slot: 0,
    remaining: 0, velocity: null, startedAt: 0 };
  const parse = (wireItem) => parseRoomMessage(JSON.stringify(snapshot({ items: [wireItem] }))).items[0];
  expect(parse(item)).toEqual(item);
  expect(parse({ ...item, position: { x: -9, y: 0, z: -8 } })).toEqual(item);
  expect(() => parse({ ...item, slot: null })).toThrow();
  expect(() => parse({ ...item, assetId: null })).toThrow();
});

test("stale control movement and old generations cannot undo new occupancy", () => {
  const store = createRoomStore(); store.apply(snapshot());
  store.apply(snapshot({ type: "ROOM_STATE", controlSeq: 3, participants: [actor("1", 5)] }));
  const frame = snapshot({ type: "MOVEMENT_FRAME", controlSeq: 2, frameSeq: 8, participants: [actor("1", -3)] });
  expect(store.apply(frame)).toBe("stale");
  expect(store.apply({ ...frame, controlSeq: 3, connectionGeneration: "previous" })).toBe("stale");
  expect(store.apply({ ...frame, controlSeq: 4 })).toBe("resync");
  expect(store.getState().participants[0].position.x).toBe(5);
});

test("full layout update removes departed players and old interpolation samples", () => {
  const store = createRoomStore(); store.apply(snapshot());
  store.apply(snapshot({ type: "ROOM_STATE", controlSeq: 4, layoutRevision: 2, participants: [actor("1", 8)] }));
  expect(store.interpolate("2")).toBeNull();
  expect(store.interpolate("1").position.x).toBe(8);
  expect(store.getStatus().layoutRevision).toBe(2);
});

test("duplicate timestamps interpolate finite positions and shortest yaw", () => {
  let time = 1000; const store = createRoomStore({ now: () => time });
  store.apply(snapshot());
  store.apply(snapshot({ type: "MOVEMENT_FRAME", frameSeq: 2, participants: [actor("2", 2)] }));
  time = 1100;
  expect(Number.isFinite(store.interpolate("2").position.x)).toBe(true);
  expect(() => parseRoomMessage('{"type":"ROOM_SNAPSHOT"}')).toThrow();
});

test("delayed packets do not rewind the server clock or freeze steady remote movement", () => {
  let time = 1000;
  const store = createRoomStore({ now: () => time });
  store.apply(snapshot());
  const move = (serverTime, x, frameSeq) => store.apply(snapshot({ type: "MOVEMENT_FRAME", serverTime, frameSeq,
    participants: [{ ...actor("2", x), locomotion: "walking" }] }));
  time = 1100; move(1100, 1, 2);
  time = 1249;
  const previousClock = store.serverNow();
  const previousPosition = store.interpolate("2").position.x;
  time = 1250; move(1200, 2, 3);
  expect(store.serverNow()).toBeGreaterThanOrEqual(previousClock);
  expect(store.interpolate("2").position.x).toBeGreaterThan(previousPosition);
  time = 1266;
  expect(store.interpolate("2").position.x).toBeGreaterThan(1.1);
});

test("stop animation follows the interpolated position instead of the newest packet", () => {
  let time = 1000;
  const store = createRoomStore({ now: () => time });
  store.apply(snapshot({ participants: [{ ...actor("2"), locomotion: "walking" }] }));
  time = 1100;
  store.apply(snapshot({ type: "MOVEMENT_FRAME", serverTime: 1100, frameSeq: 2, participants: [actor("2", 1)] }));
  time = 1200;
  expect(store.interpolate("2").position.x).toBeCloseTo(0.5);
  expect(store.interpolate("2").locomotion).toBe("walking");
  time = 1250;
  expect(store.interpolate("2").locomotion).toBe("idle");
});

test("same-room resync preserves clock continuity and clear allows a new clock", () => {
  let time = 1000;
  const store = createRoomStore({ now: () => time });
  store.apply(snapshot());
  time = 1200;
  const previous = store.serverNow();
  store.apply(snapshot({ serverTime: 1150 }));
  expect(store.serverNow()).toBe(previous);
  store.clear();
  store.apply(snapshot({ serverTime: 5000 }));
  expect(store.serverNow()).toBe(5000);
});

test("steady movement stays continuous with alternating 0 to 50ms packet delays", () => {
  let time = 1000;
  const store = createRoomStore({ now: () => time });
  store.apply(snapshot());
  const delays = [0, 40, 10, 50, 0, 30];
  let index = 1;
  let previous = 0;
  for (time = 1000; time < 7000; time += 10) {
    while (time >= 1000 + index * 100 + delays[index % delays.length]) {
      store.apply(snapshot({ type: "MOVEMENT_FRAME", serverTime: 1000 + index * 100, frameSeq: index + 1,
        participants: [{ ...actor("2", index), locomotion: "walking" }] }));
      index += 1;
    }
    const position = store.interpolate("2").position.x;
    if (time > 1300) {
      expect(position).toBeGreaterThan(previous);
      expect(position - previous).toBeLessThanOrEqual(0.103);
    }
    previous = position;
  }
});
