import * as THREE from "three";
import { frameRoomCamera } from "./roomCamera";
import { createRoomCameraControls } from "./roomCameraControls";
import { DEFAULT_ROOM_ZOOM, scaleRoomZoom } from "./roomCameraZoom";
import { getRoomLayout } from "./roomLayout";

function setup() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const element = document.createElement("canvas");
  element.getBoundingClientRect = () => ({ width: 1000, height: 600 });
  const captures = new Set();
  element.setPointerCapture = (id) => captures.add(id);
  element.hasPointerCapture = (id) => captures.has(id);
  element.releasePointerCapture = (id) => captures.delete(id);
  const onClick = jest.fn();
  let zoom = DEFAULT_ROOM_ZOOM;
  let aspect = 1000 / 600;
  const controls = createRoomCameraControls(camera, element, {
    onChange: frame, onZoom(value) { zoom = value; frame(); }, onClick
  });
  function frame() {
    const center = frameRoomCamera(camera, { layout: getRoomLayout("boardgame"), template: "boardgame", zoom, aspect });
    controls.frame(center);
  }
  frame();
  return { camera, element, controls, onClick, frame, getZoom: () => zoom,
    resize(value) { aspect = value; frame(); } };
}

const pointer = (props = {}) => ({ button: 0, clientX: 100, clientY: 100, pointerId: 1,
  type: "pointerdown", preventDefault: jest.fn(), ...props });
const projected = (camera) => new THREE.Vector3(2, 1, 0).project(camera);

test("the initial 0.7 view is one old step wider than the previous 0.8 minimum", () => {
  expect(DEFAULT_ROOM_ZOOM).toBeCloseTo(0.8 - 0.1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const options = { layout: getRoomLayout("climbing"), template: "climbing", aspect: 1.7 };
  frameRoomCamera(camera, { ...options, zoom: 0.8 });
  const oldSpan = camera.right - camera.left;
  frameRoomCamera(camera, { ...options, zoom: DEFAULT_ROOM_ZOOM });
  expect(camera.right - camera.left).toBeCloseTo(oldSpan * 0.8 / 0.7);
});

test("recentering the fitted camera preserves the image before any interaction", () => {
  const { camera, controls } = setup();
  const center = frameRoomCamera(camera, { layout: getRoomLayout("boardgame"), template: "boardgame", zoom: 0.7, aspect: 1000 / 600 });
  const before = projected(camera);
  controls.reset(); controls.frame(center);
  expect(projected(camera).distanceTo(before)).toBeLessThan(1e-10);
});

test("drag rotates without opening the clicked activity, and zoom or resize preserves the angle", () => {
  const { camera, controls, onClick, resize } = setup();
  const before = camera.quaternion.clone();
  controls.onDown(pointer(), "activity-board");
  expect(onClick).not.toHaveBeenCalled();
  controls.onMove(pointer({ clientX: 210, clientY: 140 }));
  controls.onUp(pointer({ type: "pointerup", clientX: 210, clientY: 140 }));
  expect(camera.quaternion.angleTo(before)).toBeGreaterThan(0.1);
  expect(onClick).not.toHaveBeenCalled();
  const rotated = camera.quaternion.clone();
  controls.onWheel({ deltaY: -100, deltaMode: 0, preventDefault: jest.fn() }, 0.7);
  expect(camera.quaternion.angleTo(rotated)).toBeLessThan(1e-7);
  resize(0.65);
  expect(camera.quaternion.angleTo(rotated)).toBeLessThan(1e-7);
});

test.each([{ button: 2 }, { button: 1 }, { shiftKey: true }])("pan gesture %j follows the pointer without rotating or selecting", (modifiers) => {
  const { camera, controls, onClick } = setup();
  const before = projected(camera);
  const direction = camera.quaternion.clone();
  controls.onDown(pointer(modifiers), "sofa");
  controls.onMove(pointer({ ...modifiers, clientX: 300, clientY: 160 }));
  controls.onUp(pointer({ ...modifiers, type: "pointerup", clientX: 300, clientY: 160 }));
  const after = projected(camera);
  expect(after.x - before.x).toBeCloseTo(200 / 1000 * 2);
  expect(after.y - before.y).toBeCloseTo(-60 / 600 * 2);
  expect(camera.quaternion.angleTo(direction)).toBeLessThan(1e-7);
  expect(onClick).not.toHaveBeenCalled();
});

test("click opens a feature once while jitter, other pointers and cancelled drags cannot open it", () => {
  const { controls, onClick, element } = setup();
  controls.onDown(pointer(), "activity-board");
  controls.onMove(pointer({ clientX: 102 }));
  expect(controls.onMove(pointer({ pointerId: 2, clientX: 500 }))).toBe(false);
  controls.onUp(pointer({ type: "pointerup", clientX: 102 }));
  expect(onClick).toHaveBeenCalledWith("activity-board");
  expect(element.hasPointerCapture(1)).toBe(false);
  controls.onDown(pointer(), "music");
  controls.onUp(pointer({ type: "pointercancel" }));
  expect(onClick).toHaveBeenCalledTimes(1);
  controls.onDown(pointer(), "music");
  controls.onUp(pointer({ type: "lostpointercapture" }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("reset restores both rotation and pan even when zoom and view did not change", () => {
  const { controls, camera, frame } = setup();
  const initial = projected(camera);
  controls.onDown(pointer());
  controls.onMove(pointer({ clientX: 230, clientY: 160 }));
  controls.onUp(pointer({ type: "pointerup" }));
  controls.onDown(pointer({ button: 2 }));
  controls.onMove(pointer({ clientX: 260, clientY: 280 }));
  expect(projected(camera).distanceTo(initial)).toBeGreaterThan(0.1);
  controls.reset(); frame();
  expect(projected(camera).distanceTo(initial)).toBeLessThan(1e-10);
});

test("wheel and buttons zoom far beyond the old bounds while remaining positive and finite", () => {
  let zoom = DEFAULT_ROOM_ZOOM;
  for (let i = 0; i < 100; i += 1) zoom = scaleRoomZoom(zoom, 1 / 1.1);
  expect(zoom).toBeLessThan(0.001);
  for (let i = 0; i < 200; i += 1) zoom = scaleRoomZoom(zoom, 1.1);
  expect(zoom).toBeGreaterThan(1000);
  expect(scaleRoomZoom(zoom, Infinity)).toBe(zoom);
  expect(scaleRoomZoom(zoom, 0)).toBe(zoom);
  const { controls, camera, getZoom } = setup();
  const wheel = { deltaY: -500, deltaMode: 0, preventDefault: jest.fn() };
  for (let i = 0; i < 10; i += 1) controls.onWheel(wheel, getZoom());
  expect(getZoom()).toBeGreaterThan(1.5);
  expect(wheel.preventDefault).toHaveBeenCalledTimes(10);
  expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
  for (let i = 0; i < 20; i += 1) controls.onWheel({ ...wheel, deltaY: 500 }, getZoom());
  expect(getZoom()).toBeLessThan(0.01);
  expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
});
