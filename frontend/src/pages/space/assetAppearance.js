import * as THREE from 'three';
import { createSurfaceMaterial } from './architecturalMaterials';

// New models mark their editable body. Legacy models use their largest opaque material group.
export function applyAssetAppearance(root, item) {
  if (!item.color && (!item.finish || item.finish === 'auto')) return;
  const meshes = [];
  root.traverse(mesh => {
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.color &&
      !mesh.material.transparent && !mesh.material.emissiveMap && !(mesh.material.emissive?.getHex())) meshes.push(mesh);
  });
  const tagged = meshes.filter(mesh => mesh.userData.customFinish);
  let targets = tagged;
  if (!targets.length) {
    const areas = new Map();
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.scale);
      const area = size.x * size.y + size.y * size.z + size.x * size.z;
      areas.set(mesh.material, (areas.get(mesh.material) || 0) + area);
    }
    const primary = [...areas].sort((a,b) => b[1]-a[1])[0]?.[0];
    targets = meshes.filter(mesh => mesh.material === primary);
  }
  const replacements = new Map();
  for (const mesh of targets) {
    const before = mesh.material;
    if (!replacements.has(before)) {
      const color = item.color || `#${before.color.getHexString()}`;
      const material = ['oak','walnut','stone'].includes(item.finish)
        ? createSurfaceMaterial(item.finish, color, 3, 2) : before.clone();
      material.color.set(color);
      if (item.finish === 'fabric' || item.finish === 'metal') {
        material.map = null; material.bumpMap = null;
        material.roughness = item.finish === 'fabric' ? 1 : 0.35;
        material.metalness = item.finish === 'metal' ? 0.7 : 0;
      }
      replacements.set(before, material);
    }
    mesh.material = replacements.get(before);
  }
  for (const material of replacements.keys()) {
    if (!meshes.some(mesh => mesh.material === material)) material.dispose();
  }
}
