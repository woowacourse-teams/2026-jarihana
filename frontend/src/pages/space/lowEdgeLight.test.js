import * as THREE from "three";
import { buildLowEdgeLight } from "./lowEdgeLight";
import { createRoomLighting } from "./roomLighting";
import { DEFAULT_ATMOSPHERE } from "./roomState";

test("edge fixture fits beneath a slim fascia and keeps spill on the receiving surface", () => {
  const root = buildLowEdgeLight(new THREE.Group(), "#345678", [3, 0.08, 0.08]);
  const casing = root.getObjectByName("edge-light-fascia");
  expect(casing.material.color.getHexString()).toBe("574b40");
  const bounds = new THREE.Box3().setFromObject(root);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeCloseTo(0.08);
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(3);
  const emitter = root.getObjectByName("edge-light-recessed-emitter");
  expect(emitter.material.emissive.getHexString()).toBe("345678");
  expect(emitter.userData.roomBulbColor).toBe("#345678");
  expect(emitter.position.z).toBeLessThan(casing.position.z);
  const spill = root.getObjectByName("edge-light-floor-spill");
  expect(spill.material.emissive.getHexString()).toBe("345678");
  expect(spill.position.y).toBe(0.003);
  expect(spill.position.z - spill.geometry.parameters.height / 2).toBeGreaterThan(0);
  expect(spill.material.depthWrite).toBe(false);
  expect(root.children.some((child) => child.isLight)).toBe(false);
  const hits = [];
  spill.raycast(new THREE.Raycaster(), hits);
  expect(hits).toEqual([]);
});

test("lamp controls extinguish and restore both the recessed source and additive floor spill", () => {
  const root = buildLowEdgeLight(new THREE.Group());
  const scene = new THREE.Scene();
  const update = createRoomLighting(scene);
  const emittingMeshes = root.children.filter((child) => child.userData.roomBulb);
  expect(emittingMeshes).toHaveLength(2);
  for (const lamps of [0, 50, 100]) {
    update({ ...DEFAULT_ATMOSPHERE, warmth: 0, lamps }, root);
    for (const mesh of emittingMeshes) {
      expect(mesh.material.emissiveIntensity).toBeCloseTo(mesh.userData.roomBulbStrength * lamps / 100);
      expect(mesh.material.emissive.getHexString()).toBe("ffd29a");
    }
  }
  const spill = root.getObjectByName("edge-light-floor-spill");
  expect(spill.material.color.getHex()).toBe(0);
  expect(spill.material.blending).toBe(THREE.AdditiveBlending);
  const { data, width, height } = spill.material.map.image;
  expect(data[3]).toBe(0);
  expect(data[((height - 1) * width + width / 2) * 4 + 3]).toBe(0);
  expect(data[(24 * width + width / 2) * 4 + 3]).toBeGreaterThan(0);
});
