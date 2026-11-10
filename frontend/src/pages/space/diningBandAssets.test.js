import * as THREE from "three";
import { DINING_BAND_ASSETS, DINING_BAND_LAYOUTS, createDiningBandAsset, createDiningBandPresetItems } from "./diningBandAssets";
import { canPlace, createInitialRoom, validateRoom } from "./roomState";

function resources(object) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  object.traverse((mesh) => {
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of [mesh.material].flat().filter(Boolean)) {
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  return { geometries, materials, textures };
}

function dispose(object) {
  Object.values(resources(object)).forEach((entries) => entries.forEach((entry) => entry.dispose()));
}

test.each(DINING_BAND_ASSETS)("$kind fits its catalog footprint with a floor-aligned origin", ({ kind, width, depth, height }) => {
  const object = createDiningBandAsset(kind);
  try {
    expect(object.isGroup).toBe(true);
    expect(object.userData.assetKind).toBe(kind);
    const bounds = new THREE.Box3().setFromObject(object);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-width / 2 - 0.001);
    expect(bounds.max.x).toBeLessThanOrEqual(width / 2 + 0.001);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-depth / 2 - 0.001);
    expect(bounds.max.z).toBeLessThanOrEqual(depth / 2 + 0.001);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bounds.max.y).toBeLessThanOrEqual(height + 0.001);
    expect(object.children.length).toBeGreaterThan(3);
  } finally { dispose(object); }
});

test.each(DINING_BAND_ASSETS)("$kind owns independent buffers, materials, and textures", ({ kind }) => {
  const first = createDiningBandAsset(kind);
  const second = createDiningBandAsset(kind);
  try {
    const a = resources(first);
    const b = resources(second);
    for (const type of Object.keys(a)) for (const entry of a[type]) expect(b[type].has(entry)).toBe(false);
  } finally { dispose(first); dispose(second); }
});

test("the dining table, real keyboard and drum kit retain their characteristic details", () => {
  const table = createDiningBandAsset("feastTable");
  const keyboard = createDiningBandAsset("rehearsalKeyboard");
  const drums = createDiningBandAsset("drumKit");
  try {
    expect(table.children.filter((child) => child.name === "dining-place-setting")).toHaveLength(8);
    expect(keyboard.children.filter((child) => child.name === "keyboard-white-key")).toHaveLength(35);
    expect(drums.children.filter((child) => child.name === "drum-cymbal")).toHaveLength(4);
    expect(createDiningBandAsset("sofa")).toBeNull();
  } finally { [table, keyboard, drums].forEach(dispose); }
});

test("stage top and adjustable room light metadata match the navigation and atmosphere contracts", () => {
  const stage = createDiningBandAsset("rehearsalStage");
  const light = createDiningBandAsset("stageLight");
  try {
    expect(new THREE.Box3().setFromObject(stage).max.y).toBeCloseTo(DINING_BAND_ASSETS.find((asset) => asset.kind === "rehearsalStage").walkableHeight);
    const lamp = light.children.find((child) => child.userData.roomLamp);
    expect(lamp.isSpotLight).toBe(true);
    expect(lamp.userData.roomLampStrength).toBe(lamp.intensity);
    expect(light.children.some((child) => child.userData.roomBulb)).toBe(true);
  } finally { dispose(stage); dispose(light); }
});

test("dining and band have distinct spacious halls and opposite staircases with connected lofts", () => {
  const { dining, band } = DINING_BAND_LAYOUTS;
  expect(dining.building.maxX - dining.building.minX).toBe(22);
  expect(dining.building.maxZ - dining.building.minZ).toBe(17);
  expect(band.building.maxX - band.building.minX).toBe(20);
  expect(band.building.maxZ - band.building.minZ).toBe(19);
  expect(dining.stairs.maxX).toBeLessThan(0);
  expect(band.stairs.minX).toBeGreaterThan(0);
  for (const layout of [dining, band]) {
    expect(layout.stairs.minZ).toBe(layout.mezzanine.maxZ);
    expect(layout.stairs.height).toBe(layout.mezzanine.height);
    expect(layout.building.height - layout.mezzanine.height).toBeGreaterThan(3.5);
    expect(layout.facilityPlacement).toEqual([]);
    const frontWalls = layout.walls.filter((wall) => wall.z === 5);
    expect(frontWalls[0].x + frontWalls[0].width / 2).toBe(-3.5);
    expect(frontWalls[1].x - frontWalls[1].width / 2).toBe(-0.5);
  }
});

test.each(["dining", "band"])("%s is a fresh editable item composition including music and both levels", (template) => {
  const items = createDiningBandPresetItems(template);
  const again = createDiningBandPresetItems(template);
  expect(items.length).toBeGreaterThan(35);
  expect(items.length).toBeLessThan(100);
  expect(new Set(items.map((entry) => entry.id)).size).toBe(items.length);
  expect(items.some((entry) => entry.kind === "musicConsole")).toBe(true);
  expect(items.filter((entry) => entry.level === 1).length).toBeGreaterThan(5);
  expect(items.every((entry, index) => entry !== again[index])).toBe(true);
});

test.each(["dining", "band"])("%s presets satisfy actual placement, clearance and save validation", (template) => {
  const room = createInitialRoom(template);
  expect(room.items.filter((entry) => !canPlace(entry, room.items, template))).toEqual([]);
  expect(validateRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
});
