import * as THREE from "three";
import { AVATAR_PRESETS } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { createRemotePlayers, thrownItemPosition } from "./roomRemotePlayers.js";
import { walkPropBaseOffset } from "./roomModels.js";
import { createRoomStore } from "../../features/group-space/realtime/roomStore.js";
import propSurfaceAnchors from "./propSurfaceAnchors.json";

let frame;
beforeEach(() => {
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 1; });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => jest.restoreAllMocks());
const actor = (memberId, x) => ({ memberId, displayName: memberId, avatarColor: "#536bd6", position: { x, y: 0, z: 0 },
  yaw: 0, locomotion: "walking", seat: null, heldItemId: null, pose: "relaxed", emote: null });
const state = (extra = {}) => ({ type: "ROOM_SNAPSHOT", roomEpoch: "e", connectionGeneration: "g", layoutRevision: 1,
  controlSeq: 1, frameSeq: 1, serverTime: 1000, selfId: "1", participants: [actor("1", 0), actor("2", 3)], items: [], assets: {}, ...extra });
const seat = { assetId: "stool", slot: 0 };
const seatedRoom = { template: "lounge", version: 12, items: [{ id: "stool", kind: "stool", x: 4, z: 1, rotation: 0 }] };

test("remote handheld, placed, dropped and thrown props all receive the room lighting", () => {
  const scene = new THREE.Scene();
  const store = createRoomStore({ now: () => 1000 });
  const prepare = jest.fn();
  const items = ["HELD", "SURFACE", "WORLD", "THROWN"].map((location, index) => ({
    id: `item-${index}`, kind: index === 0 ? "cookie" : "cup", location, remaining: 1,
    holderId: index === 0 ? "2" : null, position: { x: 0, y: 0, z: 0 },
  }));
  store.apply(state({ participants: [{ ...actor("2", 0), heldItemId: items[0].id }], items }));
  const players = createRemotePlayers(scene, jest.fn(), () => null, prepare);
  players.setStore(store);
  for (const name of ["shared-held-prop", "shared-item-item-1", "shared-item-item-2", "shared-item-item-3"]) {
    const prop = scene.getObjectByName(name);
    expect(prop).toBeDefined();
    prop.traverse((object) => { if (object.material) expect(prepare).toHaveBeenCalledWith(object.material); });
  }
  players.dispose();
});

test("surface slot counts have a local model anchor for every slot", () => {
  const { capabilities } = require("../../../tests/fixtures/clubhouse-seeds.cjs").assetDefinitions;
  const slotCounts = Object.fromEntries(Object.entries(capabilities.assets).filter(([, asset]) => asset.surface)
    .map(([kind, asset]) => [kind, asset.surface.slots]));
  const anchorCounts = Object.fromEntries(Object.entries(propSurfaceAnchors).map(([kind, anchors]) => [kind, anchors.length]));
  expect(anchorCounts).toEqual(slotCounts);
});

test("placed props and their pick targets both follow the furniture after moving, scaling and rotating it", () => {
  const scene = new THREE.Scene();
  const store = createRoomStore({ now: () => 1000 });
  const furniture = { id: "shelf", kind: "bookshelf", x: 1, z: -1, rotation: 0, elevation: 0.25 };
  const room = { template: "lounge", version: 12, items: [furniture] };
  const item = { id: "cup", kind: "cup", location: "SURFACE", assetId: "shelf", slot: 1, remaining: 0,
    position: { x: -10, y: 0, z: 9 } };
  store.apply(state({ items: [item, { ...item, id: "stored", location: "STORAGE", slot: 1 }] }));
  const players = createRemotePlayers(scene, jest.fn(), () => room);
  players.setStore(store); frame(1000);
  const prop = scene.getObjectByName("shared-item-cup");
  const expectPlacement = (x, y, z, floor) => {
    const [target] = players.targets();
    expect(players.targets()).toHaveLength(1);
    expect(prop.position.x).toBeCloseTo(x);
    expect(prop.position.y).toBeCloseTo(y + walkPropBaseOffset(item.kind));
    expect(prop.position.z).toBeCloseTo(z);
    expect(target.x).toBeCloseTo(prop.position.x);
    expect(target.z).toBeCloseTo(prop.position.z);
    expect(target.floor).toBeCloseTo(floor);
    expect(target.minY).toBeCloseTo(y - 0.1);
    expect(target.maxY).toBeCloseTo(y + 0.35);
  };
  expectPlacement(1.51, 0.99, -0.885, 0);
  expect(scene.getObjectByName("shared-item-stored")).toBeUndefined();

  room.items = [{ ...furniture, x: 3, z: -6, rotation: 1, scaleX: 1.5, scaleY: 1.25, scaleZ: 2, level: 1 }];
  players.refresh(); frame(1050);
  expectPlacement(3.23, 5.625, -6.765, 4.45);
  expect(prop.rotation.y).toBeCloseTo(Math.PI / 2);

  room.items = [];
  players.refresh(); frame(1100);
  expect(prop.visible).toBe(false);
  expect(players.targets()).toEqual([]);
  players.dispose();
});

test("remote actors render server positions and disappear on leave or runtime cleanup", () => {
  const scene = new THREE.Scene(); const store = createRoomStore({ now: () => 1000 });
  store.apply(state()); const players = createRemotePlayers(scene, jest.fn()); players.setStore(store); frame(1000);
  expect(scene.getObjectByName("remote-player-1")).toBeUndefined();
  expect(scene.getObjectByName("remote-player-2").position.x).toBe(3);
  store.apply(state({ participants: [actor("1", 0)] })); players.refresh();
  expect(scene.getObjectByName("remote-player-2")).toBeUndefined();
  store.apply(state()); players.refresh(); players.setStore(null);
  expect(scene.getObjectByName("remote-player-2")).toBeUndefined(); players.dispose();
});
test("late join shows seated actors holding a partially consumed cookie", () => {
  const scene = new THREE.Scene(); const store = createRoomStore({ now: () => 1000 });
  store.apply(state({ participants: [{ ...actor("2", 3), heldItemId: "cookie", seat }],
    items: [{ id: "cookie", kind: "cookie", location: "HELD", holderId: "2", remaining: .25 }] }));
  const players = createRemotePlayers(scene, jest.fn(), () => seatedRoom); players.setStore(store); frame(1000);
  expect(scene.getObjectByName("remote-player-2").position.x).toBe(4);
  expect(scene.getObjectByName("shared-held-prop").scale.x).toBe(.5); players.dispose();
});

test("raising and lowering a cup moves the hand and cup together", () => {
  const scene = new THREE.Scene();
  const store = createRoomStore({ now: () => 1000 });
  const cup = { id: "cup", kind: "cup", location: "HELD", holderId: "2", remaining: 0 };
  const players = createRemotePlayers(scene, jest.fn(), () => seatedRoom);
  const update = (pose) => {
    store.apply(state({ participants: [{ ...actor("2", 3), heldItemId: cup.id, seat, pose }], items: [cup] }));
    players.refresh();
  };
  players.setStore(store);
  update("relaxed"); frame(1000);
  const model = scene.getObjectByName("remote-player-2");
  const hand = model.getObjectByName("mascot-grip-hand");
  const prop = model.getObjectByName("shared-held-prop");
  const propY = () => prop.getWorldPosition(new THREE.Vector3()).y;
  const start = { hand: hand.position.y, cup: propY() };

  update("drinking"); frame(1040); frame(1200);
  expect(scene.getObjectByName("remote-player-2")).toBe(model);
  expect(hand.position.y - start.hand).toBeCloseTo(.16);
  expect(propY() - start.cup).toBeCloseTo(.16);
  frame(1360);
  expect(propY() - start.cup).toBeCloseTo(.32);

  update("relaxed"); frame(1400); frame(1720);
  expect(hand.position.y).toBeCloseTo(start.hand);
  expect(propY()).toBeCloseTo(start.cup);
  players.dispose();
});

test("remote locomotion animates the limbs and returns to a standing pose on stop", () => {
  const scene = new THREE.Scene();
  let now = 1000;
  const store = createRoomStore({ now: () => now });
  const players = createRemotePlayers(scene, jest.fn());
  players.setStore(store);
  const update = (locomotion, time) => {
    now = time;
    store.apply(state({ serverTime: time, participants: [{ ...actor("2", 3), locomotion }] }));
    players.refresh();
    frame(time);
  };

  update("walking", 2150);
  for (let time = 2166; time <= 2406; time += 16) frame(time);
  const avatar = scene.getObjectByName("remote-player-2");
  const leftLeg = avatar.getObjectByName("walking-leg-left");
  const rightLeg = avatar.getObjectByName("walking-leg-right");
  const leftArm = avatar.getObjectByName("walking-arm-left");
  const walkingSwing = Math.abs(leftLeg.rotation.x);
  expect(walkingSwing).toBeGreaterThan(0.1);
  expect(leftLeg.rotation.x * rightLeg.rotation.x).toBeLessThan(0);
  expect(leftLeg.rotation.x * leftArm.rotation.x).toBeLessThan(0);

  update("running", 2450);
  for (let time = 2466; time <= 2674; time += 16) frame(time);
  expect(avatar.getObjectByName("mascot-motion").rotation.x).toBeGreaterThan(0);
  update("jumping", 2750);
  for (let time = 2766; time <= 2974; time += 16) frame(time);
  expect(leftArm.rotation.x).toBeLessThan(0);
  update("idle", 3050);
  expect(leftLeg.rotation.x).not.toBe(0);
  for (let time = 3066; time <= 3274; time += 16) frame(time);
  expect(leftLeg.rotation.x).toBeCloseTo(0);
  expect(leftArm.rotation.x).toBeCloseTo(0);
  expect(avatar.getObjectByName("mascot-motion").position.y).toBe(0);
  players.dispose();
});

test("thrown item uses shared timestamps and ballistic gravity", () => {
  const item = { location: "THROWN", position: { x: 1, y: 2, z: 0 }, velocity: { x: 3, y: 4, z: -2 }, startedAt: 1000 };
  expect(thrownItemPosition(item, 1500)).toEqual({ x: 2.5, y: 1.75, z: -1 });
  expect(thrownItemPosition(item, 3000).y).toBe(.08);
});

test("personalized remote avatars share the rig and keep a raised cup attached", () => {
  const scene = new THREE.Scene();
  const store = createRoomStore({ now: () => 1000 });
  const cup = { id: "cup", kind: "cup", location: "HELD", holderId: "2", remaining: 0 };
  const seated = { ...actor("2", 4), avatarAppearance: AVATAR_PRESETS[0].appearance, heldItemId: cup.id, seat };
  const standing = { ...actor("3", -4), avatarAppearance: AVATAR_PRESETS[1].appearance };
  const players = createRemotePlayers(scene, jest.fn(), () => seatedRoom);
  const update = (pose, time, participants = [{ ...seated, pose }, standing]) => {
    store.apply(state({ participants, items: [cup] }));
    players.refresh();
    frame(time);
  };

  players.setStore(store);
  update("relaxed", 1000);
  const model = scene.getObjectByName("remote-player-2");
  const prop = model.getObjectByName("shared-held-prop");
  const cupY = () => prop.getWorldPosition(new THREE.Vector3()).y;
  const start = cupY();
  const layer = scene.getObjectByName("room-realtime-participants");
  const colors = layer.children.filter((child) => child.isInstancedMesh).flatMap((mesh) =>
    Array.from({ length: mesh.count }, (_, index) => {
      const color = new THREE.Color();
      mesh.getColorAt(index, color);
      return color.getHexString();
    }));
  expect(colors).toEqual(expect.arrayContaining(["52bca7", "e68c7e"]));
  expect(model.getObjectByName("mascot-held-anchor")).toBeUndefined();

  update("drinking", 1040);
  frame(1200);
  expect(cupY()).toBeGreaterThan(start + .08);
  frame(1360);
  expect(cupY()).toBeGreaterThan(start + .20);
  update("relaxed", 1400);
  frame(1720);
  expect(cupY()).toBeCloseTo(start);
  update("relaxed", 1800, []);
  expect(layer.children.filter((child) => child.isInstancedMesh).every((mesh) => mesh.count === 0)).toBe(true);
  players.dispose();
});

test.each([false, true])("remote last bite reaches the mouth before disappearing (personal avatar: %s)", (personalized) => {
  let now = 1000;
  const scene = new THREE.Scene();
  const store = createRoomStore({ now: () => now });
  const member = { ...actor("2", 3), locomotion: "idle", heldItemId: "cookie",
    ...(personalized && { avatarAppearance: AVATAR_PRESETS[0].appearance }) };
  store.apply(state({ participants: [member], items: [{ id: "cookie", kind: "cookie", location: "HELD", holderId: "2", remaining: .32 }] }));
  const players = createRemotePlayers(scene, jest.fn());
  players.setStore(store); frame(now);
  const prop = scene.getObjectByName("shared-held-prop");
  const start = prop.getWorldPosition(new THREE.Vector3()).y;
  now = 1100;
  store.apply(state({ type: "ROOM_STATE", controlSeq: 2, serverTime: now, participants: [{ ...member, heldItemId: null }], items: [] }));
  players.refresh(); frame(now);
  expect(scene.getObjectByName("shared-held-prop")).toBe(prop);
  now = 1450; frame(now);
  expect(prop.visible).toBe(true);
  expect(prop.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(start + .2);
  now = 1550; frame(now);
  expect(prop.visible).toBe(false);
  now = 2050; frame(now);
  expect(scene.getObjectByName("shared-held-prop")).toBeUndefined();
  players.dispose();
});
