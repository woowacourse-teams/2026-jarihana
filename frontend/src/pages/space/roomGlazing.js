import * as THREE from "three";

export function createClearWindowMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#d9e1df",
    roughness: 0.12,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true
  });
}
