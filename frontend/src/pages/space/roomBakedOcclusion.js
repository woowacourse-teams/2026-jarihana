import * as THREE from "three";
import bakes from "./roomBakedOcclusionData.json";

let atlas;

function getAtlas() {
  if (!atlas) {
    const binary = atob(bakes.pixels);
    const pixels = new Uint8Array(binary.length);
    for (let index = 0; index < pixels.length; index++) pixels[index] = binary.charCodeAt(index);
    atlas = new THREE.DataTexture(pixels, bakes.width, bakes.height, THREE.RedFormat);
    atlas.name = "room-baked-ambient-occlusion";
    atlas.channel = 1;
    atlas.userData.roomBakedOcclusion = true;
    atlas.minFilter = atlas.magFilter = THREE.LinearFilter;
    atlas.needsUpdate = true;
  }
  return atlas;
}

function attachBake(root, patches) {
  if (!patches?.length) return;
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  const targets = new Map();
  for (const [index, width, height, depth, faces] of patches) {
    const mesh = meshes[index];
    const geometry = mesh?.geometry;
    const dimensions = geometry?.parameters;
    if (mesh?.material.isMeshStandardMaterial && dimensions?.width === width &&
        dimensions.height === height && dimensions.depth === depth && geometry.getAttribute("uv")) {
      targets.set(mesh, faces);
    }
  }
  const sharedMaterials = new Set(meshes.filter((mesh) => !targets.has(mesh)).map((mesh) => mesh.material));
  const replacements = new Map();
  for (const [mesh, faces] of targets) {
    const geometry = mesh.geometry;
    const uv = geometry.getAttribute("uv");
    const atlasUV = new THREE.BufferAttribute(new Float32Array(uv.count * 2), 2);
    for (const { start, count, materialIndex } of geometry.groups) {
      const [x, y, width, height] = faces[materialIndex] || [0, 0, 1, 1];
      for (let entry = start; entry < start + count; entry++) {
        const vertex = geometry.index ? geometry.index.getX(entry) : entry;
        atlasUV.setXY(vertex,
          (x + 0.5 + (width - 1) * THREE.MathUtils.clamp(uv.getX(vertex), 0, 1)) / bakes.width,
          (y + 0.5 + (height - 1) * THREE.MathUtils.clamp(uv.getY(vertex), 0, 1)) / bakes.height);
      }
    }
    geometry.setAttribute("uv1", atlasUV);
    const original = mesh.material;
    if (!replacements.has(original)) {
      const material = sharedMaterials.has(original) ? original.clone() : original;
      material.aoMap = getAtlas();
      material.aoMapIntensity = 0.8;
      material.needsUpdate = true;
      replacements.set(original, material);
    }
    mesh.material = replacements.get(original);
  }
}

export function applyBakedWallOcclusion(shell, template, version = 11) {
  const layoutVersion = template === "lounge" ? "base" : version;
  attachBake(shell, bakes.walls[`${template}:${layoutVersion}`]);
}

export function applyBakedFurnitureOcclusion(object, kind) {
  attachBake(object, bakes.furniture[kind]);
}
