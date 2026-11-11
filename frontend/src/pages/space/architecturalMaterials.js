import * as THREE from "three";

// Neutral PBR grain and joints use physical dimensions and preserve user tint.
function hash(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u),
    THREE.MathUtils.lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u), v);
}
function texture(data, size, color = false) {
  const map = new THREE.DataTexture(data, size, size);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

const surfaceData = new Map();

export function createSurfaceMaterial(kind, color, width = 4, depth = 4, patternScale = 1, onReady, profile = {}) {
  const size = 512;
  const plankWidth = profile.plankWidth || (kind === "walnut" ? 0.2 : 0.25);
  const plankLength = profile.plankLength || (kind === "walnut" ? 2.2 : 2.8);
  const tileSize = profile.tileSize || 1;
  const seed = profile.seed || 0;
  const cacheKey = `${kind}:${plankWidth}:${plankLength}:${tileSize}:${seed}`;
  const cached = surfaceData.get(cacheKey);
  const albedo = cached?.albedo || new Uint8Array(size * size * 4);
  const relief = cached?.relief || new Uint8Array(albedo.length);
  const roughness = cached?.roughness || new Uint8Array(albedo.length);
  if (!cached) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const fine = hash(x, y, 12);
    const cloud = noise(u * 22, v * 22, 3) * 0.6 + noise(u * 71, v * 71, 8) * 0.4;
    let value, height, rough;
    if (["oak", "walnut", "herringbone"].includes(kind)) {
      const hu = (u + v) * 16, hv = (v - u + 1) * 16;
      const ix = Math.floor(hu), iy = Math.floor(hv);
      const diagonal = ((ix + iy) % 8 + 8) % 8;
      const horizontal = diagonal < 4;
      const alongHerring = horizontal ? (diagonal + hu - ix) / 4 : (diagonal - 4 + hv - iy) / 4;
      const crossHerring = horizontal ? hv - iy : hu - ix;
      const row = kind === "herringbone" ? (horizontal ? iy : ix) : Math.floor(v * 16);
      const cross = kind === "herringbone" ? crossHerring : v * 16 - row;
      const offset = hash(row, 1, seed) * 0.8;
      const along = kind === "herringbone" ? alongHerring : ((u * 2 + offset) % 1 + 1) % 1;
      const plank = kind === "herringbone" ? (horizontal ? ix - diagonal : iy - diagonal + 4) : Math.floor(u * 2 + offset);
      const bend = noise(u * 5, row, 4) * 0.12 + Math.sin(u * 11 + row) * 0.025;
      const grain = Math.sin((cross + bend) * 105 + noise(u * 30, cross * 6, row) * 4);
      const pore = Math.max(0, Math.sin((cross + bend) * 390)) ** 20;
      const seam = cross < 0.018 || along < 0.003;
      const variation = hash(row, plank, 7 + seed);
      value = seam ? 0.36 : 0.80 + variation * 0.15 + grain * 0.028 - pore * 0.045 + fine * 0.025;
      height = seam ? 0.05 : 0.55 + grain * 0.055 - pore * 0.1 + fine * 0.025;
      rough = seam ? 0.9 : 0.44 + variation * 0.12 + pore * 0.14;
    } else if (kind === "brick") {
      const row = Math.floor(v * 24), column = (u * 8 + row % 2 * 0.5) % 1;
      const joint = v * 24 % 1 < 0.09 || column < 0.025;
      value = joint ? 0.92 : 0.68 + hash(Math.floor(u * 8 + row % 2 * 0.5), row) * 0.22 + cloud * 0.08;
      height = joint ? 0.1 : 0.65 + fine * 0.15 + cloud * 0.13;
      rough = 0.94;
    } else if (kind === "acoustic") {
      const weave = (x % 3 === 0 ? -1 : 1) + (y % 3 === 0 ? -1 : 1);
      const pore = fine < 0.13;
      value = 0.77 + cloud * 0.08 + weave * 0.017 - (pore ? 0.08 : 0);
      height = 0.48 + weave * 0.07 - (pore ? 0.16 : 0);
      rough = 0.98;
    } else if (kind === "woodpanel") {
      const rib = u * 16 % 1;
      const joint = rib < 0.045;
      value = joint ? 0.29 : 0.85 + cloud * 0.08 + fine * 0.03;
      height = joint ? 0.05 : 0.75 + fine * 0.035;
      rough = 0.62;
    } else if (kind === "wallpaper") {
      const weave = (x % 4 < 2 ? 1 : -1) + (y % 4 < 2 ? 1 : -1);
      value = 0.93 + weave * 0.014 + cloud * 0.025;
      height = 0.5 + weave * 0.08;
      rough = 0.95;
    } else if (kind === "terrazzo") {
      const chip = noise(u * 180, v * 180, 55);
      const mineral = chip > 0.7 ? 0.62 : chip < 0.27 ? 0.82 : 0.98;
      value = mineral + fine * 0.015; height = 0.5 + fine * 0.03; rough = 0.48 + chip * 0.2;
    } else if (kind === "checker") {
      const tx = u * 8, ty = v * 8;
      const joint = tx % 1 < 0.025 || ty % 1 < 0.025;
      value = joint ? 0.6 : (Math.floor(tx) + Math.floor(ty)) % 2 ? 0.47 + cloud * 0.04 : 0.96 + cloud * 0.035;
      height = joint ? 0.15 : 0.55; rough = 0.45 + fine * 0.06;
    } else if (kind === "stone") {
      const tileX = u * 4, tileY = v * 4;
      const edge = Math.min(tileX % 1, tileY % 1, 1 - tileX % 1, 1 - tileY % 1);
      const seam = edge < 0.008;
      const vein = Math.max(0, Math.sin(u * 39 + v * 18 + cloud * 13)) ** 30;
      value = seam ? 0.6 : 0.86 + hash(Math.floor(tileX), Math.floor(tileY), 29) * 0.08 + cloud * 0.05 - vein * 0.035 + fine * 0.018;
      height = seam ? 0.1 : 0.55 + cloud * 0.03 + fine * 0.025;
      rough = 0.65 + cloud * 0.16;
    } else {
      const trowel = noise(u * 8, v * 8, 17);
      value = kind === "limewash" ? 0.93 + trowel * 0.04 + cloud * 0.025 : kind === "concrete" ? 0.8 + cloud * 0.13 + trowel * 0.08 : 0.88 + cloud * 0.08 + trowel * 0.06 + fine * 0.025;
      height = 0.35 + cloud * 0.25 + fine * 0.13;
      rough = 0.85 + cloud * 0.12;
    }
    const i = (y * size + x) * 4;
    const gray = Math.min(255, Math.round(value * 255));
    albedo.set([gray, gray, gray, 255], i);
    relief.set([height * 255, height * 255, height * 255, 255], i);
    roughness.set([rough * 255, rough * 255, rough * 255, 255], i);
  }
  surfaceData.set(cacheKey, { albedo, relief, roughness });
  }
  const map = texture(albedo, size, true), bumpMap = texture(relief, size), roughnessMap = texture(roughness, size);
  const wood = kind === "oak" || kind === "walnut";
  const repeatWidth = wood ? plankLength * 2 : kind === "stone" ? tileSize * 4 : 4;
  const repeatDepth = wood ? plankWidth * 16 : kind === "stone" ? tileSize * 4 : 4;
  for (const channel of [map, bumpMap, roughnessMap]) {
    channel.repeat.set(width / (repeatWidth * patternScale), depth / (repeatDepth * patternScale));
    if (wood && profile.direction === 1) {
      channel.rotation = Math.PI / 2;
      channel.repeat.set(depth / (repeatWidth * patternScale), width / (repeatDepth * patternScale));
    }
  }
  const material = new THREE.MeshStandardMaterial({ color, map, bumpMap, roughnessMap, roughness: 1,
    bumpScale: kind === "brick" ? 0.008 : kind === "acoustic" || kind === "woodpanel" ? 0.006 : 0.0015, metalness: 0 });
  material.name = `pbr-${kind}`;
  material.userData.surfaceProfile = { ...profile, repeatWidth, repeatDepth };
  return material;
}

const woodGrainPixels = new Map();

export function createWoodGrain(size = 256) {
  if (!woodGrainPixels.has(size)) {
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const bend = noise(u * 5, v * 2, 21) * 0.06;
      const ring = Math.sin((v + bend) * 220 + noise(u * 30, v * 7) * 3);
      const pore = Math.max(0, Math.sin((v + bend) * 850)) ** 16;
      const value = 222 + ring * 8 - pore * 13 + noise(u * 7, v * 23, 5) * 17;
      pixels.set([value, value - 2, value - 5, 255], (y * size + x) * 4);
    }
    woodGrainPixels.set(size, pixels);
  }
  return texture(woodGrainPixels.get(size), size, true);
}
