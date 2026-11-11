import * as THREE from "three";
import { createFurniture, disposeObject } from "./roomModels";

const ASSETS = [
  { kind: "activityBoard", width: 2.4, depth: 0.7, height: 2.5 },
  { kind: "clubDashboard", width: 1.8, depth: 0.7, height: 2.3 }
];

function resources(model) {
  const values = new Set();
  model.traverse((object) => {
    if (object.geometry) values.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) values.add(material);
  });
  return values;
}

test.each(ASSETS)("$kind remains within its movable footprint after a quarter-turn", (asset) => {
  const model = createFurniture(asset.kind);
  try {
    for (const rotation of [0, Math.PI / 2]) {
      model.rotation.y = rotation;
      const bounds = new THREE.Box3().setFromObject(model);
      const width = rotation ? asset.depth : asset.width;
      const depth = rotation ? asset.width : asset.depth;
      expect(bounds.min.x).toBeGreaterThanOrEqual(-width / 2 - 0.001);
      expect(bounds.max.x).toBeLessThanOrEqual(width / 2 + 0.001);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-depth / 2 - 0.001);
      expect(bounds.max.z).toBeLessThanOrEqual(depth / 2 + 0.001);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(bounds.max.y).toBeLessThanOrEqual(asset.height + 0.001);
    }
    expect(model.children.filter((child) => child.name === "common-board-foot")).toHaveLength(2);
  } finally { disposeObject(model); }
});

test.each(ASSETS)("$kind exposes its purpose on both faces and owns disposable resources", ({ kind }) => {
  const first = createFurniture(kind, { color: "#536bd6" });
  const second = createFurniture(kind);
  try {
    expect(first.userData.assetKind).toBe(kind);
    for (const side of ["front", "back"]) {
      const face = first.getObjectByName(`common-board-${side}`);
      expect(face).toBeDefined();
      expect(face.getObjectByName(kind === "activityBoard" ? "activity-camera-emblem" : "dashboard-information-emblem")).toBeDefined();
      expect(face.children.filter((child) => child.name === "empty-photo-slot")).toHaveLength(kind === "activityBoard" ? 4 : 0);
      expect(face.children.filter((child) => child.name === "empty-notice-sheet")).toHaveLength(kind === "clubDashboard" ? 1 : 0);
    }
    const other = resources(second);
    expect([...resources(first)].some((resource) => other.has(resource))).toBe(false);
    expect([...resources(first)].some((resource) => resource.isMaterial && resource.color.getHexString() === "536bd6")).toBe(true);
  } finally { disposeObject(first); disposeObject(second); }
});
