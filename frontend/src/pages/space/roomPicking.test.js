import * as THREE from "three";
import { pickRoomItem } from "./roomPicking";

function asset(id, child) {
  const group = new THREE.Group();
  group.userData.itemId = id;
  group.add(child);
  return group;
}

test("a camera-facing functional label selects its asset before furniture behind it", () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 30);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  const marker = new THREE.Sprite(new THREE.SpriteMaterial());
  const dashboard = asset("dashboard", marker);
  const behind = asset("sofa", new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  behind.position.z = -2;
  dashboard.updateMatrixWorld(true);
  behind.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(), camera);
  const hits = raycaster.intersectObjects([dashboard, behind], true);
  expect(hits[0].object.isSprite).toBe(true);
  expect(pickRoomItem(hits, false)).toBe("dashboard");
  expect(pickRoomItem(hits, true)).toBe("dashboard");
});

test("an exhibited photo opens the original record in use mode but edits the board in decorate mode", () => {
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  const frame = new THREE.Group();
  frame.userData.memoryId = "original-memory";
  frame.add(photo);
  asset("activity-board", frame);
  expect(pickRoomItem([{ object: photo }], false)).toBe("original-memory");
  expect(pickRoomItem([{ object: photo }], true)).toBe("activity-board");
});

test("hidden floors are skipped but visible walls prevent selecting objects behind them", () => {
  const hidden = new THREE.Sprite();
  asset("hidden-board", hidden).visible = false;
  const visible = new THREE.Mesh();
  asset("visible-board", visible);
  expect(pickRoomItem([{ object: hidden }, { object: visible }], false)).toBe("visible-board");
  expect(pickRoomItem([{ object: new THREE.Mesh() }, { object: visible }], false)).toBeNull();
  expect(pickRoomItem([], true)).toBeNull();
});
