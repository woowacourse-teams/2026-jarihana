// Run with Node 24 from the frontend directory: node scripts/bake-room-occlusion.mjs
import { existsSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import * as THREE from "three";

// The app bundles extensionless local imports through webpack.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier)) {
      const path = new URL(`${specifier}.js`, context.parentURL);
      return nextResolve(existsSync(path) ? path.href : `${specifier}/index.js`, context);
    }
    return nextResolve(specifier, context);
  }
});
const { createFurniture, createRoomShell } = await import("../src/pages/space/roomModels.js");

const atlasWidth = 512;
const patches = [];
const packed = new Map();
let atlasX = 1, atlasY = 0, rowHeight = 1;
const normalAxes = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
// BoxGeometry face UVs use these signed tangent and bitangent axes.
const tangentAxes = [[2, -1], [2, 1], [0, 1], [0, 1], [0, 1], [0, -1]];
const bitangentAxes = [[1, 1], [1, 1], [2, -1], [2, 1], [1, 1], [1, 1]];
const ray = new THREE.Ray();
const localRay = new THREE.Ray();
const hit = new THREE.Vector3();
const surface = new THREE.Vector3();
const tangent = new THREE.Vector3();
const bitangent = new THREE.Vector3();
const normal = new THREE.Vector3();
const sampleCount = 64;
const rays = Array.from({ length: sampleCount }, (_, index) => {
  const radius = Math.sqrt((index + 0.5) / sampleCount);
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  return [radius * Math.cos(angle), radius * Math.sin(angle), Math.sqrt(1 - radius * radius)];
});

function pack(pixels, size) {
  const key = Buffer.from(pixels).toString("base64");
  if (packed.has(key)) return packed.get(key);
  if (atlasX + size > atlasWidth) {
    atlasX = 0;
    atlasY += rowHeight;
    rowHeight = 0;
  }
  const rect = [atlasX, atlasY, size, size];
  patches.push({ pixels, rect });
  packed.set(key, rect);
  atlasX += size;
  rowHeight = Math.max(rowHeight, size);
  return rect;
}

function boxProxy(mesh, index) {
  const { width, height, depth } = mesh.geometry.parameters;
  const half = new THREE.Vector3(width / 2, height / 2, depth / 2);
  const local = new THREE.Box3(half.clone().negate(), half.clone());
  return { mesh, index, width, height, depth, half, local, inverse: mesh.matrixWorld.clone().invert(),
    world: local.clone().applyMatrix4(mesh.matrixWorld) };
}

function faceBake(box, face, occluders, range, size) {
  const { mesh, half } = box;
  const [n, ns] = normalAxes[face], [u, us] = tangentAxes[face], [v, vs] = bitangentAxes[face];
  normal.set(0, 0, 0).setComponent(n, ns).transformDirection(mesh.matrixWorld);
  tangent.set(0, 0, 0).setComponent(u, us).transformDirection(mesh.matrixWorld);
  bitangent.set(0, 0, 0).setComponent(v, vs).transformDirection(mesh.matrixWorld);
  // Direction vectors transformed once for the entire face.
  const directions = rays.map(([x, y, z]) => new THREE.Vector3().addScaledVector(tangent, x).addScaledVector(bitangent, y).addScaledVector(normal, z));
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    surface.setComponent(n, ns * half.getComponent(n))
      .setComponent(u, us * half.getComponent(u) * (2 * x / (size - 1) - 1))
      .setComponent(v, vs * half.getComponent(v) * (2 * y / (size - 1) - 1))
      .applyMatrix4(mesh.matrixWorld);
    ray.origin.copy(surface).addScaledVector(normal, 0.008);
    const close = occluders.filter((other) => other.world.distanceToPoint(ray.origin) < range);
    let blocked = 0;
    for (const direction of directions) {
      ray.direction.copy(direction);
      let closest = range;
      for (const other of close) {
        if (!ray.intersectsBox(other.world)) continue;
        localRay.copy(ray).applyMatrix4(other.inverse);
        if (other.local.containsPoint(localRay.origin)) { closest = 0; break; }
        if (!localRay.intersectBox(other.local, hit)) continue;
        const distance = hit.applyMatrix4(other.mesh.matrixWorld).distanceTo(ray.origin);
        closest = Math.min(closest, distance);
      }
      blocked += (1 - closest / range) ** 2;
    }
    pixels[y * size + x] = Math.round(255 * (1 - 0.62 * blocked / sampleCount));
  }
  return pixels.some((value) => value < 242) ? pack(pixels, size) : null;
}

function stableArchitecture(mesh) {
  for (let node = mesh; node; node = node.parent) {
    if (node.userData.walkthroughOnly || node.userData.exteriorDetail || node.userData.exteriorOnly) return false;
  }
  return mesh.userData.roomSurface === "wall" || mesh.userData.roomSurface === "floor";
}

function bake(root, walls = false) {
  root.updateMatrixWorld(true);
  let index = 0;
  const boxes = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const meshIndex = index++;
    if (mesh.isInstancedMesh || !mesh.material.isMeshStandardMaterial || mesh.material.transparent ||
        !["BoxGeometry", "RoundedBoxGeometry"].includes(mesh.geometry.type) || (walls && !stableArchitecture(mesh))) return;
    boxes.push(boxProxy(mesh, meshIndex));
  });
  const result = [];
  const range = walls ? 2.1 : 0.54;
  for (const box of boxes) {
    const { mesh, index, width, height, depth } = box;
    if (walls ? mesh.userData.roomSurface !== "wall" :
      width * height + width * depth + height * depth < 0.38) continue;
    const bounds = box.world.clone().expandByScalar(range);
    const occluders = boxes.filter((other) => other !== box && bounds.intersectsBox(other.world));
    const faces = normalAxes.map((_, face) => faceBake(box, face, occluders, range, walls ? 24 : 12));
    if (faces.some(Boolean)) result.push([index, width, height, depth, faces]);
  }
  return result;
}

const furnitureKinds = [
  "sofa", "clubSofa", "armchair", "bookshelf", "gameShelf", "openDisplayShelf",
  "climbingShoeShelf", "climbingHelmetShelf", "climbingGearShelf", "longCredenza",
  "gameTable", "diningTable", "studyDesk", "focusDesk", "photoEditDesk", "photoPrintBench"
];
const furniture = Object.fromEntries(furnitureKinds.map((kind) => [kind, bake(createFurniture(kind))]));
const walls = { "lounge:base": bake(createRoomShell({ template: "lounge", version: 11 }), true) };
for (const template of ["climbing", "boardgame", "dining", "band", "study", "photo"]) {
  for (const version of [10, 11]) {
    walls[`${template}:${version}`] = bake(createRoomShell({ template, version }), true);
  }
}
const atlasHeight = atlasY + rowHeight;
const atlas = Buffer.alloc(atlasWidth * atlasHeight, 255);
for (const { pixels, rect: [x, y, size] } of patches) {
  for (let row = 0; row < size; row++) atlas.set(pixels.subarray(row * size, (row + 1) * size), (y + row) * atlasWidth + x);
}

writeFileSync(new URL("../src/pages/space/roomBakedOcclusionData.json", import.meta.url),
  JSON.stringify({ width: atlasWidth, height: atlasHeight, furniture, walls, pixels: atlas.toString("base64") }) + "\n");
process.stdout.write(`Baked ${patches.length} occlusion tiles into ${atlasWidth}×${atlasHeight}\n`);
