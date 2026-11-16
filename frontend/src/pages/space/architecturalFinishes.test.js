import * as THREE from "three";
import { createSurfaceMaterial } from "./architecturalMaterials";
import { finishArchitecture } from "./architecturalFinishes";
import { createRoomShell, disposeObject } from "./roomModels";
import { getRoomLayout, PLAYER } from "./roomLayout";
import { createInitialRoom, canPlace } from "./roomState";
import { resolveSurface, TEMPLATE_SURFACES, resolveFloorProfile } from "./surfaceCatalog";
import { setSurfaceColor } from "./woodSurfaceMaps";

test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s has standing headroom on both floors and human-sized stair risers", (template) => {
  const { building, mezzanine, stairs } = getRoomLayout(template);
  expect(mezzanine.height - 0.5).toBeGreaterThan(PLAYER.height + 1.7);
  expect(building.height - mezzanine.height - 0.7).toBeGreaterThan(PLAYER.height + 1.7);
  expect(stairs.height).toBe(mezzanine.height);
  expect(stairs.height / stairs.steps).toBeLessThanOrEqual(0.18);
  expect((stairs.maxZ - stairs.minZ) / stairs.steps).toBeGreaterThanOrEqual(0.23);
});

test("themes resolve their own surfaces and explicit choices override either surface independently", () => {
  expect(new Set(Object.values(TEMPLATE_SURFACES).map(({ floor, wall }) => `${floor}/${wall}`)).size).toBe(7);
  expect(resolveSurface("climbing", "floor")).toBe("stone");
  expect(resolveSurface("boardgame", "floor")).toBe("walnut");
  expect(resolveSurface("boardgame", "wall", "brick")).toBe("brick");
  expect(resolveSurface("boardgame", "floor")).toBe("walnut");
});

function surfaces(atmosphere) {
  const root = new THREE.Group();
  for (const [name, dimensions] of [["floor", [8, 0.2, 12]], ["wall", [8, 5, 0.2]]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshStandardMaterial({ color: "#c8b29d" }));
    mesh.userData.roomSurface = name; mesh.name = name; root.add(mesh);
  }
  return finishArchitecture(root, "lounge", getRoomLayout("lounge"), atmosphere);
}

test("wall and floor have metre-scaled independent patterns and independently owned textures", () => {
  const a = surfaces({ wallMaterial: "brick", floorMaterial: "checker", wallPatternScale: 0.5, floorPatternScale: 2 });
  const b = surfaces({ wallMaterial: "brick", floorMaterial: "checker", wallPatternScale: 1, floorPatternScale: 1 });
  try {
    const wall = a.getObjectByName("wall"), floor = a.getObjectByName("floor");
    expect(wall.material.name).toBe("pbr-brick");
    expect(floor.material.name).toBe("pbr-checker");
    expect(wall.material.map.repeat.toArray()).toEqual([4, 2.5]);
    expect(floor.material.map.repeat.toArray()).toEqual([1, 1.5]);
    expect(floor.material.roughnessMap.repeat.toArray()).toEqual([1, 1.5]);
    expect(wall.material.map).not.toBe(b.getObjectByName("wall").material.map);
    const disposeOther = jest.spyOn(b.getObjectByName("wall").material.map, "dispose");
    disposeObject(a);
    expect(disposeOther).not.toHaveBeenCalled();
  } finally { disposeObject(b); }
});

test("tall wall assets cannot cross a loft ceiling even when their footprint is free", () => {
  const room = createInitialRoom("boardgame");
  const asset = { id: "tall", kind: "galleryWall", x: 0, z: -10, rotation: 0 };
  expect(canPlace(asset, [], room.template)).toBe(false);
  expect(canPlace({ ...asset, z: 0 }, [], room.template)).toBe(true);
});

test("neutral wood maps retain the selected tint exactly through repeated lighting updates", () => {
  const material = createSurfaceMaterial("walnut", "#784538");
  setSurfaceColor(material, "#784538");
  expect(material.color.getHexString()).toBe("784538");
  setSurfaceColor(material, "#295da7");
  setSurfaceColor(material, "#295da7");
  expect(material.color.getHexString()).toBe("295da7");
  material.dispose();
});

test("theme floors use distinct physical plank dimensions and explicit material choices override them", () => {
  const maps = ["dining", "boardgame", "band", "photo"].map(template => {
    const material = createSurfaceMaterial(resolveSurface(template, "floor"), "#ffffff", 24, 24, 1, undefined, resolveFloorProfile(template));
    const signature = [...material.map.repeat.toArray(), material.map.rotation].join(",");
    for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
    material.dispose();
    return signature;
  });
  expect(new Set(maps).size).toBe(4);
  expect(resolveFloorProfile("dining", "walnut")).toEqual({});
  expect(resolveFloorProfile("climbing").tileSize).toBe(1.2);
  expect(resolveFloorProfile("study").tileSize).toBe(0.9);
});



test("band wallpaper changes independently of movable acoustic panels", () => {
  const original = createRoomShell({ template: "band" });
  const custom = createRoomShell({ template: "band", atmosphere: { wallMaterial: "brick" } });
  try {
    expect(original.getObjectByName("acoustic-timber-slat")).toBeUndefined();
    expect(createInitialRoom("band").items.some(item => item.kind === "acousticTile")).toBe(true);
    expect(custom.getObjectByName("acoustic-timber-slat")).toBeUndefined();
    expect(custom.getObjectByName("studio-acoustic-bays")).toBeUndefined();
    const walls = [];
    custom.traverse((object) => { if (object.userData.surfaceMaterial === "brick") walls.push(object); });
    expect(walls.length).toBeGreaterThan(1);
    expect(custom.getObjectByName("floor-slab")).toBeDefined();
  } finally { disposeObject(original); disposeObject(custom); }
});

test("rotated boards preserve metre dimensions on a rectangular room", () => {
  const profile = resolveFloorProfile("photo");
  const material = createSurfaceMaterial("oak", "#baa68a", 24, 22, 1, undefined, profile);
  const map = material.map;
  map.updateMatrix();
  const origin = new THREE.Vector2(0, 0).applyMatrix3(map.matrix);
  const across = new THREE.Vector2(profile.plankWidth / 24, 0).applyMatrix3(map.matrix);
  const along = new THREE.Vector2(0, profile.plankLength / 22).applyMatrix3(map.matrix);
  expect(Math.abs(across.y - origin.y)).toBeCloseTo(1 / 16);
  expect(Math.abs(along.x - origin.x)).toBeCloseTo(1 / 2);
  for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
  material.dispose();
});
