import * as THREE from "three";
import backendCatalog from "../../../../backend/src/test/resources/group-space-v9-catalog.json";
import { CATALOG, ROOM_TEMPLATES } from "./roomState";
import { createFurniture, createRoomShell, disposeObject } from "./roomModels";
import { LEGACY_FACILITY_ASSETS, createLegacyFacilityItems } from "./legacyFacilityCatalog";

function allResources(group) {
  const resources = new Set();
  group.traverse((mesh) => {
    if (mesh.geometry) resources.add(mesh.geometry);
    for (const material of mesh.material ? [].concat(mesh.material) : []) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  return resources;
}

test.each(LEGACY_FACILITY_ASSETS)("$kind is independently owned and fits its catalog bounds", (asset) => {
  const model = createFurniture(asset.kind);
  const second = createFurniture(asset.kind);
  try {
    const bounds = new THREE.Box3().setFromObject(model);
    expect({ kind: asset.kind, minX: bounds.min.x >= -asset.width / 2 - 0.001, maxX: bounds.max.x <= asset.width / 2 + 0.001,
      minZ: bounds.min.z >= -asset.depth / 2 - 0.001, maxZ: bounds.max.z <= asset.depth / 2 + 0.001,
      maxY: bounds.max.y <= asset.height + 0.001 }).toEqual({ kind: asset.kind, minX: true, maxX: true, minZ: true, maxZ: true, maxY: true });
    const resources = allResources(model);
    expect([...allResources(second)].some((resource) => resources.has(resource))).toBe(false);
    expect(resources.size).toBeGreaterThan(2);
  } finally { disposeObject(model); disposeObject(second); }
});

test("the shell contains no preset shelves, climbing panels or cafe furnishings", () => {
  for (const template of ["boardgame", "climbing", "lounge"]) {
    const shell = createRoomShell({ template });
    try {
      for (const name of ["boardgame-library-shelf", "climbing-panel", "crash-mat", "climbing-equipment", "clubhouse-kitchen", "good-game-neon"])
        expect(shell.getObjectByName(name)).toBeUndefined();
      const items = createLegacyFacilityItems(template);
      expect(items.length).toBeGreaterThan(0);
      expect(new Set(items.map(({ id }) => id)).size).toBe(items.length);
      expect(items.every(({ kind }) => LEGACY_FACILITY_ASSETS.some((asset) => asset.kind === kind))).toBe(true);
    } finally { disposeObject(shell); }
  }
});

test("each climbing mat preserves a 35cm walking surface", () => {
  for (const kind of ["crashMat", "crashMatWide"]) {
    const model = createFurniture(kind);
    try {
      const bounds = new THREE.Box3().setFromObject(model.getObjectByName("crash-mat"));
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.max.y).toBeCloseTo(0.35);
      expect(LEGACY_FACILITY_ASSETS.find((asset) => asset.kind === kind).walkableHeight).toBe(0.35);
    } finally { disposeObject(model); }
  }
});


test("frontend catalog retains every reusable kind and template accepted by server v9", () => {
  expect(CATALOG.map(({ kind }) => kind).sort()).toEqual(expect.arrayContaining([...backendCatalog.kinds].sort()));
  expect(ROOM_TEMPLATES.map(({ id }) => id).sort()).toEqual([...backendCatalog.templates].sort());
});
