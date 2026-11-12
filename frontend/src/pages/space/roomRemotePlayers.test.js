import * as THREE from "three";
import { AVATAR_PRESETS } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { createRemotePlayers, thrownItemPosition } from "./roomRemotePlayers.js";
import { createRoomStore } from "../../features/group-space/realtime/roomStore.js";

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
  store.apply(state({ participants: [{ ...actor("2", 3), heldItemId: "cookie", seat: { position: { x: 4, y: .34, z: 1 }, yaw: 1 } }],
    items: [{ id: "cookie", kind: "cookie", location: "HELD", holderId: "2", remaining: .25 }] }));
  const players = createRemotePlayers(scene, jest.fn()); players.setStore(store); frame(1000);
  expect(scene.getObjectByName("remote-player-2").position.toArray()).toEqual([4, .34, 1]);
  expect(scene.getObjectByName("shared-held-prop").scale.x).toBe(.5); players.dispose();
});

test("raising and lowering a cup moves the hand and cup together", () => {
  const scene = new THREE.Scene();
  const store = createRoomStore({ now: () => 1000 });
  const seat = { position: { x: 4, y: .34, z: 1 }, yaw: Math.PI };
  const cup = { id: "cup", kind: "cup", location: "HELD", holderId: "2", remaining: 0 };
  const players = createRemotePlayers(scene, jest.fn());
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
  const avatar = scene.getObjectByName("remote-player-2");
  const leftLeg = avatar.getObjectByName("walking-leg-left");
  const rightLeg = avatar.getObjectByName("walking-leg-right");
  const leftArm = avatar.getObjectByName("walking-arm-left");
  const walkingSwing = Math.abs(leftLeg.rotation.x);
  expect(walkingSwing).toBeGreaterThan(0.3);
  expect(leftLeg.rotation.x * rightLeg.rotation.x).toBeLessThan(0);
  expect(leftLeg.rotation.x * leftArm.rotation.x).toBeLessThan(0);

  update("running", 2350);
  expect(Math.abs(leftLeg.rotation.x)).toBeGreaterThan(walkingSwing);
  expect(avatar.getObjectByName("mascot-motion").rotation.x).toBeGreaterThan(0);
  update("jumping", 2550);
  expect(leftArm.rotation.x).toBeLessThan(0);
  update("idle", 2750);
  expect(leftLeg.rotation.x).toBe(0);
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
  const seat = { position: { x: 4, y: .34, z: 1 }, yaw: Math.PI };
  const cup = { id: "cup", kind: "cup", location: "HELD", holderId: "2", remaining: 0 };
  const seated = { ...actor("2", 4), avatarAppearance: AVATAR_PRESETS[0].appearance, heldItemId: cup.id, seat };
  const standing = { ...actor("3", -4), avatarAppearance: AVATAR_PRESETS[1].appearance };
  const players = createRemotePlayers(scene, jest.fn());
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
