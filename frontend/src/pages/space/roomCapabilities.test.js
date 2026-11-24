import { availableSeat, sharedInteractionTarget, usableSurfaceAnchor } from "./roomCapabilities";
import { itemInteraction } from "./walkInteractions";
import { createInitialRoom } from "./roomState";
import { installFurnitureCatalog, installSpaceCatalog } from "../../features/group-space/furnitureCatalog.js";
import { seatedAvatarPlacement, usableSeatCount } from "./seatedAvatar.js";
import seatModelAnchors from "./seatModelAnchors.json";

const room = createInitialRoom("dining");
const item = { id: "table", kind: "feastTable", x: 0, z: 0, rotation: 0 };
const target = itemInteraction(item, 0, false, room);
const state = { selfId: "1", participants: [{ memberId: "1", heldItemId: null }], items: [], assets: {} };

test("the local seat models cover every advertised seat slot", () => {
  const { furnitureCatalog } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  const advertised = Object.fromEntries(furnitureCatalog.filter(asset => asset.interaction?.seatCount)
    .map(({ kind, interaction }) => [kind, interaction.seatCount]));
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

test("bench seat counts can change within the model but never expose a slot without an anchor", () => {
  const { furnitureCatalog } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  const bench = { id: "bench", kind: "bench", x: 3, z: -2, rotation: 1, scaleX: 1.2 };
  const secondSeat = seatedAvatarPlacement(bench, 1, room);
  const configure = (seatCount) => installFurnitureCatalog(furnitureCatalog.map(type => type.kind === "bench"
    ? { ...type, interaction: { ...type.interaction, seatCount } } : type));
  const occupied = [0, 1].map(slot => ({ memberId: String(slot + 2), seat: { assetId: bench.id, slot } }));
  try {
    expect(secondSeat).not.toBeNull();
    configure(1);
    expect(itemInteraction(bench, 0, false, room).seatCount).toBe(1);
    expect(seatedAvatarPlacement(bench, 1, room)).toBeNull();
    configure(2);
    expect(itemInteraction(bench, 0, false, room).seatCount).toBe(2);
    expect(seatedAvatarPlacement(bench, 1, room)).toEqual(secondSeat);
    configure(3);
    const target = itemInteraction(bench, 0, false, room);
    expect(target.seatCount).toBe(2);
    expect(availableSeat(target, { x: 3, z: -1 }, { ...state, participants: occupied }, room)).toBeUndefined();
    expect(seatedAvatarPlacement(bench, 2, room)).toBeNull();
  } finally {
    installFurnitureCatalog(furnitureCatalog);
  }
});

test("an empty surface offers no snack menu or empty use prompt", () => {
  expect(target.label).not.toBe("간식 고르기");
  expect(sharedInteractionTarget(target, state)).toBeNull();
});

test("solo vending only offers configured drinks and snacks", () => {
  const { furnitureCatalog } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  installFurnitureCatalog(furnitureCatalog.map(type => type.kind === "cafeCabinet" ? { ...type,
    interaction: { ...type.interaction, storage: { kinds: ["tea"], capacity: 2 }, producer: { kinds: ["coffee"] } }
  } : type));
  try {
    const cabinet = { ...item, kind: "cafeCabinet" };
    expect(itemInteraction(cabinet, 0, false, room).choices.map(choice => choice.id)).toEqual(["coffee", "tea"]);
    expect(itemInteraction({ ...item, kind: "kitchenCounter" }, 0, false, room).choices.map(choice => choice.id)).toEqual(["cookie"]);
  } finally {
    installFurnitureCatalog(furnitureCatalog);
  }
});

test("disabling a portable kind removes it from storage, production and solo options", () => {
  const { spaceCatalog, portableItems } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  const cabinet = { ...item, kind: "cafeCabinet" };
  const open = { ...state, assets: { [cabinet.id]: { open: true } } };
  const heldCup = { id: "cup", kind: "cup", location: "HELD", holderId: "1" };
  const usingCup = { ...open, participants: [{ memberId: "1", heldItemId: heldCup.id }], items: [heldCup] };
  installSpaceCatalog({ ...spaceCatalog, portableItems: { ...portableItems,
    tea: { ...portableItems.tea, portable: false }, coffee: { ...portableItems.coffee, portable: false } } });
  try {
    const target = itemInteraction(cabinet, 0, false, room);
    expect(target.choices.map(({ id }) => id)).toEqual(["latte", "cookie"]);
    const storage = sharedInteractionTarget(target, open).choices.filter(({ command }) => command.action === "TAKE");
    expect(storage.map(({ command }) => command.kind)).toEqual(["cup", "cookie"]);
    const production = sharedInteractionTarget(target, usingCup).choices.filter(({ command }) => command.action === "PRODUCE");
    expect(production.map(({ command }) => command.kind)).toEqual(["latte"]);
  } finally {
    installSpaceCatalog(spaceCatalog);
  }
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

test("table placement options never exceed the available model surface anchors", () => {
  const { furnitureCatalog } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  const cookie = { id: "cookie", kind: "cookie", location: "HELD", holderId: "1" };
  const holding = { ...state, participants: [{ memberId: "1", heldItemId: cookie.id }], items: [cookie] };
  installFurnitureCatalog(furnitureCatalog.map(type => type.kind === item.kind
    ? { ...type, interaction: { ...type.interaction, surface: { slots: 2 } } } : type));
  try {
    expect(sharedInteractionTarget(target, holding).choices.map(({ command }) => command.slot)).toEqual([0]);
  } finally {
    installFurnitureCatalog(furnitureCatalog);
  }
});

test("inherited object properties do not count as model anchors", () => {
  const { furnitureCatalog } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  installFurnitureCatalog([...furnitureCatalog, { kind: "constructor",
    interaction: { capabilities: ["seatable", "surface"], seatCount: 1, surface: { slots: 1 } } }]);
  try {
    expect(usableSeatCount("constructor")).toBe(0);
    expect(usableSurfaceAnchor("constructor", 0)).toBeNull();
  } finally {
    installFurnitureCatalog(furnitureCatalog);
  }
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
