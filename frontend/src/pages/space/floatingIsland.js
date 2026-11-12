import * as THREE from "three";
import { createIslandForest } from "./islandForest";
import { createIslandGarden } from "./islandGarden";
import { getIslandLayout } from "./islandLayout";

function outlineFor(bounds) {
  const { minX: l, maxX: r, minZ: b, maxZ: f } = bounds;
  const x = (l + r) / 2;
  const z = (b + f) / 2;
  return [[l + 2.7, b], [x - 9, b + 0.5], [x + 8, b], [r - 3.2, b + 0.3],
    [r, b + 3.1], [r - 0.55, z - 7], [r, z + 6], [r - 0.25, f - 3.2],
    [r - 3.2, f], [x + 8, f - 0.6], [x - 7, f], [l + 3.1, f - 0.4],
    [l, f - 3], [l + 0.5, z + 6], [l, z - 6], [l + 0.2, b + 2.8]];
}

function ringGeometry(outline, levels, center) {
  const points = levels.map(({ y, scale, irregular = 0 }) => outline.map(([x, z], index) => {
    const amount = scale + Math.sin(index * 2.1) * irregular;
    return [center.x + (x - center.x) * amount, y, center.z + (z - center.z) * amount];
  }));
  const vertices = [];
  for (let level = 0; level < points.length - 1; level += 1) {
    for (let i = 0; i < outline.length; i += 1) {
      const j = (i + 1) % outline.length;
      vertices.push(...points[level][i], ...points[level][j], ...points[level + 1][i],
        ...points[level][j], ...points[level + 1][j], ...points[level + 1][i]);
    }
  }
  const last = points.at(-1);
  for (let i = 1; i < last.length - 1; i += 1) vertices.push(...last[0], ...last[i], ...last[i + 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function lawnGeometry(outline, building) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes.push(new THREE.Path([
    new THREE.Vector2(building.minX, -building.minZ), new THREE.Vector2(building.minX, -building.maxZ),
    new THREE.Vector2(building.maxX, -building.maxZ), new THREE.Vector2(building.maxX, -building.minZ)
  ]));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const colors = [];
  const positions = geometry.getAttribute("position");
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const variation = (Math.sin(positions.getX(i) * 0.41) + Math.cos(positions.getZ(i) * 0.3)) * 0.025;
    color.setHSL(0.235 + variation * 0.2, 0.36, 0.54 + variation);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function lawnTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const x = i % size, z = Math.floor(i / size);
    const variation = 0.5 + Math.sin(x * Math.PI / 16) * Math.cos(z * Math.PI / 16) * 0.23;
    const grain = Math.sin(i * 114.139) * 0.12;
    data.fill(Math.round(219 + (variation + grain) * 32), i * 4, i * 4 + 3);
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(1 / 3);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createFloatingIsland(building, terrace) {
  const layout = getIslandLayout(building);
  const root = new THREE.Group();
  root.name = "floating-island";
  root.userData.outdoor = true;
  root.userData.entrance = true;
  const materials = new Map();
  const material = (color, flatShading = false) => {
    const key = `${color}:${flatShading}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading }));
    return materials.get(key);
  };
  const add = (name, geometry, surface) => {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const center = { x: (layout.surface.minX + layout.surface.maxX) / 2, z: (layout.surface.minZ + layout.surface.maxZ) / 2 };
  const outline = outlineFor(layout.surface);
  add("island-lawn", lawnGeometry(outline, terrace ? { ...building, maxZ: terrace.maxZ } : building),
    new THREE.MeshStandardMaterial({ map: lawnTexture(), vertexColors: true, roughness: 1 }));
  add("island-turf-edge", ringGeometry(outline, [{ y: 0, scale: 1 }, { y: -0.24, scale: 0.997 }], center), material("#69844a"));
  add("island-earth-layer", ringGeometry(outline, [{ y: -0.24, scale: 0.997 }, { y: -0.85, scale: 0.98 }], center), material("#9a7961", true));
  add("island-rock-core", ringGeometry(outline, [
    { y: -0.85, scale: 0.98 }, { y: -2.45, scale: 0.96, irregular: 0.02 },
    { y: -5.1, scale: 0.84, irregular: 0.05 }, { y: -7.25, scale: 0.49, irregular: 0.075 },
    { y: layout.bottomY, scale: 0.13, irregular: 0.035 }
  ], center), material("#9b9187", true));

  root.add(createIslandGarden(layout, building, terrace), createIslandForest(layout));
  for (const name of ["island-lawn", "island-earth-layer", "island-rock-core", "island-garden", "island-forest"]) {
    root.getObjectByName(name).traverse((object) => {
      if (object.material) object.material.userData.islandLandscape = true;
    });
  }

  const clouds = new THREE.Group();
  clouds.name = "island-clouds";
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: "#fff7e9", roughness: 1, transparent: true, opacity: 0.72, depthWrite: false });
  const puffGeometry = new THREE.SphereGeometry(1, 12, 8);
  const { minX, maxX, minZ, maxZ } = layout.surface;
  [[minX + 1, center.z + 3, -3.5], [maxX - 1, center.z - 5, -4.7], [center.x + 7, maxZ - 1, -4.2], [center.x - 6, minZ + 1, -3.7]].forEach(([x, z, y], index) => {
    for (let i = 0; i < 4; i += 1) {
      const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
      puff.position.set(x + (i - 1.5) * 0.85, y + Math.sin(i * 1.9) * 0.2, z + Math.cos(i) * 0.3);
      puff.scale.set(1.25, 0.55 + (i % 2) * 0.25, 0.85 + index * 0.08);
      clouds.add(puff);
    }
  });
  root.add(clouds);
  return root;
}
