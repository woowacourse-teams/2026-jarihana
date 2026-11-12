import * as THREE from "three";

const LEAVES = ["#42643b", "#587948", "#6f8c4b", "#7c9956", "#4e7355"];
const variation = (seed) => (Math.sin(seed * 12.9898 + 4.1414) + 1) / 2;

function addBatch(root, name, geometry, instances, roughness = 0.95) {
  if (!instances.length) return;
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness });
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  mesh.name = name;
  mesh.userData.walkCameraPassThrough = true;
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  instances.forEach(({ position, scale, rotation = 0, color: tint }, index) => {
    transform.position.set(...position);
    transform.scale.set(...scale);
    transform.rotation.set(0, rotation, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, color.set(tint));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  root.add(mesh);
}

export function createIslandForest({ surface, walkable }) {
  const root = new THREE.Group();
  root.name = "island-forest";
  root.userData.outdoor = true;
  const trunks = [];
  const crowns = [];
  const firs = [];
  let treeIndex = 0;

  const plantTree = (x, z, heightScale = 1) => {
    const seed = treeIndex++;
    const height = (4.7 + variation(seed + 3) * 2.15) * heightScale;
    const radius = 0.17 + variation(seed + 11) * 0.12;
    const evergreen = seed % 5 === 0;
    const trunkHeight = height * (evergreen ? 0.8 : 0.62);
    trunks.push({ position: [x, trunkHeight / 2, z], scale: [radius, trunkHeight, radius], color: seed % 3 ? "#80654a" : "#9c8060" });
    if (evergreen) {
      [0.4, 0.59, 0.77].forEach((level, index) => {
        const width = (1.6 - index * 0.4) * heightScale;
        const crownHeight = height * (0.43 - index * 0.03);
        firs.push({ position: [x, height * level, z], scale: [width, crownHeight, width], color: LEAVES[(seed + index) % LEAVES.length], rotation: seed });
      });
      return;
    }
    const width = (1.35 + variation(seed + 8) * 0.4) * heightScale;
    for (let lobe = 0; lobe < 5; lobe += 1) {
      const angle = lobe * Math.PI / 2 + seed * 0.7;
      const upper = lobe === 4;
      const offset = upper ? 0 : width * 0.48;
      const verticalRadius = height * (upper ? 0.19 : 0.21);
      crowns.push({
        position: [x + Math.cos(angle) * offset, height * (upper ? 0.81 : 0.65), z + Math.sin(angle) * offset],
        scale: [width * (upper ? 0.77 : 0.82), verticalRadius, width * (upper ? 0.77 : 0.82)],
        color: LEAVES[(seed + lobe) % LEAVES.length], rotation: seed + lobe
      });
    }
  };

  // Two staggered layers fit inside the four-metre rim; the inner lawn stays walkable.
  for (let row = 0; row < 2; row += 1) {
    const backZ = row ? walkable.minZ - 0.7 : surface.minZ + 1.25;
    for (let x = surface.minX + 2 + row * 1.7; x < surface.maxX - 1.8; x += 3.4) {
      if (Math.abs(x) < 3.3) continue;
      plantTree(x, backZ + (variation(x + row) - 0.5) * 0.35, row ? 0.83 : 1);
    }
    for (const side of [-1, 1]) {
      const x = side < 0
        ? (row ? walkable.minX - 0.7 : surface.minX + 1.25)
        : (row ? walkable.maxX + 0.7 : surface.maxX - 1.25);
      for (let z = surface.minZ + 5 + row * 1.7; z < surface.maxZ - 6; z += 3.5) {
        const front = z > surface.maxZ - 13;
        plantTree(x + (variation(z + side) - 0.5) * 0.35, z, front ? 0.72 : row ? 0.84 : 1);
      }
    }
  }

  addBatch(root, "forest-trunks", new THREE.CylinderGeometry(0.68, 1, 1, 7), trunks);
  addBatch(root, "forest-broadleaf-crowns", new THREE.SphereGeometry(1, 10, 8), crowns);
  addBatch(root, "forest-conifer-crowns", new THREE.ConeGeometry(1, 1, 9), firs);
  return root;
}
