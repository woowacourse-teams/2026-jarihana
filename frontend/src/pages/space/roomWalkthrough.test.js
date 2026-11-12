import * as THREE from "three";
import { AVATAR_BASIC_APPEARANCE } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { createWalkthrough } from "./roomWalkthrough";
import { createInitialRoom } from "./roomState";
import { getRoomLayout, PLAYER } from "./roomLayout";
import { isWalkablePosition } from "./roomNavigation";
import { itemInteraction, lightInteraction } from "./walkInteractions";

let frames;
let frameId;
beforeEach(() => {
  frames = new Map(); frameId = 0;
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++frameId, callback); return frameId; });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => frames.delete(id));
});
afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ""; });
function setup(obstacles = [], template = "climbing") {
  const scene = new THREE.Scene();
  const container = document.createElement("div"); container.tabIndex = 0; document.body.append(container);
  const onPosition = jest.fn();
  const room = createInitialRoom(template);
  const walk = createWalkthrough(scene, container, { getRoom: () => room, getObstacles: () => obstacles, render: jest.fn(), onPosition });
  return { scene, container, onPosition, walk };
}
function advance(time) {
  const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(time));
}

test("first and third person share position; first person hides the avatar; exit preserves furniture", () => {
  const { scene, walk, onPosition } = setup();
  walk.update("firstPerson", "#536bd6");
  expect(walk.camera.position.y).toBe(PLAYER.eyeHeight);
  expect(scene.getObjectByName("mascot").visible).toBe(false);
  walk.command("forward");
  const before = walk.camera.position.clone();
  expect(before.z).toBeLessThan(PLAYER.spawn.z);
  walk.update("thirdPerson", "#536bd6");
  expect(scene.getObjectByName("mascot").position.z).toBeCloseTo(before.z);
  expect(scene.getObjectByName("mascot").visible).toBe(true);
  walk.update("perspective", "#536bd6");
  expect(scene.getObjectByName("mascot").visible).toBe(false);
  walk.command("forward");
  expect(scene.getObjectByName("mascot").position.z).toBeCloseTo(before.z);
  expect(onPosition).toHaveBeenCalledWith(expect.objectContaining({ zone: "현관 앞 마당" }));
  walk.dispose();
});

test("a saved avatar joins the current walk, moves with it and hides in first person", () => {
  const { scene, walk, container } = setup();
  const color = "#536bd6";
  try {
    walk.update("thirdPerson", color);
    walk.command("forward");
    const before = scene.getObjectByName("mascot").position.clone();
    walk.setPlayerAppearance({ ...AVATAR_BASIC_APPEARANCE, hair: "curly", outfit: "navy" });
    const avatar = scene.getObjectByName("player-avatar");
    expect(scene.getObjectByName("mascot")).toBeUndefined();
    expect(avatar.position.toArray()).toEqual(before.toArray());
    expect(avatar.visible).toBe(true);

    const part = avatar.children.find((mesh) => mesh.isInstancedMesh && mesh.count > 0);
    const idle = new THREE.Matrix4();
    part.getMatrixAt(0, idle);
    container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    advance(100); advance(150);
    expect(avatar.position.z).toBeLessThan(before.z);
    const walking = new THREE.Matrix4();
    part.getMatrixAt(0, walking);
    expect(walking.equals(idle)).toBe(false);
    container.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));

    container.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    advance(200);
    expect(avatar.position.y).toBeGreaterThan(before.y);
    walk.update("firstPerson", color);
    expect(avatar.visible).toBe(false);
    walk.update("thirdPerson", color);
    expect(avatar.visible).toBe(true);
    const after = avatar.position.clone();
    walk.setPlayerAppearance(undefined);
    expect(scene.getObjectByName("player-avatar")).toBeUndefined();
    expect(scene.getObjectByName("mascot").position.toArray()).toEqual(after.toArray());
  } finally {
    walk.dispose();
  }
});

test("applying a new architecture revision in the same theme returns the walker to the entrance", () => {
  const scene = new THREE.Scene();
  const container = document.createElement("div");
  let room = { ...createInitialRoom("band"), version: 10, items: [] };
  const walk = createWalkthrough(scene, container, { getRoom: () => room, getObstacles: () => [], render: jest.fn(), onPosition: jest.fn() });
  try {
    walk.update("firstPerson", room.avatarColor);
    walk.command("forward");
    expect(walk.camera.position.z).toBeLessThan(PLAYER.spawn.z);
    room = { ...room, version: 11 };
    walk.update("firstPerson", room.avatarColor);
    expect(walk.camera.position.x).toBe(PLAYER.spawn.x);
    expect(walk.camera.position.z).toBe(PLAYER.spawn.z);
  } finally { walk.dispose(); }
});

test("returning from decorating keeps the exact walk pose and a new visit starts in front again", () => {
  const { scene, walk } = setup();
  const options = { preservePose: true, playing: true };
  try {
    walk.update("front", "#536bd6");
    walk.update("firstPerson", "#536bd6", true, options);
    const arrival = walk.camera.position.toArray();
    walk.command("forward");
    walk.command("turnRight");
    walk.command("lookUp");
    const before = walk.camera.position.toArray();
    const direction = walk.camera.getWorldDirection(new THREE.Vector3()).toArray();

    walk.update("thirdPerson", "#536bd6", true, options);
    const beforeEditing = walk.camera.position.toArray();
    const thirdPersonDirection = walk.camera.getWorldDirection(new THREE.Vector3()).toArray();
    walk.update("perspective", "#536bd6", true, { preservePose: true });
    expect(scene.getObjectByName("mascot").visible).toBe(false);
    walk.update("thirdPerson", "#536bd6", true, options);
    expect(walk.camera.position.toArray()).toEqual(beforeEditing);
    expect(walk.camera.getWorldDirection(new THREE.Vector3()).toArray()).toEqual(thirdPersonDirection);
    walk.update("firstPerson", "#536bd6", true, options);
    expect(walk.camera.position.toArray()).toEqual(before);
    expect(walk.camera.getWorldDirection(new THREE.Vector3()).toArray()).toEqual(direction);

    walk.update("front", "#536bd6");
    walk.update("firstPerson", "#536bd6", true, options);
    expect(walk.camera.position.toArray()).toEqual(arrival);
  } finally { walk.dispose(); }
});

test("decorating keeps a legal pose across a room revision, but returns to the entrance if a new object blocks it", () => {
  const scene = new THREE.Scene();
  const container = document.createElement("div");
  let room = { ...createInitialRoom("band"), items: [] };
  const walk = createWalkthrough(scene, container, { getRoom: () => room, getObstacles: () => [], render: jest.fn() });
  const options = { preservePose: true };
  try {
    walk.update("firstPerson", room.avatarColor, true, options);
    walk.command("forward");
    walk.command("turnLeft");
    const before = walk.camera.position.clone();
    walk.update("perspective", room.avatarColor, true, options);
    room = { ...room, version: room.version + 1 };
    walk.update("perspective", room.avatarColor, true, options);
    walk.update("firstPerson", room.avatarColor, true, options);
    expect(walk.camera.position.toArray()).toEqual(before.toArray());

    walk.update("perspective", room.avatarColor, true, options);
    const position = { x: before.x, z: before.z };
    room = { ...room, items: [{ id: "new-table", kind: "gameTable", rotation: 0, ...position }] };
    expect(isWalkablePosition(position, room)).toBe(false);
    walk.update("perspective", room.avatarColor, true, options);
    walk.update("firstPerson", room.avatarColor, true, options);
    const { x, z } = walk.camera.position;
    expect(isWalkablePosition({ x, z }, room)).toBe(true);
    expect([x, z]).not.toEqual([before.x, before.z]);
  } finally { walk.dispose(); }
});

test("held movement stops on blur, keyup, mode exit and disposal", () => {
  const { container, walk } = setup();
  walk.update("firstPerson", "#536bd6");
  container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
  advance(100); advance(150);
  expect(walk.camera.position.z).toBeLessThan(PLAYER.spawn.z);
  window.dispatchEvent(new Event("blur"));
  expect(frames.size).toBe(0);
  const stopped = walk.camera.position.z;
  advance(200);
  expect(walk.camera.position.z).toBe(stopped);
  container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  container.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
  expect(frames.size).toBe(0);
  container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  walk.update("perspective", "#536bd6");
  expect(frames.size).toBe(0);
  walk.update("firstPerson", "#536bd6");
  container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  walk.dispose();
  expect(frames.size).toBe(0);
  container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  expect(frames.size).toBe(0);
});

test("an open overlay releases drag capture and stops movement and shortcuts without moving the camera", () => {
  const { container, walk } = setup();
  const surface = document.createElement("canvas");
  container.append(surface);
  surface.setPointerCapture = jest.fn();
  surface.hasPointerCapture = jest.fn(() => true);
  surface.releasePointerCapture = jest.fn();
  const pressW = () => container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  try {
    walk.update("firstPerson", "#536bd6");
    walk.onDown({ currentTarget: surface, pointerType: "touch", pointerId: 3, clientX: 100, clientY: 100 });
    pressW();
    advance(100); advance(150);
    const position = walk.camera.position.clone();
    const direction = walk.camera.getWorldDirection(new THREE.Vector3());
    walk.setInputBlocked(true);
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(3);
    expect(frames.size).toBe(0);
    pressW();
    walk.onDown({ currentTarget: surface, pointerType: "touch", pointerId: 4, clientX: 100, clientY: 100 });
    walk.onMove({ pointerType: "touch", pointerId: 4, clientX: 160, clientY: 100 });
    walk.command("turnRight");
    walk.command("forward");
    walk.command("jump");
    expect(surface.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(walk.camera.position.toArray()).toEqual(position.toArray());
    expect(walk.camera.getWorldDirection(new THREE.Vector3()).toArray()).toEqual(direction.toArray());
    walk.setInputBlocked(false);
    expect(frames.size).toBe(0);
    pressW();
    advance(250); advance(300);
    expect(walk.camera.position.z).toBeLessThan(position.z);
  } finally { walk.dispose(); }
});

test("WASD resumes from restored HUD focus without taking over chat input or native button keys", () => {
  const { container, walk } = setup();
  const studio = document.createElement("div");
  studio.className = "space-studio";
  const trigger = document.createElement("button");
  const chatInput = document.createElement("textarea");
  studio.append(container, trigger, chatInput);
  document.body.append(studio);
  const press = (target, type, code, key = "") => target.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
  try {
    walk.update("firstPerson", "#536bd6", true, { playing: true });
    walk.setInputBlocked(true);
    chatInput.focus();
    expect(press(chatInput, "keydown", "KeyW")).toBe(true);
    expect(frames.size).toBe(0);

    trigger.focus();
    walk.setInputBlocked(false);
    expect(press(trigger, "keydown", "Space", " ")).toBe(true);
    expect(press(trigger, "keydown", "Enter", "Enter")).toBe(true);
    expect(press(trigger, "keydown", "KeyW")).toBe(false);
    advance(100); advance(150);
    expect(walk.camera.position.z).toBeLessThan(PLAYER.spawn.z);
    expect(trigger).toHaveFocus();
    chatInput.focus();
    expect(frames.size).toBe(0);
    expect(press(chatInput, "keydown", "KeyW")).toBe(true);

    chatInput.remove();
    expect(press(document.body, "keydown", "KeyW")).toBe(false);
    press(document.body, "keyup", "KeyW");
    expect(frames.size).toBe(0);
  } finally { walk.dispose(); }
});

test("third person camera pulls forward instead of crossing a wall behind the player", () => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 0.2), new THREE.MeshBasicMaterial());
  wall.position.set(PLAYER.spawn.x, 4, PLAYER.spawn.z + 1.5);
  wall.updateMatrixWorld(true);
  const { walk } = setup([wall]);
  walk.update("thirdPerson", "#536bd6");
  expect(walk.camera.position.z).toBeLessThan(wall.position.z - 0.1);
  expect(walk.camera.position.z).toBeGreaterThan(PLAYER.spawn.z);
  walk.dispose(); wall.geometry.dispose(); wall.material.dispose();
});

test("look controls and reset restore an upright, correctly sized eye camera", () => {
  const { walk } = setup();
  walk.update("firstPerson", "#536bd6");
  walk.command("turnRight"); walk.command("lookUp"); walk.command("forward");
  const direction = walk.camera.getWorldDirection(new THREE.Vector3());
  expect(direction.x).toBeGreaterThan(0);
  expect(direction.y).toBeGreaterThan(0);
  walk.command("reset");
  expect(walk.camera.position.x).toBe(PLAYER.spawn.x);
  expect(walk.camera.position.z).toBe(PLAYER.spawn.z);
  expect(walk.camera.getWorldDirection(new THREE.Vector3()).y).toBeCloseTo(0);
  walk.resize(390, 700);
  expect(walk.camera.aspect).toBeCloseTo(390 / 700);
  walk.dispose();
});

test("climbing stairs lift both eye camera and third-person avatar onto the mezzanine", () => {
  const CLIMBING = getRoomLayout("climbing");
  const { walk, scene, onPosition } = setup();
  walk.update("firstPerson", "#536bd6");
  for (let step = 0; step < 3; step += 1) walk.command("forward");
  for (let step = 0; step < 16; step += 1) walk.command("right");
  for (let step = 0; step < 10; step += 1) walk.command("forward");
  expect(walk.camera.position.y).toBeGreaterThan(PLAYER.eyeHeight + 1);
  expect(walk.camera.position.y).toBeLessThan(PLAYER.eyeHeight + CLIMBING.mezzanine.height);
  for (let step = 0; step < 5; step += 1) walk.command("forward");
  expect(walk.camera.position.y).toBeCloseTo(PLAYER.eyeHeight + CLIMBING.mezzanine.height);
  expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ zone: "중층 라운지" }));
  walk.update("thirdPerson", "#536bd6");
  expect(scene.getObjectByName("mascot").position.y).toBeCloseTo(CLIMBING.mezzanine.height);
  walk.command("reset");
  expect(scene.getObjectByName("mascot").position.y).toBe(0);
  walk.dispose();
});


test("boardgame left stairs raise first-person eyes and allow returning to the ground floor", () => {
  const BOARDGAME = getRoomLayout("boardgame");
  const { walk, scene, onPosition } = setup([], "boardgame");
  walk.update("firstPerson", "#536bd6");
  for (let i = 0; i < 3; i++) walk.command("forward");
  for (let i = 0; i < 10; i++) walk.command("left");
  for (let i = 0; i < 18; i++) walk.command("forward");
  expect(walk.camera.position.y).toBeCloseTo(PLAYER.eyeHeight + BOARDGAME.mezzanine.height);
  expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ zone: "중층 라운지" }));
  walk.update("thirdPerson", "#536bd6");
  expect(scene.getObjectByName("mascot").position.y).toBeCloseTo(BOARDGAME.mezzanine.height);
  for (let i = 0; i < 18; i++) walk.command("backward");
  expect(scene.getObjectByName("mascot").position.y).toBe(0);
  walk.dispose();
});


test("functional sprites never participate in third-person wall collision", () => {
  const group = new THREE.Group();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  const raycast = jest.spyOn(sprite, "raycast");
  group.add(sprite);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 0.2), new THREE.MeshBasicMaterial());
  wall.position.set(PLAYER.spawn.x, 4, PLAYER.spawn.z + 1.5);
  group.add(wall);
  group.updateMatrixWorld(true);
  const { walk } = setup([group]);
  try {
    expect(() => walk.update("thirdPerson", "#536bd6")).not.toThrow();
    expect(raycast).not.toHaveBeenCalled();
    expect(walk.camera.position.z).toBeLessThan(wall.position.z - 0.1);
  } finally { walk.dispose(); wall.geometry.dispose(); wall.material.dispose(); sprite.material.dispose(); }
});

test("visiting from the web hero starts in the yard facing the entrance and pauses input during the flight", () => {
  const { walk, container } = setup([], "boardgame");
  walk.update("front", "#536bd6");
  walk.update("firstPerson", "#536bd6", false);
  const arrival = walk.camera.position.clone();
  expect(arrival.z).toBeGreaterThan(PLAYER.spawn.z + 5);
  expect(arrival.y).toBe(PLAYER.eyeHeight);
  expect(walk.camera.getWorldDirection(new THREE.Vector3()).z).toBeLessThan(-0.9);
  container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  expect(frames.size).toBe(0);
  walk.update("firstPerson", "#536bd6");
  walk.command("forward");
  expect(walk.camera.position.z).toBeLessThan(arrival.z);
  walk.update("front", "#536bd6");
  walk.update("firstPerson", "#536bd6");
  expect(walk.camera.position.toArray()).toEqual(arrival.toArray());
  walk.dispose();
});

test("mouse movement over the scene still works on the first visit if pointer lock is denied", () => {
  const { walk, container } = setup();
  container.requestPointerLock = () => document.dispatchEvent(new Event("pointerlockerror"));
  const direction = () => walk.camera.getWorldDirection(new THREE.Vector3()).x;
  const move = (target) => {
    const event = new MouseEvent("mousemove", { bubbles: true });
    Object.defineProperty(event, "movementX", { value: 35 });
    target.dispatchEvent(event);
  };
  try {
    walk.update("front", "#536bd6");
    walk.requestVisitPointerLock();
    walk.update("firstPerson", "#536bd6", false, { allowFlightLook: true });
    move(document.body);
    expect(direction()).toBeCloseTo(0);
    move(container);
    expect(direction()).toBeGreaterThan(0.1);
    walk.update("firstPerson", "#536bd6");
    container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const released = direction();
    move(container);
    expect(direction()).toBeCloseTo(released);
  } finally {
    walk.dispose();
  }
});

test("the visit locks the pointer through the camera flight and rotates until Escape releases it", () => {
  const { walk, container } = setup();
  let owner = null;
  const changeOwner = (element) => {
    owner = element;
    document.dispatchEvent(new Event("pointerlockchange"));
  };
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => owner });
  document.exitPointerLock = jest.fn(() => changeOwner(null));
  container.requestPointerLock = jest.fn(() => changeOwner(container));
  const direction = () => walk.camera.getWorldDirection(new THREE.Vector3()).x;
  const mouseMove = () => {
    const event = new MouseEvent("mousemove", { clientX: 1280, clientY: 100 });
    Object.defineProperty(event, "movementX", { value: 35 });
    document.dispatchEvent(event);
  };
  const keyDown = (key, code = key) => container.dispatchEvent(new KeyboardEvent("keydown", { key, code }));
  try {
    walk.update("front", "#536bd6");
    walk.requestVisitPointerLock();
    expect(owner).toBe(container);
    expect(container).toHaveFocus();

    walk.update("front", "#536bd6", false);
    walk.update("firstPerson", "#536bd6", false, { allowFlightLook: true });
    expect(owner).toBe(container);
    mouseMove();
    expect(direction()).toBeGreaterThan(0.1);
    keyDown("w", "KeyW");
    expect(frames.size).toBe(0);

    walk.update("firstPerson", "#536bd6");
    expect(container.requestPointerLock).toHaveBeenCalledTimes(1);
    mouseMove();
    expect(direction()).toBeGreaterThan(0.1);
    const firstTurn = direction();
    mouseMove();
    expect(direction()).toBeGreaterThan(firstTurn);
    container.focus();
    keyDown("w", "KeyW");
    changeOwner(null);
    expect(frames.size).toBe(0);
    const unlockedDirection = direction();
    mouseMove();
    expect(direction()).toBeCloseTo(unlockedDirection);
    expect(walk.active()).toBe(true);
    expect(container.requestPointerLock).toHaveBeenCalledTimes(1);

    walk.update("thirdPerson", "#536bd6");
    walk.command("lockPointer");
    expect(owner).toBe(container);
    walk.setInputBlocked(true);
    expect(owner).toBeNull();
    keyDown("Enter");
    expect(owner).toBeNull();
    walk.setInputBlocked(false);
    keyDown("Enter");
    expect(owner).toBe(container);
    keyDown("Escape");
    expect(owner).toBeNull();
    expect(walk.active()).toBe(true);
    keyDown("Enter");
    walk.update("perspective", "#536bd6");
    expect(owner).toBeNull();
  } finally {
    walk.dispose();
    delete document.pointerLockElement;
    delete document.exitPointerLock;
  }
});

test("returning to the tab resumes mouse look without restarting held keys or overriding Escape", () => {
  jest.useFakeTimers({ doNotFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  const { walk, container } = setup();
  let owner = null;
  let focused = true;
  let hidden = false;
  jest.spyOn(document, "hasFocus").mockImplementation(() => focused);
  jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const changeOwner = (element) => {
    owner = element;
    document.dispatchEvent(new Event("pointerlockchange"));
  };
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => owner });
  document.exitPointerLock = jest.fn(() => changeOwner(null));
  container.requestPointerLock = jest.fn(() => changeOwner(container));
  const changeTab = (away) => {
    hidden = away;
    if (away) {
      focused = false;
      window.dispatchEvent(new Event("blur"));
    }
    document.dispatchEvent(new Event("visibilitychange"));
    if (!away) {
      focused = true;
      window.dispatchEvent(new Event("focus"));
    }
  };
  try {
    walk.update("firstPerson", "#536bd6");
    walk.command("lockPointer");
    container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(frames.size).toBe(1);
    changeTab(true);
    expect(owner).toBeNull();
    expect(frames.size).toBe(0);
    changeTab(false);
    expect(owner).toBe(container);
    expect(frames.size).toBe(0);
    const mouseMove = new MouseEvent("mousemove");
    Object.defineProperty(mouseMove, "movementX", { value: 35 });
    document.dispatchEvent(mouseMove);
    expect(walk.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.1);

    // Chrome emits the unlock before updating focus or visibility on tab switch.
    changeOwner(null);
    changeTab(true);
    jest.runOnlyPendingTimers();
    changeTab(false);
    expect(owner).toBe(container);
    container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    changeTab(true);
    changeTab(false);
    expect(owner).toBeNull();
    expect(container.requestPointerLock).toHaveBeenCalledTimes(3);

    walk.command("lockPointer");
    changeOwner(null);
    jest.runOnlyPendingTimers();
    changeTab(true);
    changeTab(false);
    expect(owner).toBeNull();
    expect(container.requestPointerLock).toHaveBeenCalledTimes(4);
  } finally {
    walk.dispose();
    jest.useRealTimers();
    delete document.pointerLockElement;
    delete document.exitPointerLock;
  }
});

test("touch can drag to look without locking the pointer", () => {
  const { walk, container } = setup();
  container.requestPointerLock = jest.fn();
  const surface = { setPointerCapture: jest.fn() };
  walk.update("firstPerson", "#536bd6");
  walk.onDown({ currentTarget: surface, pointerType: "touch", pointerId: 1, clientX: 100, clientY: 100 });
  walk.onMove({ pointerType: "touch", pointerId: 1, clientX: 135, clientY: 100 });
  expect(walk.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.1);
  expect(container.requestPointerLock).not.toHaveBeenCalled();
  walk.dispose();
});

test.each(["firstPerson", "thirdPerson"])("%s keeps mouse look locked while choosing a plant action with number keys", (view) => {
  const room = { ...createInitialRoom("lounge"), items: [] };
  const plant = itemInteraction({ id: "qa-plant", kind: "plant", scaleY: 2, rotation: 0, x: PLAYER.spawn.x, z: PLAYER.spawn.z - 1.2 }, 0, false, room);
  const scene = new THREE.Scene();
  const container = document.body.appendChild(document.createElement("div"));
  container.tabIndex = 0;
  const onInteract = jest.fn();
  const walker = createWalkthrough(scene, container, {
    getRoom: () => room, getObstacles: () => [], render: jest.fn(), getInteractionTargets: () => [plant], onInteract
  });
  let owner = null;
  const changeOwner = (element) => {
    owner = element;
    document.dispatchEvent(new Event("pointerlockchange"));
  };
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => owner });
  document.exitPointerLock = jest.fn(() => changeOwner(null));
  container.requestPointerLock = jest.fn(() => changeOwner(container));
  const press = (key, code = key) => container.dispatchEvent(new KeyboardEvent("keydown", { key, code }));
  try {
    walker.update(view, room.avatarColor, true, { playing: true });
    press("Enter");
    expect(owner).toBe(container);
    press("e", "KeyE");
    expect(owner).toBe(container);
    press("1", "Digit1");
    expect(onInteract).toHaveBeenCalledWith(plant, expect.objectContaining({ id: "water" }));
    expect(owner).toBe(container);
    expect(container).toHaveFocus();

    const direction = () => walker.camera.getWorldDirection(new THREE.Vector3()).x;
    const beforeTurn = direction();
    const mouseMove = new MouseEvent("mousemove");
    Object.defineProperty(mouseMove, "movementX", { value: 35 });
    document.dispatchEvent(mouseMove);
    expect(direction()).toBeGreaterThan(beforeTurn + 0.1);
    const avatar = scene.getObjectByName("mascot");
    const beforeWalk = avatar.position.z;
    press("s", "KeyS");
    advance(100);
    expect(avatar.position.z).toBeGreaterThan(beforeWalk);
    container.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));

    walker.command("reset");
    press("e", "KeyE");
    expect(owner).toBe(container);
    press("e", "KeyE");
    expect(owner).toBe(container);
    press("e", "KeyE");
    press("2", "Digit2");
    expect(onInteract).toHaveBeenCalledWith(plant, expect.objectContaining({ id: "flowerPink" }));
    expect(owner).toBe(container);
    expect(container.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(document.exitPointerLock).not.toHaveBeenCalled();
    press("Escape");
    expect(owner).toBeNull();
  } finally {
    walker.dispose();
    delete document.pointerLockElement;
    delete document.exitPointerLock;
  }
});

test("Shift increases held movement speed and Space completes one jump even after keyup", () => {
  const { walk, container } = setup();
  const key = (type, code, repeat = false) => container.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
  walk.update("firstPerson", "#536bd6");
  key("keydown", "KeyW");
  advance(100); advance(150);
  key("keyup", "KeyW");
  const walkDistance = PLAYER.spawn.z - walk.camera.position.z;
  walk.command("reset");
  key("keydown", "ShiftLeft");
  expect(frames.size).toBe(0);
  key("keydown", "KeyW");
  advance(200); advance(250);
  key("keyup", "KeyW");
  key("keyup", "ShiftLeft");
  expect(PLAYER.spawn.z - walk.camera.position.z).toBeCloseTo(walkDistance * 1.7);

  key("keydown", "Space");
  key("keyup", "Space");
  for (let time = 300; time <= 550; time += 50) advance(time);
  const apex = walk.camera.position.y;
  expect(apex).toBeGreaterThan(PLAYER.eyeHeight + 0.5);
  key("keydown", "Space");
  advance(600);
  expect(walk.camera.position.y).toBeLessThan(apex);
  for (let time = 650; time <= 950; time += 50) {
    key("keydown", "Space", true);
    advance(time);
  }
  expect(walk.camera.position.y).toBe(PLAYER.eyeHeight);
  expect(frames.size).toBe(0);
  walk.dispose();
});


test.each(["firstPerson", "thirdPerson"])("%s requires a nearby target under the camera's aim before E can interact", (view) => {
  const room = { ...createInitialRoom("lounge"), items: [] };
  const front = lightInteraction({ x: PLAYER.spawn.x, y: 1.35, z: PLAYER.spawn.z - 1.05 });
  const back = { ...lightInteraction({ x: PLAYER.spawn.x, y: 1.35, z: PLAYER.spawn.z + 0.8 }), id: "back" };
  const container = document.createElement("div");
  const onInteract = jest.fn();
  const onInteractionChange = jest.fn();
  const walk = createWalkthrough(new THREE.Scene(), container, {
    getRoom: () => room, getObstacles: () => [], render: jest.fn(),
    getInteractionTargets: () => [back, front], onInteractionChange, onInteract
  });
  const pressE = () => container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
  try {
    walk.update(view, room.avatarColor);
    expect(onInteractionChange).toHaveBeenLastCalledWith(expect.objectContaining({ target: front }));
    pressE();
    expect(onInteract).toHaveBeenLastCalledWith(front);

    walk.command("turnRight");
    expect(onInteractionChange).toHaveBeenLastCalledWith(expect.objectContaining({ target: null }));
    pressE();
    expect(onInteract).toHaveBeenCalledTimes(1);

    for (let step = 0; step < 8; step += 1) walk.command("turnRight");
    expect(onInteractionChange).toHaveBeenLastCalledWith(expect.objectContaining({ target: back }));
    pressE();
    expect(onInteract).toHaveBeenLastCalledWith(back);
  } finally {
    walk.dispose();
  }
});

test("an unlocked play pointer can click a nearby object, but dragging from it does not activate it", () => {
  const room = { ...createInitialRoom("lounge"), items: [] };
  const target = lightInteraction({ x: PLAYER.spawn.x, y: 1.35, z: PLAYER.spawn.z - 1.05 });
  const container = document.createElement("div");
  const onInteract = jest.fn();
  const walk = createWalkthrough(new THREE.Scene(), container, {
    getRoom: () => room, getObstacles: () => [], render: jest.fn(), getInteractionTargets: () => [target], onInteract
  });
  const surface = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    setPointerCapture: jest.fn(), hasPointerCapture: () => true, releasePointerCapture: jest.fn()
  };
  const pointer = { currentTarget: surface, button: 0, pointerType: "mouse", pointerId: 1, clientX: 200, clientY: 200 };
  try {
    walk.update("firstPerson", room.avatarColor, true, { playing: true });
    walk.onDown(pointer);
    walk.onUp({ ...pointer, type: "pointerup" });
    expect(onInteract).toHaveBeenCalledWith(target);

    walk.onDown(pointer);
    walk.onMove({ ...pointer, clientX: 206 });
    walk.onUp({ ...pointer, type: "pointerup", clientX: 206 });
    expect(onInteract).toHaveBeenCalledTimes(1);
  } finally {
    walk.dispose();
  }
});

test("E toggles the nearest reachable seat and number keys change seated poses across views", () => {
  const room = createInitialRoom("lounge");
  const bench = { id: "qa-bench", kind: "bench", rotation: 0, x: PLAYER.spawn.x - 2.4, z: PLAYER.spawn.z };
  room.items = [bench];
  const target = itemInteraction(bench, 0, false, room);
  expect(itemInteraction(bench, 0, true, room)).toBeNull();
  const scene = new THREE.Scene();
  const container = document.createElement("div");
  let interaction;
  const walk = createWalkthrough(scene, container, {
    getRoom: () => room, getObstacles: () => [], render: jest.fn(),
    getInteractionTargets: () => [target], onInteractionChange: (state) => { interaction = state; }
  });
  try {
    const press = (key, code, repeat = false) => container.dispatchEvent(new KeyboardEvent("keydown", { key, code, repeat }));
    walk.update("firstPerson", room.avatarColor);
    walk.command("left");
    for (let step = 0; step < 5; step += 1) walk.command("turnLeft");
    walk.command("lookDown");
    walk.command("lookDown");
    expect(interaction.target).toBe(target);
    const direction = walk.camera.getWorldDirection(new THREE.Vector3());
    press("e", "KeyE");
    expect(walk.camera.getWorldDirection(new THREE.Vector3()).toArray()).toEqual(direction.toArray());
    expect(interaction.menu).toBeNull();
    for (let time = 50; time <= 2000; time += 50) advance(time);
    expect(interaction.target.id).toBe("current-seat");
    expect(interaction.poseChoices.map(({ id }) => id)).toEqual(["cup", "book", "empty"]);
    const avatar = scene.getObjectByName("mascot");
    expect(avatar.position.x).toBeCloseTo(bench.x + 0.48);
    press("e", "KeyE", true);
    expect(interaction.target.id).toBe("current-seat");
    press("1", "Digit1");
    expect(interaction.held).toBe("cup");
    press("2", "Numpad2");
    expect(interaction.held).toBe("book");
    walk.update("thirdPerson", room.avatarColor);
    expect(scene.getObjectByName("mascot").visible).toBe(true);
    expect(scene.getObjectByName("walk-prop").visible).toBe(true);
    press("3", "Digit3");
    expect(interaction.held).toBeNull();
    expect(scene.getObjectByName("walk-prop")).toBeUndefined();
    press("1", "Digit1");
    press("e", "KeyE");
    expect(interaction.target?.id).not.toBe("current-seat");
    expect(interaction.poseChoices).toBeNull();
    expect(interaction.held).toBe("cup");
    press("r", "KeyR");
    expect(interaction.held).toBeNull();
    walk.update("perspective", room.avatarColor);
    expect(scene.getObjectByName("walk-prop")).toBeUndefined();
  } finally {
    walk.dispose();
  }
});

test("E toggles asset menus, numbers choose drinks or garden actions and R clears held items", () => {
  const room = createInitialRoom("lounge");
  const item = { id: "qa-counter", kind: "cafeCounter", rotation: 0, x: PLAYER.spawn.x, z: PLAYER.spawn.z - 1.2 };
  room.items = [];
  const counter = itemInteraction(item, 0, false, room);
  const plant = itemInteraction({ ...item, id: "qa-plant", kind: "plant" }, 0, false, room);
  const scene = new THREE.Scene();
  const container = document.createElement("div");
  let target = counter, interaction;
  const onInteract = jest.fn();
  const walk = createWalkthrough(scene, container, {
    getRoom: () => room, getObstacles: () => [], render: jest.fn(), onInteract,
    getInteractionTargets: () => [target], onInteractionChange: (state) => { interaction = state; }
  });
  try {
    const press = (key, code) => container.dispatchEvent(new KeyboardEvent("keydown", { key, code }));
    walk.update("thirdPerson", room.avatarColor, true, { playing: true });
    expect(interaction.target.label).toBe("커피 내리기");
    const highlight = scene.getObjectByName("walk-interaction-highlight");
    expect(highlight.visible).toBe(true);
    press("e", "KeyE");
    expect(interaction.menu.target).toBe(counter);
    expect(highlight.visible).toBe(false);
    press("e", "KeyE");
    expect(interaction.menu).toBeNull();
    expect(highlight.visible).toBe(true);
    press("2", "Digit2");
    expect(interaction.held).toBeNull();
    press("e", "KeyE");
    press("2", "Digit2");
    expect(interaction.feedback).toContain("라테");
    expect(interaction.held).toBe("latte");
    expect(scene.getObjectByName("walk-prop").visible).toBe(true);
    for (let step = 0; step < 3; step += 1) walk.command("backward");
    expect(interaction.target).toBeNull();
    expect(highlight.visible).toBe(false);
    press("r", "KeyR");
    expect(interaction.held).toBeNull();
    expect(scene.getObjectByName("walk-prop")).toBeUndefined();

    target = plant;
    walk.command("reset");
    walk.command("interact");
    press("4", "Digit4");
    expect(onInteract).toHaveBeenCalledWith(plant, expect.objectContaining({ color: "#b495f0" }));
  } finally {
    walk.dispose();
  }
});

test("shared pickup waits for authority and a removed seat restores the server safe position", async () => {
  const scene = new THREE.Scene();
  const container = document.createElement("div"); container.tabIndex = 0; document.body.append(container);
  const room = { ...createInitialRoom(), items: [{ id: "sofa", kind: "sofa", x: 0, z: 0, rotation: 0 }] };
  const command = jest.fn().mockRejectedValue(new Error("연결을 확인해 주세요"));
  const actor = { memberId: "1", avatarColor: "#536bd6", position: { x: 0, y: 0, z: 8 }, yaw: 0, locomotion: "idle",
    seat: null, heldItemId: null, emote: null, pose: "relaxed" };
  let state = { type: "ROOM_SNAPSHOT", roomEpoch: "e", layoutRevision: 1, selfId: "1", participants: [actor], items: [], assets: {} };
  const runtime = { connection: { command, move: jest.fn() }, store: { getState: () => state, serverNow: () => 1000 } };
  const walk = createWalkthrough(scene, container, { getRoom: () => room, getObstacles: () => [], render: jest.fn() });
  try {
    walk.update("thirdPerson", "#536bd6"); walk.setRealtime(runtime); walk.applyRealtimeState(state);
    walk.command("greet"); await Promise.resolve(); await Promise.resolve();
    expect(command).toHaveBeenCalledWith({ action: "EMOTE", kind: "wave" });
    expect(scene.getObjectByName("greeting-hand")).toBeUndefined();
    state = { ...state, type: "ROOM_STATE", participants: [{ ...actor, heldItemId: "cookie", seat: { assetId: "sofa", slot: 0,
      position: { x: -.81, y: .335, z: .33 }, approach: { x: 0, y: 0, z: 2 }, yaw: Math.PI } }],
      items: [{ id: "cookie", kind: "cookie", remaining: .5 }] };
    walk.applyRealtimeState(state);
    expect(scene.getObjectByName("walk-prop")).toBeDefined();
    expect(scene.getObjectByName("mascot").position.y).toBeCloseTo(.381);
    state = { ...state, layoutRevision: 2, participants: [{ ...actor, position: { x: 2, y: 0, z: 8 } }], items: [] };
    walk.applyRealtimeState(state);
    expect(scene.getObjectByName("mascot").position.toArray()).toEqual([2, 0, 8]);
    expect(scene.getObjectByName("walk-prop")).toBeUndefined();
  } finally { walk.dispose(); }
});

test("rapid shared direction clicks move at walking speed and end at idle", () => {
  const { walk } = setup();
  const move = jest.fn();
  const state = { participants: [], items: [], assets: {} };
  try {
    walk.update("firstPerson", "#536bd6");
    walk.setRealtime({ connection: { move }, store: { getState: () => state, serverNow: () => 1000 } });
    const start = walk.camera.position.z;
    for (let click = 0; click < 6; click += 1) walk.command("forward");
    expect(walk.camera.position.z).toBe(start);
    advance(16);
    expect(start - walk.camera.position.z).toBeCloseTo(PLAYER.speed / 60);
    for (let time = 32; time <= 320; time += 16) advance(time);
    expect(start - walk.camera.position.z).toBeCloseTo(0.8);
    expect(move).toHaveBeenLastCalledWith(expect.objectContaining({ locomotion: "idle" }), true);
  } finally { walk.dispose(); }
});

test("shared movement ends with idle and looking around does not report walking", () => {
  const { walk, container } = setup();
  const move = jest.fn();
  const state = { participants: [], items: [], assets: {} };
  const realtime = { connection: { move }, store: { getState: () => state, serverNow: () => 1000 } };
  try {
    walk.update("firstPerson", "#536bd6"); walk.setRealtime(realtime);
    walk.command("turnRight");
    expect(move).toHaveBeenLastCalledWith(expect.objectContaining({ locomotion: "idle" }), false);
    container.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
    advance(100); advance(200);
    expect(move).toHaveBeenLastCalledWith(expect.objectContaining({ locomotion: "walking" }), false);
    container.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", bubbles: true }));
    expect(move).toHaveBeenLastCalledWith(expect.objectContaining({ locomotion: "idle" }), true);
  } finally { walk.dispose(); }
});
