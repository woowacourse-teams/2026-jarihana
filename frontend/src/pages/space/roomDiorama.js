import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function getDioramaBounds(layout) {
  const surface = layout.island?.surface || {
    ...layout.building,
    maxZ: layout.entrance.maxZ
  };
  return {
    minX: surface.minX - 0.4,
    maxX: surface.maxX + 0.4,
    minZ: surface.minZ - 0.35,
    maxZ: surface.maxZ + 0.35,
    minY: -0.6,
    maxY: -0.24
  };
}

export function createDioramaBase(layout) {
  const bounds = getDioramaBounds(layout);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const root = new THREE.Group();
  root.name = "web-diorama-base";
  root.userData.diorama = true;
  const slab = new THREE.Mesh(new RoundedBoxGeometry(width, 0.36, depth, 2, 0.1),
    new THREE.MeshStandardMaterial({ color: "#d5c4a9", roughness: 0.9 }));
  slab.position.set((bounds.minX + bounds.maxX) / 2, -0.42, (bounds.minZ + bounds.maxZ) / 2);
  slab.castShadow = slab.receiveShadow = true;
  root.add(slab);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width + 3, depth + 3),
    new THREE.ShadowMaterial({ color: "#665446", opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(slab.position.x, -0.62, slab.position.z);
  shadow.receiveShadow = true;
  root.add(shadow);
  return root;
}
