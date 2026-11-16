import * as THREE from "three";
import { createFloatingIsland } from "./floatingIsland";
import { createBuildingContext } from "./roomBuilding";
import { getIslandLayout } from "./islandLayout";
import { getRoomLayout } from "./roomLayout";
import { disposeObject } from "./roomModels";

const templates = ["lounge", "climbing", "boardgame", "dining", "band", "study", "photo"];

test.each(templates)("%s has level grass around the building without grass inside the room", (template) => {
  const { building } = getRoomLayout(template);
  const layout = getIslandLayout(building);
  const island = createFloatingIsland(building);
  island.updateMatrixWorld(true);
  try {
    const lawn = island.getObjectByName("island-lawn");
    for (const [x, z] of [[-2, building.maxZ + 5], [layout.walkable.minX, layout.walkable.minZ],
      [layout.walkable.maxX, layout.walkable.maxZ], [layout.walkable.minX, layout.walkable.maxZ],
      [layout.walkable.maxX, layout.walkable.minZ]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(lawn);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(0, 5);
    }
    const indoorRay = new THREE.Raycaster(new THREE.Vector3(0, 2, (building.minZ + building.maxZ) / 2), new THREE.Vector3(0, -1, 0));
    expect(indoorRay.intersectObject(lawn)).toHaveLength(0);
    const stoneBounds = new THREE.Box3().setFromObject(island.getObjectByName("entrance-path"));
    expect(stoneBounds.max.y).toBeCloseTo(0.01, 5);
    expect(stoneBounds.max.z - stoneBounds.min.z).toBeGreaterThan(14);
    const loop = new THREE.Box3().setFromObject(island.getObjectByName("garden-loop-path"));
    expect(loop.min.z).toBeLessThan(building.minZ - 6);
    expect(loop.min.x).toBeLessThan(building.minX);
    expect(loop.max.x).toBeGreaterThan(building.maxX);
    const forestGroup = island.getObjectByName("island-forest");
    const forest = new THREE.Box3().setFromObject(forestGroup);
    expect(forest.min.z).toBeLessThan(layout.walkable.minZ);
    expect(forest.min.x).toBeLessThan(layout.walkable.minX);
    expect(forest.max.x).toBeGreaterThan(layout.walkable.maxX);
    expect(forest.max.y).toBeGreaterThan(6);
    expect(forestGroup.children.map(({ name }) => name)).toEqual([
      "forest-trunks", "forest-broadleaf-crowns", "forest-conifer-crowns"
    ]);
    expect(forestGroup.children.every((mesh) => mesh.userData.walkCameraPassThrough)).toBe(true);
  } finally { disposeObject(island); }
});

test.each(templates)("%s has finite tapered rock beneath its lawn, with visible outward faces", (template) => {
  const { building } = getRoomLayout(template);
  const layout = getIslandLayout(building);
  const island = createFloatingIsland(building);
  island.updateMatrixWorld(true);
  try {
    const rock = island.getObjectByName("island-rock-core");
    const bounds = new THREE.Box3().setFromObject(rock);
    expect(bounds.min.y).toBeCloseTo(layout.bottomY);
    expect(bounds.max.y).toBeCloseTo(-0.85);
    expect(bounds.min.x).toBeGreaterThan(layout.surface.minX);
    expect(bounds.max.x).toBeLessThan(layout.surface.maxX);
    const centerZ = (layout.surface.minZ + layout.surface.maxZ) / 2;
    const ray = new THREE.Raycaster(new THREE.Vector3(layout.surface.maxX + 5, -2, centerZ), new THREE.Vector3(-1, 0, 0));
    expect(ray.intersectObject(rock).length).toBeGreaterThan(0);
    const clouds = new THREE.Box3().setFromObject(island.getObjectByName("island-clouds"));
    expect(clouds.max.y).toBeLessThan(-2);
    let meshes = 0;
    island.traverse((child) => { if (child.isMesh) meshes += 1; });
    expect(meshes).toBeLessThan(40);
  } finally { disposeObject(island); }
});

test("building context keeps its open facade and replaces neighboring buildings and corridor with grass", () => {
  const { building } = getRoomLayout("boardgame");
  const context = createBuildingContext(building);
  context.updateMatrixWorld(true);
  try {
    expect(context.name).toBe("building-context");
    expect(context.getObjectByName("building-entrance")).toBeDefined();
    expect(context.getObjectByName("floating-island").userData.outdoor).toBe(true);
    for (const name of ["rear-neighbor-wall", "neighbor-side-return", "surrounding-building-floor", "entrance-corridor"]) {
      expect(context.getObjectByName(name)).toBeUndefined();
    }
    for (const x of [-3.45, -2, -0.55]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.45, 8.1), new THREE.Vector3(0, 0, -1), 0, 3.3);
      expect(ray.intersectObject(context, true)).toHaveLength(0);
    }
  } finally { disposeObject(context); }
});
