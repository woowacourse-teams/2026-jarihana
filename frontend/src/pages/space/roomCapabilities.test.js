import { availableSeat, sharedInteractionTarget } from "./roomCapabilities";
import { itemInteraction } from "./walkInteractions";
import { createInitialRoom } from "./roomState";
import seatModelAnchors from "./seatModelAnchors.json";

const room = createInitialRoom("dining");
const item = { id: "table", kind: "feastTable", x: 0, z: 0, rotation: 0 };
const target = itemInteraction(item, 0, false, room);
const state = { selfId: "1", participants: [{ memberId: "1", heldItemId: null }], items: [], assets: {} };

test("the local seat models cover every advertised seat slot", () => {
  const { capabilities } = require("../../../tests/fixtures/clubhouse-seeds.cjs").assetDefinitions;
  const advertised = Object.fromEntries(Object.entries(capabilities.assets).filter(([, asset]) => asset.seatCount)
    .map(([kind, asset]) => [kind, asset.seatCount]));
  const modeled = Object.fromEntries(Object.entries(seatModelAnchors).map(([kind, model]) => [kind, model.seats.length]));
  expect(modeled).toEqual(advertised);
});

test("the nearest available seat is selected from the advertised slots", () => {
  const sofa = { id: "sofa", kind: "sofa", x: 0, z: 0, rotation: 1 };
  const sofaTarget = itemInteraction(sofa, 0, false, room);
  const position = { x: 0.5, z: -1 };
  const participants = [{ memberId: "2", seat: { assetId: "sofa", slot: 2 } }];
  expect(availableSeat(sofaTarget, position, state, room)).toBe(2);
  expect(availableSeat(sofaTarget, position, { ...state, participants }, room)).toBe(1);
});

test("an empty surface offers no snack menu or empty use prompt", () => {
  expect(target.label).not.toBe("간식 고르기");
  expect(sharedInteractionTarget(target, state)).toBeNull();
});

test("tables offer placing a held item and picking up a placed item", () => {
  const cookie = { id: "cookie", kind: "cookie", location: "HELD", holderId: "1" };
  const holding = { ...state, participants: [{ memberId: "1", heldItemId: cookie.id }], items: [cookie] };
  const place = sharedInteractionTarget(target, holding);
  expect(place.choices.every((choice) => choice.command.action === "PLACE")).toBe(true);
  expect(place.choices.length).toBeGreaterThan(0);
  expect(place.choices.some((choice) => choice.label.includes("선반"))).toBe(false);
  const pickup = sharedInteractionTarget(target, { ...state, items: [{ ...cookie, location: "SURFACE", assetId: item.id, slot: 0 }] });
  expect(pickup.choices).toHaveLength(1);
  expect(pickup.choices[0].command.action).toBe("PICKUP");
  expect(pickup.choices[0].label).toContain("쿠키 집기");
});

test("a stored book does not occupy the same-numbered shelf surface", () => {
  const shelf = itemInteraction({ ...item, id: "shelf", kind: "bookshelf" }, 0, false, room);
  const held = { id: "held", kind: "book", location: "HELD", holderId: "1" };
  const stored = { id: "stored", kind: "book", location: "STORAGE", assetId: "shelf", slot: 0 };
  const occupied = { id: "placed", kind: "book", location: "SURFACE", assetId: "shelf", slot: 1 };
  const interaction = sharedInteractionTarget(shelf, { ...state, participants: [{ memberId: "1", heldItemId: held.id }],
    items: [held, stored, occupied] });

  expect(interaction.choices.filter(({ command }) => command.action === "PLACE").map(({ command }) => command.slot))
    .toEqual([0, 2, 3]);
  expect(interaction.choices.some(({ command }) => command.action === "RETURN")).toBe(true);
});
