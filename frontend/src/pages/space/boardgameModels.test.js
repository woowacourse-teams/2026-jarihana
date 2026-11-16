import * as THREE from "three";
import { BOARDGAME } from "./roomLayout";
import { createBoardgameFurniture, createBoardgameShell } from "./boardgameModels";
import { createFurniture, disposeObject } from "./roomModels";

import { createLegacyFacilityItems } from "./legacyFacilityCatalog";

function boardgamePreset() {
  const shell = createBoardgameShell();
  for (const item of createLegacyFacilityItems("boardgame")) {
    const object = createFurniture(item.kind);
    object.position.set(item.x, item.level ? BOARDGAME.mezzanine.height : 0, item.z);
    object.rotation.y = item.rotation * Math.PI / 2;
    object.userData.presetItem = item;
    if (item.level) object.traverse((part) => { part.userData.mezzanine = true; });
    shell.add(object);
  }
  shell.updateMatrixWorld(true);
  return shell;
}

function matching(group, name) {
  const objects = [];
  group.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

test("the boardgame library uses its own 20 by 18 metre hall with a walkable 4.5 metre mezzanine", () => {
  const shell = boardgamePreset();
  try {
    shell.updateMatrixWorld(true);
    expect(BOARDGAME.building.maxX - BOARDGAME.building.minX).toBe(20);
    expect(BOARDGAME.building.maxZ - BOARDGAME.building.minZ).toBe(18);
    expect(BOARDGAME.mezzanine.height).toBe(4.5);
    const deck = shell.getObjectByName("boardgame-mezzanine-deck");
    const bounds = new THREE.Box3().setFromObject(deck);
    expect(bounds.min.x).toBeCloseTo(BOARDGAME.mezzanine.minX);
    expect(bounds.max.x).toBeCloseTo(BOARDGAME.mezzanine.maxX);
    expect(bounds.min.z).toBeCloseTo(BOARDGAME.mezzanine.minZ);
    expect(bounds.max.z).toBeCloseTo(BOARDGAME.mezzanine.maxZ);
    expect(bounds.max.y).toBeCloseTo(BOARDGAME.mezzanine.height);
    expect(shell.getObjectByName("boardgame-mezzanine").userData.mezzanine).toBe(true);
    const roof = new THREE.Box3().setFromObject(shell.getObjectByName("boardgame-ceiling"));
    expect(roof.min.y).toBeCloseTo(BOARDGAME.building.height);
    const openHall = new THREE.Raycaster(new THREE.Vector3(0, 1.45, 0), new THREE.Vector3(1, 0, 0), 0, 5.5);
    expect(openHall.intersectObject(shell, true)).toHaveLength(0);
  } finally { disposeObject(shell); }
});

test("all 24 visible stair treads match the navigation rise and leave the front approach clear", () => {
  const shell = boardgamePreset();
  try {
    shell.updateMatrixWorld(true);
    const treads = matching(shell, "boardgame-stair-tread");
    expect(treads).toHaveLength(BOARDGAME.stairs.steps);
    treads.forEach((tread, index) => {
      const bounds = new THREE.Box3().setFromObject(tread);
      expect(bounds.max.y).toBeCloseTo(BOARDGAME.stairs.height * (index + 1) / BOARDGAME.stairs.steps);
      expect(bounds.min.x).toBeCloseTo(BOARDGAME.stairs.minX);
      expect(bounds.max.x).toBeCloseTo(BOARDGAME.stairs.maxX);
      expect(bounds.max.z).toBeLessThan(BOARDGAME.building.maxZ - 2.5);
    });
  } finally { disposeObject(shell); }
});

test("the reference library has 196 instanced game boxes, separate upper and ground lights, and a right-wall display", () => {
  const shell = boardgamePreset();
  try {
    expect(matching(shell, "boardgame-library-shelf")).toHaveLength(7);
    expect(matching(shell, "boardgame-boxes").reduce((sum, mesh) => sum + mesh.count, 0)).toBe(196);
    const lamps = [];
    shell.traverse((object) => { if (object.userData.roomLamp) lamps.push(object); });
    expect(lamps).toHaveLength(18);
    expect(lamps.filter((lamp) => lamp.userData.roomLampColor === "#ff624c")).toHaveLength(1);
    expect(lamps.filter((lamp) => lamp.parent.userData.mezzanine)).toHaveLength(8);
    expect(lamps.every((lamp) => lamp.userData.roomLampStrength > 0)).toBe(true);
    const frame = shell.getObjectByName("boardgame-memory-board");
    expect(frame.position.toArray()).toEqual([9.8, 0, -2]);
    expect(frame.rotation.y).toBeCloseTo(3 * Math.PI / 2);
    expect(shell.getObjectByName("good-game-neon")).toBeDefined();
  } finally { disposeObject(shell); }
});

test.each([
  ["gameTable", 4.4, 2.7, 1.0],
  ["roundChair", 1.4, 1.4, 1.12],
  ["clubSofa", 3.6, 1.2, 1.2],
  ["gameCredenza", 3.6, 0.65, 1.35],
  ["loungeRug", 8.6, 7.4, 0.04],
  ["gameShelf", 2.4, 0.55, 2.71],
  ["gameChair", 0.75, 0.8, 1.06],
  ["floorLamp", 0.6, 0.6, 1.9]
])("%s stays within the placement footprint and can be disposed independently", (kind, width, depth, height) => {
  const object = createBoardgameFurniture(kind);
  try {
    const bounds = new THREE.Box3().setFromObject(object);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-width / 2 - 0.001);
    expect(bounds.max.x).toBeLessThanOrEqual(width / 2 + 0.001);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-depth / 2 - 0.001);
    expect(bounds.max.z).toBeLessThanOrEqual(depth / 2 + 0.001);
    expect(bounds.max.y).toBeLessThanOrEqual(height);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
  } finally { disposeObject(object); }
});

test("game tables contain boards, cards, twelve player pieces and two dice instead of a blank top", () => {
  const table = createBoardgameFurniture("gameTable");
  try {
    expect(matching(table, "game-piece")).toHaveLength(12);
    expect(matching(table, "game-die")).toHaveLength(2);
    expect(table.children.length).toBeGreaterThan(80);
    expect(matching(table, "player-placemat")).toHaveLength(6);
    expect(matching(table, "player-card")).toHaveLength(18);
    expect(matching(table, "player-cup")).toHaveLength(6);
    expect(createBoardgameFurniture("sofa")).toBeNull();
  } finally { disposeObject(table); }
});

test.each(["gameShelf", "roundChair", "clubSofa"])("%s releases its grain textures and repeated game-box buffers", (kind) => {
  const shelf = createBoardgameFurniture(kind);
  const textures = new Set();
  const buffers = [];
  shelf.traverse((object) => {
    if (object.material?.map) textures.add(object.material.map);
    if (object.isInstancedMesh) buffers.push(object);
  });
  const textureDisposed = jest.fn();
  const bufferDisposed = jest.fn();
  textures.forEach((texture) => texture.addEventListener("dispose", textureDisposed));
  buffers.forEach((buffer) => buffer.addEventListener("dispose", bufferDisposed));
  disposeObject(shelf);
  expect(textures.size).toBeGreaterThan(0);
  expect(textureDisposed).toHaveBeenCalledTimes(textures.size);
  expect(bufferDisposed).toHaveBeenCalledTimes(buffers.length);
});


test("seven front-edge library units remain visible below the deck and inside the reserved facility footprint", () => {
  const shell = boardgamePreset();
  try {
    shell.updateMatrixWorld(true);
    const shelves = matching(shell, "boardgame-library-shelf");
    const front = shelves.filter((unit) => unit.getWorldPosition(new THREE.Vector3()).z === -7.7);
    expect(front).toHaveLength(7);
    front.forEach((unit) => {
      const bounds = new THREE.Box3().setFromObject(unit);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-7.4);
      expect(bounds.max.x).toBeLessThanOrEqual(9.7);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-8.04);
      expect(bounds.max.z).toBeLessThanOrEqual(-7.15);
      const face = new THREE.Vector3(unit.getWorldPosition(new THREE.Vector3()).x, 1.5, bounds.max.z);
      const camera = new THREE.Vector3(-17, 25, 27);
      const ray = new THREE.Raycaster(camera, face.clone().sub(camera).normalize(), 0, camera.distanceTo(face));
      expect(ray.intersectObject(shell.getObjectByName("boardgame-mezzanine-deck"))).toHaveLength(0);
    });
    const frontLights = [];
    shell.traverse((object) => { if (object.userData.roomLamp && object.getWorldPosition(new THREE.Vector3()).z === -7.06) frontLights.push(object); });
    expect(frontLights).toHaveLength(4);
  } finally { disposeObject(shell); }
});

test("cutaway beams preserve the rear/right outline and the neon is real emissive lettering", () => {
  const shell = boardgamePreset();
  try {
    expect(shell.getObjectByName("boardgame-ceiling-beams").children).toHaveLength(2);
    expect(shell.getObjectByName("boardgame-walkthrough-beams").userData.walkthroughOnly).toBe(true);
    const neon = shell.getObjectByName("good-game-neon");
    expect(neon.getWorldPosition(new THREE.Vector3()).x).toBe(9.65);
    const strokes = matching(neon, "neon-letter-stroke");
    expect(strokes).toHaveLength(11);
    expect(strokes.every((stroke) => stroke.geometry.type === "TubeGeometry" && stroke.material.emissiveIntensity > 0)).toBe(true);
  } finally { disposeObject(shell); }
});


test("round armchairs and full sofas have separate fabric upholstery and retain the selected color", () => {
  for (const kind of ["roundChair", "clubSofa"]) {
    const object = createBoardgameFurniture(kind, { color: "#456882" });
    try {
      const upholstered = [];
      object.traverse((mesh) => { if (mesh.material?.bumpMap) upholstered.push(mesh); });
      expect(upholstered.length).toBeGreaterThan(3);
      expect(upholstered.some((mesh) => mesh.material.color.getHexString() === "456882")).toBe(true);
      if (kind === "roundChair") {
        expect(object.getObjectByName("round-chair-wraparound-back")).toBeDefined();
        expect(object.getObjectByName("round-chair-seat")).toBeDefined();
      } else {
        expect(matching(object, "sofa-seat-cushion")).toHaveLength(3);
        expect(matching(object, "sofa-throw-pillow")).toHaveLength(2);
      }
    } finally { disposeObject(object); }
  }
});

test("the wall library transitions from warm wood to dark display and black shelves", () => {
  const shell = boardgamePreset();
  try {
    const styles = matching(shell, "boardgame-library-shelf").map((unit) => unit.userData.libraryStyle);
    expect(styles).toEqual(["wood", "wood", "display", "display", "black", "black", "black"]);
    expect(matching(shell, "upper-soft-wall-panel")).toHaveLength(5);
    expect(matching(shell, "decorative-game-die")).toHaveLength(2);
    expect(matching(shell, "decorative-game-meeple")).toHaveLength(2);
  } finally { disposeObject(shell); }
});
