import { consumptionFrame, detectHeldConsumption } from "./heldConsumption.js";

const cookie = { id: "cookie", kind: "cookie", location: "HELD", holderId: "1", remaining: 1 };
const state = (item = cookie, extra = {}) => ({ type: "ROOM_STATE", roomEpoch: "epoch", connectionGeneration: "g",
  layoutRevision: 1, controlSeq: 2, serverTime: 1000, participants: [{ memberId: "1", heldItemId: item?.id ?? null }],
  items: item ? [item] : [], ...extra });

test("a bite raises the original cookie before its quantity changes and then lowers the hand", () => {
  const gesture = detectHeldConsumption(state(cookie, { controlSeq: 1 }), state({ ...cookie, remaining: .66 }), "1");
  expect(consumptionFrame(gesture, 1000)).toMatchObject({ active: true, lift: 0, remaining: 1, visible: true });
  expect(consumptionFrame(gesture, 1350)).toMatchObject({ lift: 1, remaining: 1 });
  expect(consumptionFrame(gesture, 1420)).toMatchObject({ lift: 1, remaining: .66, visible: true });
  expect(consumptionFrame(gesture, 1900)).toMatchObject({ active: false, lift: 0 });
});

test("the last cookie stays in the hand until it reaches the mouth", () => {
  const gesture = detectHeldConsumption(state({ ...cookie, remaining: .32 }, { controlSeq: 1 }), state(null), "1");
  expect(gesture.lastBite).toBe(true);
  expect(consumptionFrame(gesture, 1350)).toMatchObject({ active: true, visible: true, remaining: .32 });
  expect(consumptionFrame(gesture, 1420)).toMatchObject({ active: true, visible: false, remaining: 0 });
  expect(consumptionFrame(gesture, 1000, true).active).toBe(false);
});

test.each([
  { type: "ROOM_SNAPSHOT" }, { controlSeq: 1 }, { roomEpoch: "new" },
  { connectionGeneration: "new" }, { layoutRevision: 2 }, { participants: [] },
])("resyncs and duplicate or unrelated state do not replay a bite: %j", (extra) => {
  expect(detectHeldConsumption(state(cookie, { controlSeq: 1 }), state(null, extra), "1")).toBeNull();
});

test("dropping and throwing are not eating; a finished drink still animates before becoming an empty cup", () => {
  for (const location of ["WORLD", "THROWN", "SURFACE"]) {
    expect(detectHeldConsumption(state(cookie, { controlSeq: 1 }), state({ ...cookie, location }, {
      participants: [{ memberId: "1", heldItemId: null }],
    }), "1")).toBeNull();
  }
  const coffee = { ...cookie, kind: "coffee", remaining: .32 };
  const gesture = detectHeldConsumption(state(coffee, { controlSeq: 1 }), state({ ...coffee, kind: "cup", remaining: 0 }), "1");
  expect(gesture).toMatchObject({ item: { kind: "coffee" }, remaining: 0, lastBite: false });
});
