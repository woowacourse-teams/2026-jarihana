import * as THREE from 'three';
import { studioMaterial } from './studio-materials.js';

export const NOZZLE_LENGTH_RATIO = 2.35 / 1.6;
export const NOZZLE_DEPTH = 0.37;
export const NOZZLE_HORIZONTAL = Math.sqrt(1 - NOZZLE_DEPTH ** 2);

export function createPipeSurfaces(color) {
  return {
    wall: studioMaterial({ color, roughness: 0.18, clearcoat: 0.7, clearcoatRoughness: 0.12, transparent: true, opacity: 0.27, depthWrite: false }),
    solid: studioMaterial({ color, roughness: 0.36, clearcoat: 0.35, emissive: color, emissiveIntensity: 0 }),
    inner: studioMaterial({ color, roughness: 0.24, transparent: true, opacity: 0.11, side: THREE.BackSide, depthWrite: false }),
  };
}

// Continue one spacing between the nozzle rims, including across the render-layer seam.
export function addPipeRings(group, curve, diameter, material, { offset = 0, spacing, end }) {
  const curveLength = curve.getLength(), length = Math.min(curveLength, end - offset);
  if (length <= 0 || spacing <= 0) return;
  const first = Math.max(1, Math.ceil(offset / spacing - 1e-6)) * spacing - offset;
  const count = Math.max(0, Math.ceil((length - first) / spacing - 1e-6));
  if (!count) return;
  const geometry = new THREE.TorusGeometry(diameter * 0.51, diameter * (0.095 / 1.6), 8, 32);
  const rings = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D(), axis = new THREE.Vector3(0, 0, 1);
  for (let index = 0; index < count; index++) {
    const along = (first + index * spacing) / curveLength;
    transform.position.copy(curve.getPointAt(along));
    transform.quaternion.setFromUnitVectors(axis, curve.getTangentAt(along).normalize());
    transform.updateMatrix();
    rings.setMatrixAt(index, transform.matrix);
  }
  rings.instanceMatrix.needsUpdate = true;
  group.add(rings);
}
