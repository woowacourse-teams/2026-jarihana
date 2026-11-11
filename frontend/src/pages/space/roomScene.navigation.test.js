import * as THREE from "three";
import { createRoomScene } from "./roomScene";
import { createRoomRendering } from "./roomRendering";
import * as roomState from "./roomState";
import { pickRoomItem } from "./roomPicking";
import { createRoomLighting } from "./roomLighting";
import { getRoomLayout, PLAYER } from "./roomLayout";

jest.mock("three", () => {
  const actual = jest.requireActual("three");
  return { ...actual, WebGLRenderer: jest.fn(() => {
    const canvas = globalThis.document.createElement("canvas");
    const captured = new Set();
    canvas.setPointerCapture = (id) => captured.add(id);
    canvas.hasPointerCapture = (id) => captured.has(id);
    canvas.releasePointerCapture = (id) => captured.delete(id);
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
    return { domElement: canvas, shadowMap: {}, setPixelRatio: jest.fn(), setDrawingBufferSize: jest.fn(),
      render: jest.fn(), dispose: jest.fn(), forceContextLoss: jest.fn() };
  }) };
});
jest.mock("./roomModels", () => {
  const { Group } = jest.requireActual("three");
  const { addClubhouseSign } = jest.requireActual("./clubhouseExterior");
  const { createFurniture } = jest.requireActual("./roomModels");
  return { climbingPanelBacking: () => undefined, createFurniture: (kind) => kind === "plant" ? createFurniture(kind) : new Group(), createRoomShell: () => {
    const shell = new Group();
    const island = new Group();
    island.name = "floating-island";
    ["island-lawn", "entrance-path", "island-earth-layer", "island-rock-core", "island-clouds"].forEach((name) => {
      const part = new Group(); part.name = name; island.add(part);
    });
    const context = new Group(); context.userData.entrance = true;
    const entrance = new Group(); entrance.name = "building-entrance"; entrance.userData.exteriorDetail = true;
    const facade = new Group(); facade.name = "clubhouse-exterior-facade"; facade.userData.exteriorDetail = true;
    addClubhouseSign(facade, 10.5, 1.35, -2, 3.88, 5.64);
    addClubhouseSign(entrance, 2.5, 0.23, -2, 2.55, 5.245, true);
    const roof = new Group(); roof.name = "clubhouse-exterior-roof"; roof.userData.exteriorOnly = true;
    const terraceEdge = new Group(); terraceEdge.name = "terrace-front-coping"; terraceEdge.userData.terraceEdging = true;
    const terracePaver = new Group(); terracePaver.name = "terrace-stone-paver";
    context.add(island, entrance, facade, roof, terraceEdge, terracePaver);
    const ceiling = new Group(); ceiling.name = "building-ceiling"; ceiling.userData.walkthroughOnly = true;
    const wall = new Group(); wall.name = "cutaway-wall"; wall.userData.walkthroughOnly = true; wall.userData.buildingWall = true;
    shell.add(context, ceiling, wall);
    return shell;
  },
    createMascot: () => new Group(),
    disposeObject: jest.fn() };
});
jest.mock("./roomLighting", () => ({ createRoomLighting: jest.fn((scene) => {
  const { DirectionalLight } = jest.requireActual("three");
  const light = new DirectionalLight();
  light.name = "room-sun-moonlight";
  scene.add(light);
  return jest.fn();
}) }));
jest.mock("./roomRendering", () => ({ createRoomRendering: jest.fn((renderer, scene) => ({
  render: (camera) => renderer.render(scene, camera), prepareFlight: jest.fn(), resize: jest.fn(), dispose: jest.fn()
})) }));
jest.mock("./roomPicking", () => ({ pickRoomItem: jest.fn() }));

let runtime;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect() {}, fillText() {}, measureText: () => ({ width: 100 }) });
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
});
afterEach(() => { runtime?.dispose(); runtime = undefined; jest.restoreAllMocks(); });

function setup(editable = false) {
  const container = document.createElement("div");
  container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
  const callbacks = { canEdit: () => editable, onSelect: jest.fn(), onMove: jest.fn(), onInvalid: jest.fn(), onZoomChange: jest.fn(), onWalkInteraction: jest.fn() };
  const room = roomState.createInitialRoom();
  runtime = createRoomScene(container, callbacks);
  runtime.update(room, null, "perspective", 0.7);
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const canvas = renderer.domElement;
  const camera = () => renderer.render.mock.calls.at(-1)[1];
  const send = (type, values = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, pointerType: "mouse", pointerId: 1, clientX: 100, clientY: 100, ...values });
    canvas.dispatchEvent(event);
    return event;
  };
  return { room, callbacks, camera, send, container };
}

test.each(["firstPerson", "thirdPerson"])("%s waters the selected pot and recolors its existing petals", (view) => {
  const { room, callbacks, container } = setup();
  const plant = { id: "test-plant", kind: "plant", x: PLAYER.spawn.x, z: PLAYER.spawn.z - 1.2, rotation: 0, scaleY: 1.4 };
  const nextRoom = { ...room, items: [plant] };
  runtime.update(nextRoom, null, view, 0.7);
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const scene = renderer.render.mock.calls.at(-1)[0];
  const pot = scene.getObjectByProperty("name", "plant");
  const petals = pot.getObjectsByProperty("name", "plant-petal");
  const positions = petals.map((petal) => petal.getWorldPosition(new THREE.Vector3()).toArray());
  const initialColors = petals.map(({ material }) => material.color.getHexString());
  expect(petals).toHaveLength(5);
  const press = (key, code) => container.dispatchEvent(new KeyboardEvent("keydown", { key, code }));

  press("e", "KeyE");
  expect(callbacks.onWalkInteraction).toHaveBeenLastCalledWith(expect.objectContaining({
    menu: expect.objectContaining({ target: expect.objectContaining({ id: plant.id }) })
  }));
  press("1", "Digit1");
  const plantBase = roomState.placedItemElevation(plant, nextRoom);
  const plantHeight = roomState.footprint(plant).height * plant.scaleY;
  const plantTop = plantBase + plantHeight;
  const water = scene.getObjectByName("walk-plant-water");
  expect(water?.position.toArray()).toEqual([plant.x, plantTop, plant.z]);

  press("e", "KeyE");
  press("4", "Digit4");
  expect(pot.getObjectsByProperty("name", "plant-petal")).toEqual(petals);
  expect(petals.map((petal) => petal.getWorldPosition(new THREE.Vector3()).toArray())).toEqual(positions);
  expect(petals.every(({ material }) => material.color.getHexString() === "b495f0")).toBe(true);
  expect(scene.getObjectByName("walk-flower-blooms")).toBeUndefined();
  runtime.update(nextRoom, null, "perspective", 0.7);
  expect(petals.map(({ material }) => material.color.getHexString())).toEqual(initialColors);
});

test("a template switch leaves a frame for its loading indicator before drawing the new scene", () => {
  const { callbacks } = setup(true);
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  callbacks.onTemplateTransition = jest.fn();
  const frames = [];
  window.requestAnimationFrame.mockImplementation((callback) => frames.push(callback));
  renderer.render.mockClear();

  runtime.update(roomState.createInitialRoom("climbing"), null, "perspective", 0.7);
  expect(callbacks.onTemplateTransition.mock.calls).toEqual([[true]]);
  frames.shift()(0);
  expect(renderer.render).not.toHaveBeenCalled();
  frames.shift()(16);
  expect(renderer.render).not.toHaveBeenCalled();
  expect(callbacks.onTemplateTransition.mock.calls).toEqual([[true]]);
  frames.shift()(32);
  expect(renderer.render).toHaveBeenCalledTimes(1);
  expect(callbacks.onTemplateTransition.mock.calls).toEqual([[true], [false]]);
});

test("renaming a group updates both LED textures on the existing building", () => {
  const fillText = jest.fn();
  HTMLCanvasElement.prototype.getContext.mockReturnValue({ fillRect() {}, fillText, measureText: () => ({ width: 100 }) });
  const { room, callbacks } = setup();
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const scene = renderer.render.mock.calls.at(-1)[0];
  const sign = scene.getObjectByName("exterior-tenant-lettering");
  const plaque = scene.getObjectByName("entry-led-sign");
  expect(sign.userData.signName).toBe(room.name);
  expect(sign.material).toMatchObject({ isMeshBasicMaterial: true, toneMapped: false });
  const dispose = jest.spyOn(sign.material.map, "dispose");
  callbacks.getSignName = () => "함께하는 게임 모임";
  fillText.mockClear();
  runtime.update(room, null, "perspective", 0.7);
  expect(scene.getObjectByName(sign.name)).toBe(sign);
  expect(scene.getObjectByName(plaque.name)).toBe(plaque);
  expect(fillText.mock.calls.map(([label]) => label)).toEqual(["함께하는 게임 모임", "함께하는 게임 모임"]);
  expect(dispose).toHaveBeenCalledTimes(1);
  fillText.mockClear();
  runtime.update(room, null, "perspective", 0.7);
  expect(fillText).not.toHaveBeenCalled();
});

test("a wide name scrolls across both front signs without replacing their textures", () => {
  const { room, callbacks } = setup();
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const scene = renderer.render.mock.calls.at(-1)[0];
  const signs = ["exterior-tenant-lettering", "entry-led-sign"].map((name) => scene.getObjectByName(name));
  const name = "함께 모여 취미를 나누는 주말 클라이밍 동아리";
  HTMLCanvasElement.prototype.getContext.mockReturnValue({
    fillRect() {}, fillText() {}, measureText: (text) => ({ width: text === name ? 1800 : 100 })
  });
  callbacks.getSignName = () => name;
  let time = 0;
  window.requestAnimationFrame.mockImplementation((callback) => { callback(time += 48); return 0; });
  runtime.update(room, null, "front", 0.7);
  const textures = signs.map((sign) => sign.material.map);
  const offsets = textures.map((texture) => texture.offset.x);
  const versions = textures.map((texture) => texture.version);
  runtime.update(room, null, "front", 0.7);
  signs.forEach((sign, index) => {
    expect(sign.material.map).toBe(textures[index]);
    expect(sign.material.map.repeat.x).toBeLessThan(1);
    expect(sign.material.map.offset.x).toBeGreaterThan(offsets[index]);
    expect(sign.material.map.version).toBe(versions[index]);
  });

  callbacks.getSignName = () => "주말 암장";
  runtime.update(room, null, "front", 0.7);
  signs.forEach((sign) => {
    expect(sign.material.map.offset.x).toBe(0);
    expect(sign.material.map.repeat.x).toBe(1);
  });
});

test("read-only object drag rotates the actual scene and only an unmoved click opens its feature", () => {
  const { camera, send, callbacks } = setup();
  pickRoomItem.mockReturnValue("music-console");
  const before = camera().quaternion.clone();
  send("pointerdown");
  send("pointermove", { clientX: 260, clientY: 160 });
  send("pointerup", { clientX: 260, clientY: 160 });
  expect(camera().quaternion.angleTo(before)).toBeGreaterThan(0.1);
  expect(callbacks.onSelect).not.toHaveBeenCalled();
  send("pointerdown"); send("pointerup");
  expect(callbacks.onSelect).toHaveBeenCalledWith("music-console");
});

test("detail preview rotates without taking scroll or opening items, and can hide the exterior at the same angle", () => {
  jest.replaceProperty(window, "devicePixelRatio", 2);
  const { room, camera, send, callbacks } = setup();
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  callbacks.showPreviewExterior = jest.fn(() => true);
  runtime.update(room, null, "front", 1);
  const [scene] = renderer.render.mock.calls.at(-1);
  const roof = scene.getObjectByName("clubhouse-exterior-roof");
  const before = camera().quaternion.clone();
  const origin = camera().position.clone();
  expect(roof.visible).toBe(true);

  send("pointerdown");
  send("pointermove", { clientX: 170, clientY: 140 });
  send("pointerup");
  const rotated = camera().quaternion.clone();
  expect(rotated.angleTo(before)).toBeGreaterThan(0.1);
  expect(camera().position).toEqual(origin);
  expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
  expect(renderer.setDrawingBufferSize).toHaveBeenCalledWith(1000, 600, 1.5);
  send("pointerdown"); send("pointerup");
  expect(callbacks.onSelect).not.toHaveBeenCalled();
  expect(send("wheel", { deltaY: 100 }).defaultPrevented).toBe(false);

  callbacks.showPreviewExterior.mockReturnValue(false);
  runtime.update(room, null, "front", 1);
  expect(roof.visible).toBe(false);
  expect(camera().quaternion.angleTo(rotated)).toBeLessThan(1e-7);
});

test("detail WASD moves in the view's horizontal directions and drag turns in place", () => {
  const { room, camera, container, send } = setup();
  runtime.update(room, null, "front", 1);
  const initial = camera().position.clone();
  const angle = camera().quaternion.clone();
  const forward = () => camera().getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const initialForward = forward();
  const sendKey = (type, code, options) => {
    const event = new KeyboardEvent(type, { code, key: code, cancelable: true, ...options });
    container.dispatchEvent(event);
    return event;
  };
  let nextFrame;
  window.requestAnimationFrame.mockImplementation((callback) => { nextFrame = callback; return 1; });
  const step = (time) => { const frame = nextFrame; nextFrame = undefined; frame(time); };

  expect(sendKey("keydown", "KeyW", { metaKey: true }).defaultPrevented).toBe(false);
  expect(sendKey("keydown", "KeyW").defaultPrevented).toBe(true);
  expect(camera().isPerspectiveCamera).toBe(true);
  step(0);
  expect(camera().position.clone().sub(initial).dot(initialForward)).toBeGreaterThan(0);
  for (const time of [40, 80, 120, 160, 200]) step(time);
  const closer = camera().position.clone();
  expect(camera().isPerspectiveCamera).toBe(true);
  expect(closer.clone().sub(initial).dot(initialForward)).toBeGreaterThan(1.5);
  expect(closer.y).toBeCloseTo(initial.y);
  expect(camera().quaternion.angleTo(angle)).toBeLessThan(1e-7);

  sendKey("keyup", "KeyW");
  step(216);
  expect(camera().position).toEqual(closer);
  expect(nextFrame).toBeUndefined();

  const spanAt = (depth) => {
    const point = closer.clone().addScaledVector(initialForward, depth);
    const right = new THREE.Vector3().setFromMatrixColumn(camera().matrixWorld, 0);
    return point.clone().add(right).project(camera()).x - point.project(camera()).x;
  };
  const nearBefore = spanAt(6);
  const farBefore = spanAt(12);
  sendKey("keydown", "KeyS");
  step(240);
  expect(camera().position.clone().sub(closer).dot(initialForward)).toBeLessThan(0);
  expect(spanAt(6) / nearBefore).toBeLessThan(spanAt(12) / farBefore);
  sendKey("keyup", "KeyS");
  step(256);

  const beforeTurn = camera().position.clone();
  send("pointerdown"); send("pointermove", { clientX: 220 }); send("pointerup");
  step(280);
  expect(camera().position).toEqual(beforeTurn);
  expect(camera().quaternion.angleTo(angle)).toBeGreaterThan(0.2);
  const right = new THREE.Vector3().setFromMatrixColumn(camera().matrixWorld, 0);
  sendKey("keydown", "KeyD");
  step(300);
  expect(camera().position.clone().sub(beforeTurn).dot(right)).toBeGreaterThan(0.1);
  sendKey("keyup", "KeyD");
  const beforeLeft = camera().position.clone();
  sendKey("keydown", "KeyA");
  step(320);
  expect(camera().position.clone().sub(beforeLeft).dot(right)).toBeLessThan(-0.1);
  container.dispatchEvent(new FocusEvent("blur"));
  const stopped = camera().position.clone();
  step(336);
  expect(camera().position).toEqual(stopped);
  expect(nextFrame).toBeUndefined();

  sendKey("keydown", "KeyQ");
  step(352);
  expect(camera().position.y).toBeLessThan(stopped.y);
  for (let time = 402; time <= 2752; time += 50) step(time);
  expect(camera().position.x).toBeCloseTo(stopped.x);
  expect(camera().position.z).toBeCloseTo(stopped.z);
  expect(camera().position.y).toBeCloseTo(0.35);
  sendKey("keyup", "KeyQ");
  sendKey("keydown", "KeyE");
  step(2768);
  expect(camera().position.y).toBeGreaterThan(0.35);
  sendKey("keyup", "KeyE");

  expect(sendKey("keydown", "Home").defaultPrevented).toBe(true);
  step(2784);
  expect(camera().isPerspectiveCamera).toBe(true);
  expect(camera().position.distanceTo(initial)).toBeLessThan(1e-7);
});

test("detail lens can narrow and widen without moving the camera and survives reopening the detail", () => {
  const { room, camera, send } = setup();
  runtime.update(room, null, "front", 1);
  const position = camera().position.clone();
  const orientation = camera().quaternion.clone();
  const defaultFov = camera().fov;

  runtime.setPreviewWideAngle(-1);
  expect(camera().isPerspectiveCamera).toBe(true);
  expect(camera().fov).toBeLessThan(defaultFov);
  expect(camera().position).toEqual(position);
  runtime.setPreviewWideAngle(1);
  const wideFov = camera().fov;
  expect(wideFov).toBeGreaterThan(defaultFov);
  expect(camera().position).toEqual(position);
  expect(camera().quaternion.angleTo(orientation)).toBeLessThan(1e-7);

  send("pointerdown"); send("pointermove", { clientX: 175 }); send("pointerup");
  expect(camera().quaternion.angleTo(orientation)).toBeGreaterThan(0.1);

  runtime.update(room, null, "perspective", 1);
  expect(camera().isOrthographicCamera).toBe(true);
  runtime.update(room, null, "front", 1);
  expect(camera().fov).toBeCloseTo(wideFov);
  runtime.setPreviewWideAngle(0);
  expect(camera().fov).toBeCloseTo(defaultFov);
  expect(camera().position).toEqual(position);
});

test("editor turn and wide framing share the orbit camera without changing the detail lens", () => {
  const { room, camera } = setup(true);
  const baseSpan = camera().right - camera().left;
  const orientation = camera().quaternion.clone();
  const position = camera().position.clone();

  runtime.setStudioWideAngle(100);
  expect(camera().isOrthographicCamera).toBe(true);
  expect(camera().right - camera().left).toBeCloseTo(baseSpan * 1.35);
  expect(camera().position.distanceTo(position)).toBeLessThan(1e-7);
  runtime.turnStudioCamera(1);
  expect(camera().quaternion.angleTo(orientation)).toBeGreaterThan(0.7);
  runtime.turnStudioCamera(-1);
  expect(camera().quaternion.angleTo(orientation)).toBeLessThan(1e-7);

  runtime.update(room, null, "front", 1);
  const front = camera().clone();
  runtime.setStudioWideAngle(0);
  runtime.turnStudioCamera(1);
  expect(camera().position).toEqual(front.position);
  expect(camera().quaternion.angleTo(front.quaternion)).toBeLessThan(1e-7);
  expect(camera().fov).toBe(front.fov);
  runtime.update(room, null, "perspective", 0.7, "all", 1);
  expect(camera().right - camera().left).toBeCloseTo(baseSpan);
  expect(camera().quaternion.angleTo(orientation)).toBeLessThan(1e-7);
});

test("right-drag over furniture pans while left-drag keeps the furniture editing path", () => {
  const { camera, send, callbacks } = setup(true);
  pickRoomItem.mockReturnValue("sofa");
  const before = camera().position.clone();
  const orientation = camera().quaternion.clone();
  send("pointerdown", { button: 2 });
  send("pointermove", { button: 2, clientX: 180, clientY: 150 });
  send("pointerup", { button: 2 });
  expect(camera().position.distanceTo(before)).toBeGreaterThan(1);
  expect(camera().quaternion.angleTo(orientation)).toBeLessThan(1e-7);
  expect(callbacks.onSelect).not.toHaveBeenCalled();
  expect(callbacks.onMove).not.toHaveBeenCalled();
  const panned = camera().position.clone();
  send("pointerdown");
  send("pointermove", { clientX: 110 });
  send("pointerup", { clientX: 110 });
  expect(callbacks.onSelect).toHaveBeenCalledWith("sofa");
  expect(callbacks.onMove.mock.calls.length + callbacks.onInvalid.mock.calls.length).toBe(1);
  expect(camera().position.distanceTo(panned)).toBeLessThan(1e-7);
});

test("wheel feeds the UI without resetting pan; repeated explicit reset restores the camera; dispose detaches controls", () => {
  const { room, camera, send, callbacks } = setup();
  const initial = camera().position.clone();
  send("pointerdown", { shiftKey: true });
  send("pointermove", { clientX: 180 }); send("pointerup");
  const panned = camera().position.clone();
  const wheel = send("wheel", { deltaY: -600, deltaMode: 0 });
  expect(wheel.defaultPrevented).toBe(true);
  const zoom = callbacks.onZoomChange.mock.calls.at(-1)[0];
  expect(zoom).toBeGreaterThan(1.5);
  runtime.update(room, null, "perspective", zoom);
  expect(camera().position.distanceTo(panned)).toBeLessThan(1e-7);
  runtime.update(room, null, "perspective", 0.7, "all", 1);
  expect(camera().position.distanceTo(initial)).toBeLessThan(1e-7);
  send("pointerdown", { button: 2 }); send("pointermove", { clientX: 200 }); send("pointerup");
  runtime.update(room, null, "perspective", 0.7, "all", 2);
  expect(camera().position.distanceTo(initial)).toBeLessThan(1e-7);
  runtime.dispose(); runtime = undefined;
  callbacks.onZoomChange.mockClear();
  send("wheel", { deltaY: -300, deltaMode: 0 });
  expect(callbacks.onZoomChange).not.toHaveBeenCalled();
});

test("camera-only input reuses shadows and buffers while room lighting invalidates shadows", () => {
  const { room, send, callbacks } = setup();
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  expect(renderer.shadowMap).toMatchObject({ autoUpdate: false, needsUpdate: true });
  renderer.shadowMap.needsUpdate = false;
  send("pointerdown");
  send("pointermove", { clientX: 260, clientY: 160 });
  send("pointerup");
  send("wheel", { deltaY: -350, deltaMode: 0 });
  const zoom = callbacks.onZoomChange.mock.calls.at(-1)[0];
  runtime.update(room, null, "perspective", zoom);
  expect(renderer.shadowMap.needsUpdate).toBe(false);
  expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);

  runtime.setGeneralLighting(false);
  expect(renderer.shadowMap.needsUpdate).toBe(true);
});

test("camera changes reuse item elevations and moving a platform updates the instrument it supported", () => {
  const { room } = setup();
  const platform = { id: "stage", kind: "rehearsalStage", x: 3, z: 0, rotation: 0 };
  const drums = { id: "drums", kind: "drumKit", x: 3, z: -0.3, rotation: 0 };
  const stageRoom = { ...room, items: [platform, drums] };
  runtime.update(stageRoom, null, "perspective", 0.7);
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const [scene] = renderer.render.mock.calls.at(-1);
  let instrument;
  scene.traverse((object) => {
    if (object.userData.itemId === drums.id) instrument = object;
  });
  expect(instrument.position.y).toBeCloseTo(0.25);

  const calculateElevation = jest.spyOn(roomState, "placedItemElevation");
  runtime.update(stageRoom, null, "front", 0.7);
  expect(calculateElevation).not.toHaveBeenCalled();

  runtime.update({ ...stageRoom, items: [{ ...platform, x: -6 }, drums] }, null, "front", 0.7);
  expect(instrument.position.y).toBe(0);
});

test("both camera transitions keep the settled pixel ratio throughout the flight", () => {
  jest.replaceProperty(window, "devicePixelRatio", 2);
  const { room, camera } = setup();
  runtime.setPreviewWideAngle(25);
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const rect = { left: 0, top: 0, width: 1000, height: 600 };
  const finish = jest.fn();
  let nextFrame;
  window.requestAnimationFrame.mockImplementation((callback) => {
    nextFrame = callback;
    return 1;
  });

  for (const view of ["front", "perspective"]) {
    runtime.update(room, null, view, 1, "all", 0, {
      from: rect, duration: 720, getTargetRect: () => rect, finish
    });
    nextFrame(0);
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(1000, 600, 1.5);
    nextFrame(720);
    const point = new THREE.Vector3(1, 2, 3);
    const flightEnd = point.clone().project(camera());
    runtime.update(room, null, view, 1);
    nextFrame(736);
    expect(point.clone().project(camera()).distanceTo(flightEnd)).toBeLessThan(1e-7);
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(1000, 600, 1.5);
  }
  expect(finish).toHaveBeenCalledTimes(2);
  expect(renderer.setDrawingBufferSize).not.toHaveBeenCalledWith(1000, 600, 1);
});

test("web hero lets scroll and context menu pass and cannot move objects before expanding", () => {
  const { room, camera, callbacks, send } = setup(true);
  callbacks.canInteract = () => false;
  runtime.update(room, null, "front", 1);
  const before = camera().position.clone();
  expect(send("wheel", { deltaY: -300, deltaMode: 0 }).defaultPrevented).toBe(false);
  expect(send("contextmenu").defaultPrevented).toBe(false);
  send("pointerdown"); send("pointermove", { clientX: 220 }); send("pointerup");
  expect(callbacks.onSelect).not.toHaveBeenCalled();
  expect(callbacks.onMove).not.toHaveBeenCalled();
  expect(callbacks.onZoomChange).not.toHaveBeenCalled();
  expect(camera().position.distanceTo(before)).toBeLessThan(1e-7);
  callbacks.canInteract = () => true;
  runtime.update(room, null, "perspective", 0.7);
  expect(send("wheel", { deltaY: -300, deltaMode: 0 }).defaultPrevented).toBe(true);
  expect(callbacks.onZoomChange).toHaveBeenCalledTimes(1);
});

test("frontage shows the exterior and restores the open interior and full yard on expansion", () => {
  const { room, callbacks } = setup();
  const outdoorItem = { ...room.items.find((item) => item.kind === "plant"), id: "outdoor-plant", kind: "plant", x: 13, z: 10, level: 0, rotation: 0 };
  const furnishedRoom = { ...room, items: [...room.items, outdoorItem] };
  const saved = JSON.stringify(furnishedRoom);
  callbacks.canInteract = () => false;
  runtime.update(furnishedRoom, null, "front", 1);
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const scene = renderer.render.mock.calls.at(-1)[0];
  const island = scene.getObjectByName("floating-island");
  const terraceEdge = scene.getObjectByName("terrace-front-coping");
  const terracePaver = scene.getObjectByName("terrace-stone-paver");
  const entrance = scene.getObjectByName("building-entrance");
  const facade = scene.getObjectByName("clubhouse-exterior-facade");
  const roof = scene.getObjectByName("clubhouse-exterior-roof");
  const ceiling = scene.getObjectByName("building-ceiling");
  const wall = scene.getObjectByName("cutaway-wall");
  const updateLighting = createRoomLighting.mock.results.at(-1).value;
  const { building, terrace } = getRoomLayout(furnishedRoom);
  const lighting = { generalLighting: true, building, terrace };
  let outdoor;
  scene.traverse((object) => { if (object.userData.itemId === outdoorItem.id) outdoor = object; });
  expect(island.visible).toBe(false);
  expect(scene.getObjectByName("web-diorama-base")).toBeUndefined();
  expect(terraceEdge.visible).toBe(false);
  expect(terracePaver.visible).toBe(true);
  expect(entrance.visible).toBe(true);
  expect(ceiling.visible).toBe(false);
  expect(facade.visible).toBe(true);
  expect(roof.visible).toBe(true);
  expect(wall.visible).toBe(true);
  expect(updateLighting).toHaveBeenLastCalledWith(furnishedRoom.atmosphere, scene, true, furnishedRoom.template, lighting);
  expect(outdoor.visible).toBe(false);

  callbacks.canInteract = () => true;
  runtime.update(furnishedRoom, null, "perspective", 0.7);
  expect(island.visible).toBe(true);
  expect(terraceEdge.visible).toBe(true);
  expect(entrance.visible).toBe(false);
  expect(ceiling.visible).toBe(false);
  expect(facade.visible).toBe(false);
  expect(roof.visible).toBe(false);
  expect(wall.visible).toBe(false);
  expect(updateLighting).toHaveBeenLastCalledWith(furnishedRoom.atmosphere, scene, false, furnishedRoom.template, lighting);
  expect(outdoor.visible).toBe(true);
  for (const name of ["island-earth-layer", "island-rock-core", "island-clouds"]) {
    expect(island.getObjectByName(name).visible).toBe(true);
  }
  runtime.update(furnishedRoom, null, "front", 1);
  expect(terraceEdge.visible).toBe(false);
  expect(roof.visible).toBe(true);
  expect(ceiling.visible).toBe(false);
  expect(updateLighting).toHaveBeenLastCalledWith(furnishedRoom.atmosphere, scene, true, furnishedRoom.template, lighting);
  expect(JSON.stringify(furnishedRoom)).toBe(saved);
});

test("live board captions and memory textures replace snapshots, clear on errors, and do not mutate saved room", () => {
  const loads = [];
  jest.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation((source, onLoad) => {
    const texture = new THREE.Texture();
    texture.image = { width: 640, height: 480 };
    loads.push({ source, onLoad, texture });
    return texture;
  });
  const text = jest.fn();
  HTMLCanvasElement.prototype.getContext.mockReturnValue({ fillRect() {}, fillText: text, measureText: () => ({ width: 100 }) });
  const { room, send, callbacks } = setup();
  const savedRoom = { ...room, items: [...room.items.filter((item) => item.kind !== "memory"),
    { id: "linked-memory", kind: "memory", x: 0, z: 0, rotation: 0, title: "private snapshot", photo: "snapshot-photo", link: "/groups/7?activity=12" }] };
  const saved = JSON.stringify(savedRoom);
  const record = { id: 12, title: "Our actual activity", photo: "authorized-photo", link: "/groups/7?activity=12" };
  runtime.setActivityExhibit({ status: "ready", records: [record] });
  runtime.update(savedRoom, null, "perspective", 0.7);
  expect(loads.some(({ source }) => source === "authorized-photo")).toBe(true);
  expect(loads.some(({ source }) => source === "snapshot-photo")).toBe(false);
  expect(text.mock.calls.some(([label]) => label === record.title)).toBe(true);
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const scene = renderer.render.mock.calls.at(-1)[0];
  const slot = scene.getObjectByName("activity-exhibit-slot");
  expect(slot.userData.memoryId).toEqual({ kind: "memory", title: record.title, link: record.link });
  const actualPick = jest.requireActual("./roomPicking").pickRoomItem;
  expect(actualPick([{ object: slot.children.at(-1) }], false)).toEqual(slot.userData.memoryId);
  expect(typeof actualPick([{ object: slot.children.at(-1) }], true)).toBe("string");
  pickRoomItem.mockReturnValue(slot.userData.memoryId);
  send("pointerdown"); send("pointerup");
  expect(callbacks.onSelect).toHaveBeenCalledWith(slot.userData.memoryId);
  const loadCount = loads.length;
  runtime.setActivityExhibit({ status: "ready", records: [{ ...record }] });
  expect(loads).toHaveLength(loadCount);
  text.mockClear();
  runtime.setActivityExhibit({ status: "error", records: [record] });
  expect(scene.getObjectByName("activity-exhibit-slot")).toBeUndefined();
  expect(text.mock.calls.some(([label]) => label === "활동을 불러오지 못했어요")).toBe(true);
  expect(loads).toHaveLength(loadCount);
  const lateLoad = loads.find(({ source }) => source === "authorized-photo");
  const dispose = jest.spyOn(lateLoad.texture, "dispose");
  lateLoad.onLoad(lateLoad.texture);
  expect(dispose).toHaveBeenCalled();
  expect(JSON.stringify(savedRoom)).toBe(saved);
});


test("template loading remains active until shader preparation and the first ready frame complete", async () => {
  const { callbacks } = setup(true);
  callbacks.onTemplateTransition = jest.fn();
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const rendering = createRoomRendering.mock.results.at(-1).value;
  let resolveCompilation;
  rendering.compile = jest.fn(() => new Promise((resolve) => { resolveCompilation = resolve; }));
  rendering.prepareAssets = jest.fn();
  const frames = [];
  window.requestAnimationFrame.mockImplementation((callback) => { frames.push(callback); return frames.length; });
  renderer.render.mockClear();
  runtime.update(roomState.createInitialRoom("climbing"), null, "perspective", 0.7);
  while (frames.length) frames.shift()(0);
  expect(rendering.compile).toHaveBeenCalledTimes(1);
  expect(renderer.render).not.toHaveBeenCalled();
  expect(callbacks.onTemplateTransition.mock.calls).toEqual([[true]]);
  resolveCompilation(); await Promise.resolve();
  expect(rendering.prepareAssets).toHaveBeenCalledTimes(1);
  expect(callbacks.onTemplateTransition.mock.calls).toEqual([[true]]);
  while (frames.length) frames.shift()(16);
  expect(renderer.render).toHaveBeenCalledTimes(1);
  expect(callbacks.onTemplateTransition.mock.calls).toEqual([[true], [false]]);
});

test("a superseded or disposed room cannot release a newer template loader", async () => {
  const { callbacks } = setup(true);
  callbacks.onTemplateTransition = jest.fn();
  const rendering = createRoomRendering.mock.results.at(-1).value;
  const resolves = [];
  rendering.compile = jest.fn(() => new Promise((resolve) => { resolves.push(resolve); }));
  rendering.prepareAssets = jest.fn();
  const frames = [];
  window.requestAnimationFrame.mockImplementation((callback) => { frames.push(callback); return frames.length; });
  runtime.update(roomState.createInitialRoom("climbing"), null, "perspective", 0.7);
  while (frames.length) frames.shift()(0);
  runtime.update(roomState.createInitialRoom("boardgame"), null, "perspective", 0.7);
  while (frames.length) frames.shift()(16);
  resolves[0](); await Promise.resolve();
  expect(rendering.prepareAssets).not.toHaveBeenCalled();
  expect(callbacks.onTemplateTransition).not.toHaveBeenCalledWith(false);
  runtime.dispose(); runtime = undefined;
  resolves[1](); await Promise.resolve();
  expect(rendering.prepareAssets).not.toHaveBeenCalled();
});

test("a superseded compilation failure cannot cancel a template waiting for its loading paint", async () => {
  const { callbacks } = setup(true);
  callbacks.onError = jest.fn();
  callbacks.onTemplateTransition = jest.fn();
  const rendering = createRoomRendering.mock.results.at(-1).value;
  let rejectCompilation;
  rendering.compile = jest.fn(() => new Promise((resolve, reject) => { rejectCompilation = reject; }));
  rendering.prepareAssets = jest.fn();
  const frames = [];
  window.requestAnimationFrame.mockImplementation((callback) => { frames.push(callback); return frames.length; });
  runtime.update(roomState.createInitialRoom("climbing"), null, "perspective", 0.7);
  while (frames.length) frames.shift()(0);
  runtime.update(roomState.createInitialRoom("boardgame"), null, "perspective", 0.7);
  rejectCompilation(new Error("superseded shader"));
  await Promise.resolve(); await Promise.resolve();
  expect(callbacks.onError).not.toHaveBeenCalled();
  expect(callbacks.onTemplateTransition).not.toHaveBeenCalledWith(false);
  while (frames.length) frames.shift()(16);
  expect(rendering.compile).toHaveBeenCalledTimes(2);
});

test("a lost WebGL context invalidates outstanding asset preparation", async () => {
  const { callbacks } = setup(true);
  callbacks.onError = jest.fn();
  callbacks.onTemplateTransition = jest.fn();
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const rendering = createRoomRendering.mock.results.at(-1).value;
  let resolveCompilation;
  rendering.compile = jest.fn(() => new Promise((resolve) => { resolveCompilation = resolve; }));
  rendering.prepareAssets = jest.fn();
  const frames = [];
  window.requestAnimationFrame.mockImplementation((callback) => { frames.push(callback); return frames.length; });
  runtime.update(roomState.createInitialRoom("climbing"), null, "perspective", 0.7);
  while (frames.length) frames.shift()(0);
  renderer.domElement.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
  resolveCompilation(); await Promise.resolve();
  expect(rendering.prepareAssets).not.toHaveBeenCalled();
});

test("returning to the preparing template before a queued switch paints eventually releases loading", async () => {
  const { callbacks } = setup(true);
  callbacks.onTemplateTransition = jest.fn();
  const renderer = THREE.WebGLRenderer.mock.results.at(-1).value;
  const rendering = createRoomRendering.mock.results.at(-1).value;
  const resolves = [];
  rendering.compile = jest.fn(() => new Promise((resolve) => { resolves.push(resolve); }));
  rendering.prepareAssets = jest.fn();
  const frames = [];
  window.requestAnimationFrame.mockImplementation((callback) => { frames.push(callback); return frames.length; });
  const climbing = roomState.createInitialRoom("climbing");
  runtime.update(climbing, null, "perspective", 0.7);
  while (frames.length) frames.shift()(0);
  expect(rendering.compile).toHaveBeenCalledTimes(1);
  renderer.render.mockClear();

  runtime.update(roomState.createInitialRoom("boardgame"), null, "perspective", 0.7);
  runtime.update(climbing, null, "perspective", 0.7);
  while (frames.length) frames.shift()(16);
  for (const resolve of resolves) resolve();
  await Promise.resolve();
  while (frames.length) frames.shift()(32);

  expect(rendering.prepareAssets).toHaveBeenCalledTimes(1);
  expect(renderer.render).toHaveBeenCalledTimes(1);
  expect(callbacks.onTemplateTransition).toHaveBeenLastCalledWith(false);
});
