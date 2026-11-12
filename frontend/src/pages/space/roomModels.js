import { createSurfaceFurniture } from "./surfaceFurniture";
import { createDetailAsset } from "./detailAssets";
import { buildLowEdgeLight } from "./lowEdgeLight";
import { finishArchitecture } from "./architecturalFinishes";
import { createReferenceFurnishing } from "./referenceFurnishings";
import { createDiningBandAsset } from "./diningBandAssets";
import { createStudyPhotoAsset } from "./studyPhotoAssets";
import { createCommonFunctionAsset } from "./commonFunctionModels";
import { createClubhouseArchitecture } from "./clubhouseArchitecture";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CLIMBING, BOARDGAME, getRoomLayout } from "./roomLayout";
import { createBoardgameFurniture, createBoardgameShell, createBoardgameFacility } from "./boardgameModels";
import { createBuildingContext } from "./roomBuilding";
import { CLIMBING_WALL_INNER_FACE } from "./themeArchitecture";

const CLIMBING_PANEL_REAR = -0.98;

export function climbingPanelBacking(item, room, layout) {
  if (room.template !== "climbing" || room.version !== 11 || item.level || !item.kind.startsWith("climbingWall")) return 0;
  const side = item.rotation === 0 ? "back" : item.rotation === 1 ? "left" : null;
  if (!side) return 0;

  const { building, openings } = layout;
  const distance = side === "back" ? item.z - building.minZ : item.x - building.minX;
  const scaleZ = item.scaleZ ?? 1;
  const gap = distance - CLIMBING_WALL_INNER_FACE + CLIMBING_PANEL_REAR * scaleZ;
  if (gap <= 0 || gap > 0.5) return 0;

  const alongWall = side === "back" ? item.x : item.z;
  const halfWidth = climbingPanelWidth(item.kind) * (item.scaleX ?? 1) / 2;
  if (openings?.[side]?.some((opening) => Math.abs(alongWall - opening.x) < opening.width / 2 + halfWidth)) return 0;
  return gap / scaleZ;
}

function climbingPanelWidth(kind) {
  return kind === "climbingWallNarrow" ? 2.825 : 3.3125;
}

const PALETTE = {
  wood: "#c89a65",
  lightWood: "#e5bc87",
  darkWood: "#8d6145",
  cream: "#fff0da",
  ink: "#45485e",
  leaf: "#72a951",
  leafLight: "#9bc269",
  blue: "#5369ce",
  yellow: "#edbd55",
  pink: "#e6c8c4"
};

// Keep each model's resources local, so replacing one furnishing never disposes another.
function modelKit(name) {
  const group = new THREE.Group();
  group.name = name;
  const materials = new Map();
  const material = (color, roughness = 0.78) => {
    const key = `${color}:${roughness}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    }
    return materials.get(key);
  };
  const mesh = (geometry, color, x, y, z, parent = group) => {
    const item = new THREE.Mesh(geometry, material(color));
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const box = (w, h, d, color, x, y, z, radius = 0.06, parent = group) =>
    mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)),
      color,
      x,
      y,
      z,
      parent
    );
  const sphere = (sx, sy, sz, color, x, y, z, parent = group) => {
    const item = mesh(new THREE.SphereGeometry(1, 16, 12), color, x, y, z, parent);
    item.scale.set(sx, sy, sz);
    return item;
  };
  const cylinder = (top, bottom, height, color, x, y, z, parent = group) =>
    mesh(new THREE.CylinderGeometry(top, bottom, height, 18), color, x, y, z, parent);
  return { group, box, sphere, cylinder, mesh, material };
}

function addWarmBulb(kit, x, y, z, radius = 0.12) {
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({
    color: "#fff0c9", emissive: "#ffd288", emissiveIntensity: 0.75, roughness: 0.4
  }));
  bulb.scale.set(radius, radius * 1.12, radius);
  bulb.position.set(x, y, z);
  bulb.userData.roomBulb = true;
  kit.group.add(bulb);
  kit.cylinder(radius * 0.43, radius * 0.43, 0.06, PALETTE.darkWood, x, y + radius * 1.1, z);
}

function addTrailingPlant(kit, x, y, z) {
  const vine = new THREE.Group();
  vine.position.set(x, y, z);
  kit.group.add(vine);
  kit.cylinder(0.19, 0.14, 0.26, "#c88960", 0, 0.13, 0, vine);
  for (const side of [-1, 1]) {
    const points = [];
    for (let step = 0; step < 7; step += 1) {
      const vx = side * (0.08 + Math.sin(step * 0.8) * 0.12);
      const vy = 0.22 - step * 0.13;
      const vz = 0.11 + step * 0.022;
      points.push(new THREE.Vector3(vx, vy, vz));
      const leaf = kit.sphere(0.11, 0.15, 0.035, step % 2 ? PALETTE.leaf : PALETTE.leafLight, vx + side * 0.07, vy, vz, vine);
      leaf.rotation.set(0.3, side * 0.4, side * 0.6);
    }
    vine.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: "#72834a" })));
  }
}

function addLegs(kit, width, depth, height, color = PALETTE.darkWood) {
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      kit.cylinder(0.055, 0.04, height, color, x, height / 2, z);
    }
  }
}

function addPlant(kit, x, y, z, scale = 1, flowering = false) {
  const plant = new THREE.Group();
  plant.position.set(x, y, z);
  plant.scale.setScalar(scale);
  kit.group.add(plant);
  kit.cylinder(0.23, 0.17, 0.36, "#f3e5da", 0, 0.18, 0, plant);
  kit.cylinder(0.207, 0.207, 0.025, "#705346", 0, 0.36, 0, plant);
  kit.cylinder(0.018, 0.026, 0.62, "#648249", 0, 0.64, 0, plant);
  const leaves = [
    [-0.16, 0.65, 0.04, -0.65],
    [0.18, 0.72, 0.02, 0.6],
    [-0.1, 0.9, -0.09, -0.6],
    [0.12, 0.98, -0.04, 0.5],
    [0, 1.1, 0.04, 0.08],
    [-0.08, 0.78, 0.17, -0.35]
  ];
  leaves.forEach(([lx, ly, lz, tilt], index) => {
    if (flowering && index === 4) return;
    const leaf = kit.sphere(
      0.11,
      0.23,
      0.055,
      index % 2 ? PALETTE.leaf : PALETTE.leafLight,
      lx,
      ly,
      lz,
      plant
    );
    leaf.rotation.set(0.25, index * 0.8, -tilt);
  });
  if (flowering) {
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal * Math.PI * 2 / 5;
      const mesh = kit.sphere(0.069, 0.069, 0.037, "#fff0dc",
        Math.cos(angle) * 0.074, 1.04 + Math.sin(angle) * 0.074, 0.055, plant);
      mesh.name = "plant-petal";
    }
    kit.sphere(0.055, 0.055, 0.045, "#eebc60", 0, 1.04, 0.084, plant);
  }
  return plant;
}

function addCup(kit, x, y, z, color = PALETTE.cream, liquid = "#92715e") {
  kit.cylinder(0.085, 0.066, 0.15, color, x, y + 0.075, z);
  kit.cylinder(0.065, 0.065, 0.007, liquid, x, y + 0.152, z);
  const handle = kit.mesh(
    new THREE.TorusGeometry(0.049, 0.015, 7, 12),
    color,
    x + 0.09,
    y + 0.08,
    z
  );
  handle.rotation.y = Math.PI / 2;
}

function addBooks(kit, x, y, z, count = 6, scale = 1) {
  const colors = ["#56638f", "#ebce87", "#e8a897", "#8ea598", "#b2a5ce", "#e9dfc9"];
  for (let i = 0; i < count; i += 1) {
    const height = (0.36 + (i % 3) * 0.04) * scale;
    const book = kit.box(
      0.11 * scale,
      height,
      0.24 * scale,
      colors[i % colors.length],
      x + i * 0.125 * scale,
      y + height / 2,
      z,
      0.012
    );
    if (i === count - 1) book.rotation.z = -0.08;
    kit.box(0.065 * scale, 0.014 * scale, 0.008, "#f8ecd6", book.position.x, y + height * 0.78, z + 0.125 * scale, 0.002);
  }
}

function createSofa(color) {
  const kit = modelKit("sofa");
  addLegs(kit, 2.42, 0.72, 0.2);
  kit.box(2.8, 0.3, 1.1, color, 0, 0.32, 0, 0.12);
  kit.box(2.8, 0.78, 0.24, color, 0, 0.75, -0.43, 0.1);
  for (const x of [-0.84, 0, 0.84]) {
    kit.box(0.81, 0.23, 0.83, color, x, 0.56, 0.08, 0.09);
    const cushion = kit.box(0.81, 0.58, 0.23, color, x, 0.87, -0.27, 0.1);
    cushion.rotation.x = -0.08;
  }
  for (const x of [-1.31, 1.31]) kit.box(0.18, 0.54, 1.02, color, x, 0.62, 0, 0.08);
  for (const [x, pillowColor, tilt] of [[-0.89, "#fff0d3", -0.16], [0.94, "#d79a79", 0.13]]) {
    const pillow = kit.box(0.5, 0.44, 0.2, pillowColor, x, 0.88, -0.035, 0.09);
    pillow.rotation.set(-0.12, 0, tilt);
  }
  kit.box(0.55, 0.025, 0.77, "#dfb7a0", 0.39, 0.7, 0.12, 0.018);
  kit.box(0.55, 0.34, 0.025, "#dfb7a0", 0.39, 0.52, 0.52, 0.018);
  for (const x of [0.2, 0.38, 0.56]) {
    kit.box(0.035, 0.008, 0.75, "#f8e7cb", x, 0.718, 0.12, 0.004);
    kit.box(0.035, 0.32, 0.008, "#f8e7cb", x, 0.52, 0.537, 0.004);
  }
  return kit.group;
}

function createArmchair(color) {
  const kit = modelKit("armchair");
  addLegs(kit, 0.76, 0.68, 0.28);
  kit.box(1.1, 0.2, 1.02, color, 0, 0.39, 0, 0.11);
  kit.box(1.08, 0.85, 0.26, color, 0, 0.78, -0.4, 0.11);
  kit.box(0.78, 0.2, 0.77, color, 0, 0.56, 0.08, 0.1);
  for (const x of [-0.46, 0.46]) kit.box(0.18, 0.48, 0.92, color, x, 0.65, 0.02, 0.08);
  const pillow = kit.box(0.46, 0.44, 0.16, "#fff0d4", 0.03, 0.83, -0.18, 0.09);
  pillow.rotation.set(-0.12, 0.08, -0.15);
  return kit.group;
}

function createTable(color) {
  const kit = modelKit("table");
  addLegs(kit, 1.95, 1.08, 0.92);
  kit.box(2.4, 0.14, 1.5, color, 0, 0.98, 0, 0.13);
  kit.box(0.42, 0.045, 0.3, "#e6b85b", -0.65, 1.07, 0.32, 0.015);
  kit.box(0.38, 0.022, 0.29, "#fff4dd", -0.65, 1.1, 0.32, 0.01);
  addCup(kit, 0.73, 1.05, 0.26);
  addCup(kit, -0.64, 1.05, -0.4, "#8d9ecf");
  addPlant(kit, 0.06, 1.05, -0.08, 0.37);
  return kit.group;
}

function createBookshelf(color) {
  const kit = modelKit("bookshelf");
  kit.box(1.8, 2.05, 0.08, color, 0, 1.105, -0.28, 0.03);
  for (const x of [-0.85, 0.85]) kit.box(0.1, 2.15, 0.65, color, x, 1.075, 0, 0.025);
  for (const y of [0.1, 0.69, 1.32, 2.11]) kit.box(1.8, 0.1, 0.65, color, 0, y, 0, 0.025);
  kit.box(1.6, 0.52, 0.48, "#cfa374", 0, 0.39, 0.03, 0.035);
  kit.box(0.017, 0.42, 0.018, "#a97e57", 0, 0.39, 0.28, 0.005);
  for (const x of [-0.1, 0.1]) kit.sphere(0.026, 0.026, 0.018, PALETTE.darkWood, x, 0.39, 0.295);
  addBooks(kit, -0.7, 0.74, 0.09, 7);
  addBooks(kit, -0.7, 1.37, 0.09, 5, 1.2);
  kit.box(0.38, 0.28, 0.38, "#c2bbd9", 0.52, 0.88, 0.06, 0.03);
  kit.box(0.15, 0.04, 0.015, "#f2e6d9", 0.52, 0.92, 0.26, 0.009);
  addPlant(kit, 0.48, 1.37, 0.05, 0.48);
  return kit.group;
}

function createMemory(color) {
  const kit = modelKit("memory");
  kit.box(0.9, 0.09, 0.52, color, 0, 0.045, 0, 0.05);
  kit.box(0.12, 0.55, 0.1, color, 0, 0.3, -0.1, 0.035);
  kit.box(1, 0.91, 0.14, color, 0, 0.94, -0.05, 0.045);
  kit.box(0.81, 0.69, 0.025, "#fff7e9", 0, 0.94, 0.035, 0.015);
  return kit.group;
}

function createBench(color) {
  const kit = modelKit("bench");
  addLegs(kit, 1.65, 0.48, 0.56);
  kit.box(2, 0.15, 0.8, color, 0, 0.635, 0, 0.065);
  for (const x of [-0.84, 0.84]) kit.box(0.08, 0.63, 0.09, PALETTE.darkWood, x, 0.92, -0.32, 0.025);
  kit.box(2, 0.38, 0.12, color, 0, 1.07, -0.34, 0.055);
  kit.box(1.85, 0.08, 0.55, "#edddbf", 0, 0.74, 0.045, 0.035);
  return kit.group;
}

function createBeanbag(color) {
  const kit = modelKit("beanbag");
  kit.sphere(0.6, 0.32, 0.6, color, 0, 0.33, 0);
  const back = kit.sphere(0.5, 0.38, 0.27, color, 0, 0.6, -0.24);
  back.rotation.x = -0.25;
  kit.sphere(0.39, 0.07, 0.32, color, 0, 0.56, 0.1);
  kit.box(0.09, 0.035, 0.07, "#f8ecd6", 0.47, 0.42, 0.24, 0.015);
  return kit.group;
}

function addFood(kit, food) {
  kit.cylinder(0.43, 0.39, 0.035, "#fff5df", 0, 1.075, 0);
  if (food === "ramen") {
    kit.cylinder(0.35, 0.21, 0.21, "#c86b54", 0, 1.19, 0);
    kit.cylinder(0.31, 0.31, 0.015, "#dfae60", 0, 1.3, 0);
    for (let index = 0; index < 4; index += 1) {
      const noodle = kit.mesh(new THREE.TorusGeometry(0.12 + index * 0.025, 0.012, 5, 16, Math.PI * 1.6), "#f4d891", 0, 1.315, 0);
      noodle.rotation.set(Math.PI / 2, 0, index * 0.8);
    }
    kit.sphere(0.1, 0.025, 0.14, "#fff5dc", 0.13, 1.335, 0.07);
    kit.sphere(0.055, 0.025, 0.065, "#edb63f", 0.13, 1.356, 0.07);
    for (const x of [-0.11, -0.04]) kit.box(0.035, 0.025, 0.17, "#679653", x, 1.34, -0.13, 0.008);
  } else if (food === "dessert") {
    kit.cylinder(0.28, 0.28, 0.24, "#ebcaa0", 0, 1.22, 0);
    kit.cylinder(0.29, 0.29, 0.055, "#fff2df", 0, 1.365, 0);
    kit.cylinder(0.282, 0.282, 0.045, "#c87975", 0, 1.215, 0);
    for (const x of [-0.11, 0.11]) kit.sphere(0.07, 0.085, 0.07, "#d66664", x, 1.44, 0);
  } else {
    kit.cylinder(0.36, 0.36, 0.055, "#d6a066", 0, 1.12, 0);
    kit.cylinder(0.32, 0.32, 0.016, "#efcb67", 0, 1.155, 0);
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      kit.cylinder(0.055, 0.055, 0.015, "#c56e58", Math.cos(angle) * 0.21, 1.172, Math.sin(angle) * 0.21);
      kit.sphere(0.022, 0.018, 0.05, "#74994f", Math.cos(angle + 0.3) * 0.13, 1.18, Math.sin(angle + 0.3) * 0.13);
    }
  }
}

function createDiningTable(color, food) {
  const kit = modelKit("diningTable");
  addLegs(kit, 2.95, 1.27, 0.92);
  kit.box(3.4, 0.14, 1.7, color, 0, 0.98, 0, 0.12);
  kit.box(0.78, 0.012, 1.68, "#e8d4b5", 0, 1.057, 0, 0.015);
  for (const x of [-1.02, 1.02]) {
    for (const z of [-0.48, 0.48]) {
      kit.cylinder(0.22, 0.2, 0.027, "#fff2d9", x, 1.075, z);
      kit.cylinder(0.16, 0.16, 0.006, "#ecdfcd", x, 1.092, z);
      addCup(kit, x + 0.33, 1.052, z, "#e3b172");
    }
  }
  addFood(kit, food);
  return kit.group;
}

function createMusicConsole() {
  const kit = modelKit("musicConsole");
  addLegs(kit, 1.14, 0.48, 0.25, "#795440");
  kit.box(1.4, 0.57, 0.7, "#ba875b", 0, 0.51, 0, 0.035);
  kit.box(1.44, 0.07, 0.72, "#e3b47e", 0, 0.82, 0, 0.025);
  kit.box(0.68, 0.4, 0.035, "#644a3e", 0, 0.52, 0.356, 0.006);
  for (let i = 0; i < 11; i += 1) {
    kit.box(0.037, 0.31 + (i % 3) * 0.015, 0.26,
      ["#88616b", "#c3a576", "#536666", "#c78c60"][i % 4], -0.25 + i * 0.049, 0.51, 0.26, 0.006);
  }
  for (const side of [-1, 1]) {
    kit.box(0.25, 0.43, 0.025, "#3f3938", side * 0.51, 0.51, 0.36, 0.018);
    for (const [y, radius] of [[0.43, 0.085], [0.64, 0.045]]) {
      const rim = kit.cylinder(radius, radius, 0.025, "#b69364", side * 0.51, y, 0.38);
      rim.rotation.x = Math.PI / 2;
      const cone = kit.cylinder(radius * 0.8, radius * 0.8, 0.029, "#282d32", side * 0.51, y, 0.395);
      cone.rotation.x = Math.PI / 2;
    }
  }
  kit.box(0.77, 0.07, 0.52, "#4a4140", 0, 0.89, 0, 0.025);
  const record = kit.cylinder(0.225, 0.225, 0.014, "#252a32", -0.09, 0.936, 0);
  record.name = "music-console-vinyl";
  for (const radius of [0.12, 0.16, 0.2]) {
    const groove = kit.mesh(new THREE.TorusGeometry(radius, 0.003, 4, 40), "#49494b", -0.09, 0.944, 0);
    groove.rotation.x = Math.PI / 2;
  }
  kit.cylinder(0.065, 0.065, 0.016, "#d9ab65", -0.09, 0.946, 0);
  kit.cylinder(0.011, 0.011, 0.03, "#d0c6b2", -0.09, 0.96, 0);
  kit.cylinder(0.035, 0.035, 0.06, "#bdad92", 0.27, 0.956, -0.16);
  const arm = kit.box(0.018, 0.018, 0.27, "#d5c5a3", 0.22, 0.993, -0.04, 0.005);
  arm.rotation.y = 0.4;
  kit.box(0.055, 0.026, 0.07, "#e7c18a", 0.17, 0.989, 0.08, 0.008);
  kit.sphere(0.018, 0.018, 0.008, "#8ebd9b", 0.56, 0.76, 0.36);
  return kit.group;
}

export function createFurniture(kind, { color, food = "pizza", accentColor, matColor, variant = 0, suspension, panelBacking = 0 } = {}) {
  if (kind === "lowEdgeLight") {
    const light = new THREE.Group();
    light.name = kind;
    buildLowEdgeLight(light, color);
    return light;
  }
  const body = createSurfaceFurniture(kind, { color });
  if (body) return body;
  const detail = createDetailAsset(kind, { color, variant, suspension, food });
  if (detail) return detail;
  const reference = createReferenceFurnishing(kind, { color });
  if (reference) return reference;
  const common = createCommonFunctionAsset(kind, { color }, modelKit);
  if (common) return common;
  const themed = createDiningBandAsset(kind, { color }) || createStudyPhotoAsset(kind, { color });
  if (themed) return themed;
  if (kind === "musicConsole") return createMusicConsole();
  const facility = createLegacyFacility(kind, { color: kind.startsWith("crashMat") ? color || matColor : kind.startsWith("climbingWall") ? color || accentColor : color, panelBacking });
  if (facility) return facility;
  if (["gameTable", "gameShelf", "gameChair", "roundChair", "clubSofa", "gameCredenza", "loungeRug", "floorLamp"].includes(kind)) return createBoardgameFurniture(kind, { color });
  if (kind === "sofa") return createSofa(color || PALETTE.blue);
  if (kind === "armchair") return createArmchair(color || PALETTE.yellow);
  if (kind === "table") return createTable(color || PALETTE.lightWood);
  if (kind === "bookshelf") return createBookshelf(color || PALETTE.wood);
  if (kind === "memory") return createMemory(color || PALETTE.darkWood);
  if (kind === "bench") return createBench(color || PALETTE.wood);
  if (kind === "beanbag") return createBeanbag(color || PALETTE.blue);
  if (kind === "diningTable") return createDiningTable(color || PALETTE.lightWood, food);
  const kit = modelKit(kind);
  if (kind === "plant") {
    addPlant(kit, 0, 0, 0, 0.9, true);
  } else if (kind === "rug") {
    const rug = kit.cylinder(1, 1, 0.025, color || "#ecdbcd", 0, 0.017, 0);
    rug.scale.set(1.4, 1, 1);
    const center = kit.cylinder(1, 1, 0.008, color || "#f0e3d7", 0, 0.033, 0);
    center.scale.set(1.32, 1, 0.93);
    for (const [radius, ringColor] of [[1, "#b88c71"], [0.93, "#fff1d7"], [0.86, "#ceb295"]]) {
      const stitching = kit.mesh(new THREE.TorusGeometry(radius, 0.012, 5, 48), ringColor, 0, 0.044, 0);
      stitching.rotation.x = Math.PI / 2;
      stitching.scale.set(1.27, 0.87, 1);
      stitching.castShadow = false;
    }
    for (const side of [-1, 1]) {
      for (const z of [-0.24, -0.12, 0, 0.12, 0.24]) {
        kit.box(0.095, 0.012, 0.025, "#f3e2c4", side * 1.34, 0.025, z, 0.006);
      }
    }
  } else if (kind === "stool") {
    addLegs(kit, 0.4, 0.4, 0.58);
    kit.cylinder(0.325, 0.31, 0.12, color || PALETTE.lightWood, 0, 0.64, 0);
  } else {
    throw new Error(`Unknown room furniture kind: ${kind}`);
  }
  return kit.group;
}

function addRoomSurface(kit, width, height, depth, color, x, y, z, surface, shade = 1) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(shade), roughness: 0.82 })
  );
  mesh.position.set(x, y, z);
  mesh.userData.roomSurface = surface;
  mesh.userData.surfaceShade = shade;
  mesh.castShadow = surface === "wall";
  mesh.receiveShadow = true;
  kit.group.add(mesh);
  return mesh;
}

const LOUNGE_TIMBER = "#996341";
const LOUNGE_TRIM = "#31504a";
const LOUNGE_PANEL = "#6d8d80";
const LOUNGE_WINDOW_SILL = 4.65;

function addWindow(kit, x, y, z, width, height, bays, side = false) {
  const frame = new THREE.Group();
  frame.name = "lounge-clerestory";
  frame.position.set(x, y, z);
  if (side) frame.rotation.y = Math.PI / 2;
  kit.group.add(frame);
  const span = width / bays;
  for (let bay = 0; bay < bays; bay += 1) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(span, height, 0.035),
      new THREE.MeshStandardMaterial({
        color: bay % 2 ? "#b1d0d0" : "#c1dcdb", roughness: 0.26, emissive: "#b5d6dc", emissiveIntensity: 0.15
      }));
    glass.position.x = -width / 2 + (bay + 0.5) * span;
    glass.userData.roomWindow = true;
    frame.add(glass);
  }
  for (let bay = 0; bay <= bays; bay += 1) {
    kit.box(bay % 2 ? 0.08 : 0.17, height + 0.16, 0.3, LOUNGE_TRIM, -width / 2 + bay * span, 0, 0, 0.012, frame);
  }
  for (const dy of [-height / 2, height * 0.22, height / 2]) {
    kit.box(width + 0.16, 0.085, 0.29, LOUNGE_TRIM, 0, dy, 0, 0.012, frame);
  }
  kit.box(width + 0.35, 0.15, 0.48, LOUNGE_TIMBER, 0, -height / 2 - 0.06, 0, 0.025, frame);
}

function addBuildingWall(room, wall, wallColor, building) {
  const kit = modelKit("building-wall");
  kit.group.userData.walkthroughOnly = Boolean(wall.cutaway);
  kit.group.userData.buildingWall = true;
  room.group.add(kit.group);
  const { width, depth, height, x, z } = wall;
  const front = z === building.maxZ;
  const bottom = front ? 2.5 : 0;
  const alongX = width > depth;
  const length = alongX ? width : depth;
  const hall = height === building.height;
  const exterior = front || z === building.minZ || x === building.minX || x === building.maxX;
  const glazing = exterior ? (hall ? [LOUNGE_WINDOW_SILL, height - 0.48, Math.max(2, Math.round(length / 1.6))] : [2.83, 3.86, 4]) : null;
  if (glazing) {
    const [sill, head, bays] = glazing;
    const pier = hall ? 0.43 : 0.32;
    addRoomSurface(kit, width, sill - bottom, depth, wallColor, x, (sill + bottom) / 2, z, "wall");
    addRoomSurface(kit, width, height - head, depth, wallColor, x, (height + head) / 2, z, "wall");
    for (const side of [-1, 1]) {
      const offset = side * (length - pier) / 2;
      addRoomSurface(kit, alongX ? pier : width, head - sill, alongX ? depth : pier, wallColor,
        x + (alongX ? offset : 0), (head + sill) / 2, z + (alongX ? 0 : offset), "wall");
    }
    addWindow(kit, x, (head + sill) / 2, z, length - 2 * pier, head - sill, bays, !alongX);
  } else {
    addRoomSurface(kit, width, height - bottom, depth, wallColor, x, (height + bottom) / 2, z, "wall");
  }
  kit.box(width + 0.09, 0.22, depth + 0.13, LOUNGE_TRIM, x, height - 0.1, z, 0.018);
  if (front) {
    kit.box(width + 0.04, 0.18, depth + 0.1, LOUNGE_TIMBER, x, 2.59, z, 0.02);
    return;
  }
  kit.box(width + 0.035, 0.96, depth + 0.035, LOUNGE_PANEL, x, 0.49, z, 0.012);
  for (const y of [0.09, 1]) {
    kit.box(width + 0.085, 0.12, depth + 0.085, LOUNGE_TIMBER, x, y, z, 0.015);
  }
  const panels = Math.max(1, Math.round(length / 0.52));
  for (let panel = 1; panel < panels; panel += 1) {
    const offset = -length / 2 + panel * length / panels;
    kit.box(alongX ? 0.025 : width + 0.055, 0.82, alongX ? depth + 0.055 : 0.025,
      LOUNGE_TRIM, x + (alongX ? offset : 0), 0.54, z + (alongX ? 0 : offset), 0.004);
  }
}

function addDoorFrames(kit, wallColor, { height }) {
  const front = modelKit("entrance-facade");
  front.group.userData.walkthroughOnly = true;
  kit.group.add(front.group);
  const windowHead = height - 0.48;
  const canopyTop = 3.01;
  addRoomSurface(front, 3, LOUNGE_WINDOW_SILL - canopyTop, 0.24, wallColor,
    -2, (LOUNGE_WINDOW_SILL + canopyTop) / 2, 5, "wall");
  addRoomSurface(front, 3, 0.48, 0.24, wallColor, -2, height - 0.24, 5, "wall");
  front.box(3.1, 0.22, 0.37, LOUNGE_TRIM, -2, height - 0.1, 5, 0.02);
  addWindow(front, -2, (LOUNGE_WINDOW_SILL + windowHead) / 2, 5, 3, windowHead - LOUNGE_WINDOW_SILL, 2);
  for (const z of [-4.5, 2]) {
    addRoomSurface(kit, 0.2, 0.57, 2, wallColor, 4, 3.915, z, "wall");
    addWindow(kit, 4, 3.2, z, 2, 0.86, 2, true);
    for (const dz of [-1, 1]) kit.box(0.34, 2.77, 0.14, LOUNGE_TIMBER, 4, 1.385, z + dz, 0.016);
    kit.box(0.37, 0.14, 2.2, LOUNGE_TIMBER, 4, 2.78, z, 0.018);
  }
}

function addLoungeTimberwork(room, { minX, height }) {
  const kit = modelKit("lounge-timberwork");
  room.group.add(kit.group);
  const beamY = height - 0.35;
  kit.box(4.25 - minX, 0.27, 0.46, LOUNGE_TIMBER, (4 + minX) / 2, beamY, -7.81, 0.032);
  kit.box(0.46, 0.27, 13.25, LOUNGE_TIMBER, minX + 0.19, beamY, -1.5, 0.032);
  for (const x of [minX + 0.25, -11.1, -7.4, -3.7, 0, 3.76].filter((x) => x > minX)) {
    kit.box(0.24, beamY, 0.42, LOUNGE_TIMBER, x, beamY / 2, -7.81, 0.026);
    kit.box(0.28, 0.21, 0.45, LOUNGE_TRIM, x, beamY - 0.06, -7.8, 0.016);
  }
  for (const z of [-4.5, -0.9, 2.7]) {
    kit.box(0.4, beamY, 0.24, LOUNGE_TIMBER, minX + 0.19, beamY / 2, z, 0.026);
  }
}

function addLoungeGallery(room, floorColor, { mezzanine, stairs, railings }) {
  const kit = modelKit("lounge-gallery");
  kit.group.userData.mezzanine = true;
  room.group.add(kit.group);
  const { minX: left, maxX: right, minZ: back, maxZ: edge, height: y } = mezzanine;
  const width = right - left;
  const depth = edge - back;
  const centerX = (left + right) / 2;
  const centerZ = (back + edge) / 2;
  const deck = addRoomSurface(kit, width, 0.25, depth, floorColor, centerX, y - 0.125, centerZ, "floor");
  deck.name = "lounge-gallery-deck";
  kit.box(width + 0.08, 0.37, 0.18, LOUNGE_TIMBER, centerX, y - 0.17, edge, 0.025);
  kit.box(width + 0.12, 0.065, 0.2, LOUNGE_TRIM, centerX, y - 0.33, edge, 0.012);
  for (const x of [-14.63, -11.1, -7.4, -3.7, 0, 3.63]) {
    kit.box(0.2, 0.18, depth + 0.05, LOUNGE_TIMBER, x, y - 0.3, centerZ, 0.018);
  }
  railings.forEach((rail) => addMezzanineRail(kit, rail, y, LOUNGE_TRIM));
  for (const x of [-13.1, -8, -3.5, 2.6]) {
    kit.cylinder(0.15, 0.15, 0.08, LOUNGE_TRIM, x, y - 0.26, -5.2);
    addWarmBulb(kit, x, y - 0.34, -5.2, 0.095);
  }
  addStraightStaircase(room, stairs, "lounge-staircase", { treadColor: LOUNGE_TIMBER, frameColor: LOUNGE_TRIM, handrailColor: "#bd9b76" });
}

function addBuildingFloor(kit, floorColor, { minX, maxX }) {
  const width = maxX - minX;
  const centerX = (minX + maxX) / 2;
  kit.box(width + 0.3, 0.24, 13.3, "#a89782", centerX, -0.18, -1.5, 0.04);
  addRoomSurface(kit, width, 0.1, 13, floorColor, centerX, -0.055, -1.5, "floor");
  const seams = [];
  for (let row = 0; row < 30; row += 1) {
    const z = -8 + row * 13 / 30;
    addRoomSurface(kit, width, 0.01, 13 / 30 - 0.008, floorColor, centerX, -0.005, z + 13 / 60, "floor", [1.02, 0.98, 1, 0.95][row % 4]);
    seams.push(new THREE.Vector3(minX, 0.002, z), new THREE.Vector3(maxX, 0.002, z));
    for (let x = minX + 0.3 + (row % 3) * 0.8; x < maxX; x += 2.4) {
      seams.push(new THREE.Vector3(x, 0.003, z), new THREE.Vector3(x, 0.003, z + 13 / 30));
    }
  }
  kit.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seams),
    new THREE.LineBasicMaterial({ color: "#8b694c", transparent: true, opacity: 0.24 })));
}

function addRoomLamps(kit, { minX, height: hallHeight, wingHeight }) {
  const lights = modelKit("lounge-pendants");
  kit.group.add(lights.group);
  for (const [x, z, height, radius, color] of [
    [-12.6, -1.75, 4.75, 0.62, LOUNGE_PANEL],
    [-7.1, -0.65, 4.45, 0.51, "#b9754a"], [-6.0, -1.4, 4.92, 0.62, LOUNGE_PANEL],
    [-4.9, -0.45, 4.64, 0.43, "#c79551"], [0.9, -1.8, 4.86, 0.48, LOUNGE_PANEL],
    [7.2, -5.25, 3.38, 0.47, "#c79551"], [7, 1.2, 3.35, 0.52, LOUNGE_PANEL]
  ]) {
    if (x <= minX) continue;
    const ceiling = (x < 4 ? hallHeight : wingHeight) - 0.04;
    lights.cylinder(0.032, 0.032, ceiling - height, LOUNGE_TRIM, x, (height + ceiling) / 2, z);
    lights.cylinder(radius * 0.25, radius, 0.34, color, x, height + 0.05, z);
    lights.cylinder(radius, radius, 0.055, LOUNGE_TIMBER, x, height - 0.12, z);
    lights.cylinder(radius * 0.83, radius * 0.83, 0.04, "#ffedca", x, height - 0.15, z);
    addWarmBulb(lights, x, height - 0.17, z, radius * 0.36);
  }
  for (const [x, y, z, reach] of [[-6, 4.2, -0.8, 13], [0.9, 4.55, -1.8, 12], [7.2, 3.08, -5.25, 9], [7, 3.05, 1.2, 9]]) {
    const lamp = new THREE.PointLight("#ffd39a", 5, reach, 1);
    lamp.position.set(x, y, z);
    lamp.userData.roomLamp = true;
    lights.group.add(lamp);
  }
}

function addBuildingCeilings(kit, wallColor, { minX, height: hallHeight, wingHeight }) {
  const upperWall = modelKit("hall-upper-wall");
  upperWall.group.userData.walkthroughOnly = true;
  kit.group.add(upperWall.group);
  addRoomSurface(upperWall, 0.2, hallHeight - wingHeight, 13, wallColor,
    4, (hallHeight + wingHeight) / 2, -1.5, "wall");
  for (const [x, width, height] of [[(minX + 4) / 2, 4 - minX, hallHeight], [7, 6, wingHeight]]) {
    const roof = modelKit("building-ceiling");
    roof.group.userData.walkthroughOnly = true;
    kit.group.add(roof.group);
    addRoomSurface(roof, width + 0.25, 0.2, 13.3, wallColor, x, height + 0.1, -1.5, "wall");
    roof.box(width + 0.56, 0.1, 13.65, LOUNGE_TRIM, x, height + 0.24, -1.5, 0.018);
    for (let rib = -width / 2; rib <= width / 2; rib += 0.7) {
      roof.box(0.045, 0.055, 13.63, "#59776c", x + rib, height + 0.3, -1.5, 0.006);
    }
    for (const z of [-7.6, -4.5, -0.9, 2.7, 4.9]) {
      roof.box(width + 0.12, 0.27, 0.29, LOUNGE_TIMBER, x, height - 0.09, z, 0.025);
    }
  }
}

function addPinboard(kit) {
  kit.box(4.8, 2.02, 0.11, PALETTE.wood, 0, 2.3, -0.1, 0.04);
  kit.box(4.57, 1.8, 0.025, "#c5a78c", 0, 2.3, -0.03, 0.025);
  for (const x of [-2.35, 2.35]) addTrailingPlant(kit, x, 3.33, 0.02);
}

function addSteelBeam(kit, start, end, thickness = 0.08, color = "#55535c") {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const beam = kit.mesh(new THREE.BoxGeometry(thickness, direction.length(), thickness), color,
    ...from.clone().add(to).multiplyScalar(0.5).toArray());
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
}

function climbingGrain(repeatX, repeatY) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const value = 100 + ((x * 37 + y * 61 + x * y * 13) % 57);
    const offset = (y * size + x) * 4;
    data.set([value, value, value, 255], offset);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function addClimbingPanel(kit, { x, z, width, angle = 0, index, accentColor }) {
  const panel = new THREE.Group();
  panel.name = "climbing-panel";
  panel.position.set(x, 0, z);
  panel.rotation.y = angle;
  kit.group.add(panel);
  const topHeight = CLIMBING.building.height - 0.7;
  const profile = index === 1
    ? [[0.35, 0.12], [3.2, 0.3], [5.8, 1.5], [topHeight - 1, 0.85], [topHeight, 0.12]]
    : [[0.35, 0.12], [3.2, 0.38], [5.8, 0.7], [topHeight, 0.12]];
  const vertices = [];
  for (let part = 0; part < profile.length - 1; part += 1) {
    const [bottom, lowerDepth] = profile[part];
    const [top, upperDepth] = profile[part + 1];
    vertices.push(-width / 2, bottom, lowerDepth, width / 2, bottom, lowerDepth, width / 2, top, upperDepth,
      -width / 2, bottom, lowerDepth, width / 2, top, upperDepth, -width / 2, top, upperDepth);
    for (const side of [-1, 1]) {
      const edge = side * width / 2;
      vertices.push(edge, bottom, 0, edge, bottom, lowerDepth, edge, top, upperDepth,
        edge, bottom, 0, edge, top, upperDepth, edge, top, 0);
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  surface.setAttribute("uv", new THREE.Float32BufferAttribute(vertices.flatMap((value, i) => i % 3 === 0 ? [value / width, vertices[i + 1] / topHeight] : []), 2));
  surface.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: index === 1 ? "#858b8b" : ["#d8d4cb", "#d1cec6", "#c6c8c3"][index % 3], roughness: 0.94, side: THREE.DoubleSide,
    bumpMap: climbingGrain(5, 16), bumpScale: 0.012
  });
  const wall = new THREE.Mesh(surface, material);
  wall.castShadow = true; wall.receiveShadow = true;
  panel.add(wall);
  function depthAt(y) {
    const segment = profile.findIndex((point, i) => i < profile.length - 1 && y <= profile[i + 1][0]);
    const [bottom, lower] = profile[Math.max(0, segment)];
    const [top, upper] = profile[Math.max(0, segment) + 1];
    return lower + (upper - lower) * (y - bottom) / (top - bottom);
  }
  const colors = [accentColor, "#dcb631", "#cd643e", "#3e6f8a", "#92a254", "#353b3e"];
  const holds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.84 }), 72);
  holds.name = "climbing-holds";
  holds.castShadow = true; holds.receiveShadow = true;
  const pose = new THREE.Object3D();
  let count = 0;
  for (let route = 0; route < 4; route += 1) {
    for (let step = 0; step < 18; step += 1) {
      const seed = step * 2.17 + route * 1.31 + index;
      const y = 0.65 + step * (topHeight - 1.2) / 18 + Math.sin(seed) * 0.16;
      const hx = -width * 0.33 + route * width * 0.22 + Math.sin(seed * 0.7) * width * 0.06;
      pose.position.set(hx, y, depthAt(y) + 0.09);
      pose.rotation.set(0.1 * route, seed * 0.3, seed);
      pose.scale.set(0.7 + (step % 4) * 0.32, 0.65 + (route % 3) * 0.34, 0.65 + (step % 3) * 0.25);
      pose.updateMatrix(); holds.setMatrixAt(count, pose.matrix);
      holds.setColorAt(count++, new THREE.Color(colors[(route + index) % colors.length]));
    }
  }
  panel.add(holds);
  const bolts = new THREE.InstancedMesh(new THREE.CircleGeometry(0.014, 6), kit.material("#757874"), 9 * 28);
  bolts.name = "climbing-bolt-holes";
  count = 0;
  for (let row = 0; row < 28; row += 1) for (let col = 0; col < 9; col += 1) {
    const y = 0.55 + row * (topHeight - 0.8) / 28;
    pose.position.set(-width * 0.44 + col * width * 0.11, y, depthAt(y) + 0.005);
    pose.rotation.set(0, 0, 0); pose.scale.setScalar(1); pose.updateMatrix();
    bolts.setMatrixAt(count++, pose.matrix);
  }
  panel.add(bolts);
  for (const [vx, vy, size, colorIndex] of [[-width * 0.2, 2.2, 0.52, 5], [width * 0.17, 4.8, 0.65, 1], [-width * 0.22, 7.7, 0.55, 5]]) {
    const volume = kit.mesh(new THREE.ConeGeometry(size * (index === 1 ? 1.5 : 1), 0.48, 3), colors[colorIndex], vx, vy, depthAt(vy) + 0.17, panel);
    volume.name = "climbing-volume";
    volume.rotation.set(Math.PI / 2, 0, index * 0.5 + vy);
  }
  for (const side of [-1, 1]) {
    for (let part = 0; part < profile.length - 1; part += 1) {
      const [bottom, lower] = profile[part];
      const [top, upper] = profile[part + 1];
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.018, Math.hypot(top - bottom, upper - lower), 0.018), kit.material("#9e9f98"));
      line.position.set(side * width / 2, (bottom + top) / 2, (lower + upper) / 2 + 0.01);
      line.rotation.x = Math.atan2(upper - lower, top - bottom);
      panel.add(line);
    }
  }
  if (index % 2 === 0) {
    const points = [];
    for (let step = 0; step <= 20; step += 1) {
      const y = topHeight - 0.2 - step * (topHeight - 0.65) / 20;
      points.push(new THREE.Vector3(0.25 + Math.sin(step * 0.22) * 0.06, y, 1.12));
    }
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.018, 5, false), kit.material("#c7a96e"));
    rope.name = "climbing-rope";
    panel.add(rope);
  }
}

function addCrashMat(kit, width, depth, color) {
  const mat = kit.box(width, 0.35, depth - 0.045, color, 0, 0.175, 0, 0.055);
  mat.name = "crash-mat";
  mat.material.bumpMap = climbingGrain(10, 6);
  mat.material.bumpScale = 0.008;
  mat.material.roughness = 0.88;
  for (const side of [-1, 1]) {
    kit.box(width - 0.11, 0.014, 0.02, "#bac2c7", 0, 0.315, side * (depth / 2 - 0.055), 0.006);
    kit.box(0.24, 0.07, 0.035, "#4a5963", side * 0.65, 0.18, depth / 2 - 0.02, 0.015);
  }
  const connector = kit.box(width - 0.07, 0.025, 0.2, "#7e9b79", 0, 0.3375, depth / 2 - 0.1, 0.012);
  connector.name = "mat-connector";
}

function addMezzanineRail(kit, rail, base, color) {
  const alongX = rail.width > rail.depth;
  const length = alongX ? rail.width : rail.depth;
  const point = (offset, y) => [rail.x + (alongX ? offset : 0), y, rail.z + (alongX ? 0 : offset)];
  for (const y of [base + 0.1, base + 1.08]) addSteelBeam(kit, point(-length / 2, y), point(length / 2, y), 0.065, color);
  const posts = Math.max(1, Math.ceil(length / 1.1));
  for (let i = 0; i <= posts; i += 1) {
    const offset = -length / 2 + length * i / posts;
    addSteelBeam(kit, point(offset, base), point(offset, base + 1.12), 0.075, color);
  }
  const vertices = [];
  for (let offset = -length / 2 + 0.12; offset < length / 2; offset += 0.13) vertices.push(...point(offset, base + 0.12), ...point(offset, base + 1.03));
  for (let y = base + 0.24; y < base + 1.03; y += 0.13) vertices.push(...point(-length / 2, y), ...point(length / 2, y));
  const mesh = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)),
    new THREE.LineBasicMaterial({ color: "#68606a", transparent: true, opacity: 0.5 }));
  mesh.name = "railing-mesh";
  // The solid rails handle camera occlusion; the fine safety mesh is visual detail.
  mesh.raycast = () => {};
  kit.group.add(mesh);
}

function addClimbingMezzanine(kit, floorColor) {
  const { mezzanine, stairs, pillars, railings } = CLIMBING;
  const deck = modelKit("climbing-mezzanine");
  deck.group.userData.mezzanine = true;
  kit.group.add(deck.group);
  const width = mezzanine.maxX - mezzanine.minX;
  const depth = mezzanine.maxZ - mezzanine.minZ;
  const centerX = (mezzanine.maxX + mezzanine.minX) / 2;
  const centerZ = (mezzanine.maxZ + mezzanine.minZ) / 2;
  const slab = addRoomSurface(deck, width, 0.25, depth, floorColor, centerX, mezzanine.height - 0.125, centerZ, "floor");
  slab.name = "mezzanine-deck";
  deck.box(width, 0.42, 0.13, "#67818a", centerX, mezzanine.height - 0.22, mezzanine.maxZ, 0.01);
  deck.box(0.13, 0.42, depth, "#67818a", mezzanine.minX, mezzanine.height - 0.22, centerZ, 0.01);
  for (let z = mezzanine.minZ + 0.25; z < mezzanine.maxZ; z += 0.4) {
    deck.box(width - 0.15, 0.012, 0.018, "#a9957c", centerX, mezzanine.height + 0.006, z, 0.002);
  }
  railings.forEach((rail) => addMezzanineRail(deck, rail, mezzanine.height));
  pillars.forEach((pillar) => {
    const column = kit.mesh(new THREE.BoxGeometry(pillar.width, mezzanine.height, pillar.depth), "#62616a", pillar.x, mezzanine.height / 2, pillar.z);
    column.name = "mezzanine-column";
  });
  addStraightStaircase(kit, stairs, "climbing-staircase");
}

function addStraightStaircase(kit, stairs, name, { treadColor = "#77717a", frameColor, handrailColor = "#bd9b76" } = {}) {
  const stairKit = modelKit(name);
  stairKit.group.userData.mezzanine = true;
  kit.group.add(stairKit.group);
  const run = stairs.maxZ - stairs.minZ;
  const stairWidth = stairs.maxX - stairs.minX;
  const sx = (stairs.maxX + stairs.minX) / 2;
  for (let i = 0; i < stairs.steps; i += 1) {
    const rise = stairs.height * (i + 1) / stairs.steps;
    const z = stairs.maxZ - run * (i + 0.5) / stairs.steps;
    const tread = stairKit.mesh(new THREE.BoxGeometry(stairWidth, 0.1, run / stairs.steps + 0.015), treadColor, sx, rise - 0.05, z);
    tread.name = "stair-tread";
    stairKit.box(stairWidth - 0.08, 0.012, 0.04, "#c5b3a1", sx, rise + 0.005, z + run / stairs.steps / 2 - 0.02, 0.002);
  }
  for (const x of [stairs.minX, stairs.maxX]) {
    addSteelBeam(stairKit, [x, 0.08, stairs.maxZ], [x, stairs.height - 0.1, stairs.minZ], 0.18, frameColor);
    addSteelBeam(stairKit, [x, 1.1, stairs.maxZ], [x, stairs.height + 1.1, stairs.minZ], 0.08, handrailColor);
    addSteelBeam(stairKit, [x, 0.6, stairs.maxZ], [x, stairs.height + 0.6, stairs.minZ], 0.045, frameColor);
    for (let step = 0; step <= stairs.steps; step += 2) {
      const z = stairs.maxZ - run * step / stairs.steps;
      const y = stairs.height * step / stairs.steps;
      addSteelBeam(stairKit, [x, y, z], [x, y + 1.1, z], 0.045, frameColor);
    }
  }
}

function climbingWoodGrain() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const grain = Math.sin(y * 0.78 + Math.sin(x * 0.065) * 2) * 9 + Math.sin(y * 2.2 + x * 0.025) * 4;
    const value = 230 + grain;
    data.set([value, value - 4, value - 10, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function addClimbingPlanter(parent, x, y, z) {
  const plant = modelKit("climbing-leafy-planter");
  plant.group.position.set(x, y, z);
  parent.group.add(plant.group);
  const pot = plant.cylinder(0.19, 0.145, 0.3, "#c2b5a1", 0, 0.15, 0);
  pot.material.bumpMap = climbingGrain(3, 2);
  pot.material.bumpScale = 0.004;
  pot.material.roughness = 0.72;
  const rim = plant.mesh(new THREE.TorusGeometry(0.185, 0.013, 7, 20), "#d5c8b3", 0, 0.296, 0);
  rim.rotation.x = Math.PI / 2;
  plant.cylinder(0.173, 0.173, 0.012, "#615241", 0, 0.289, 0);
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.bezierCurveTo(-0.095, 0.075, -0.105, 0.19, 0, 0.31);
  outline.bezierCurveTo(0.11, 0.18, 0.095, 0.07, 0, 0);
  const leafGeometry = new THREE.ShapeGeometry(outline, 6);
  const positions = leafGeometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const length = positions.getY(index) / 0.31;
    positions.setZ(index, Math.sin(length * Math.PI) * 0.025 - Math.abs(positions.getX(index)) * 0.18);
  }
  leafGeometry.computeVertexNormals();
  for (let branch = 0; branch < 7; branch += 1) {
    const angle = branch * 2.4;
    const height = 0.65 + (branch % 3) * 0.095;
    const tip = new THREE.Vector3(Math.sin(angle) * 0.09, height, Math.cos(angle) * 0.09);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.29, 0), new THREE.Vector3(tip.x * 0.4, 0.47, tip.z * 0.4), tip]);
    plant.mesh(new THREE.TubeGeometry(curve, 8, 0.007, 5, false), "#647448", 0, 0, 0);
    for (let level = 0; level < 3; level += 1) {
      const anchor = curve.getPoint(0.38 + level * 0.29);
      const leaf = plant.mesh(leafGeometry, ["#526e3e", "#708744", "#839551"][(branch + level) % 3], ...anchor.toArray());
      leaf.name = "climbing-pointed-leaf";
      leaf.material.side = THREE.DoubleSide;
      leaf.rotation.set(0.5 + level * 0.14, angle + level * 2.15, 0.55 + (branch % 2) * 0.2);
      leaf.scale.setScalar(0.78 + ((branch + level) % 3) * 0.1);
      const vein = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.018, 0.004), new THREE.Vector3(0, 0.15, 0.029), new THREE.Vector3(0, 0.285, 0.01)
      ]), new THREE.LineBasicMaterial({ color: "#9caa67" }));
      leaf.add(vein);
    }
  }
}

function addClimbingLowerFacade(kit) {
  const facade = modelKit("climbing-lower-facade");
  facade.group.position.z = CLIMBING.building.minZ + 0.15;
  kit.group.add(facade.group);
  const wood = "#ad9274";
  facade.material(wood).map = climbingWoodGrain();
  facade.box(8.7, 1.02, 0.035, wood, 4.5, 0.53, 0.025, 0.006);
  for (let x = 0.3; x < 8.9; x += 0.45) facade.box(0.011, 0.94, 0.014, "#8f7d66", x, 0.53, 0.05, 0.002);
  facade.box(8.7, 0.045, 0.075, "#c3ad8c", 4.5, 1.05, 0.035, 0.009);
  const window = modelKit("climbing-lower-window");
  window.group.position.set(6.9, 2.17, 0.03);
  facade.group.add(window.group);
  for (let row = 0; row < 2; row += 1) for (let col = 0; col < 3; col += 1) {
    const pane = window.mesh(new THREE.PlaneGeometry(0.72, 0.96), (row + col) % 2 ? "#68867b" : "#87988a", -0.77 + col * 0.77, -0.51 + row * 1.02, 0);
    pane.material.roughness = 0.28;
    pane.material.metalness = 0.18;
  }
  for (const x of [-1.15, -0.385, 0.385, 1.15]) window.box(0.05, 2.1, 0.09, "#4d5d55", x, 0, 0.025, 0.006);
  for (const y of [-1.04, 0, 1.04]) window.box(2.35, 0.05, 0.09, "#4d5d55", 0, y, 0.025, 0.006);
  window.box(2.48, 0.09, 0.2, "#baaa8d", 0, -1.13, 0.07, 0.015);
  for (const x of [0.35, 8.45]) {
    const sconce = modelKit("climbing-wall-sconce");
    sconce.group.position.set(x, 3.08, 0.04);
    facade.group.add(sconce.group);
    sconce.box(0.15, 0.31, 0.04, "#57594e", 0, 0, 0, 0.02);
    sconce.box(0.035, 0.035, 0.27, "#57594e", 0, 0.04, 0.15, 0.008);
    sconce.cylinder(0.085, 0.18, 0.13, "#7a7059", 0, 0.08, 0.27);
    addWarmBulb(sconce, 0, -0.025, 0.27, 0.07);
    const light = new THREE.PointLight("#ffd4a2", 1.8, 4, 1);
    light.position.set(0, -0.05, 0.32);
    light.userData.roomLamp = true;
    light.userData.roomLampStrength = light.intensity;
    sconce.group.add(light);
  }
}

function addClimbingEquipment(kit, accentColor, cabinet) {
  const equipment = modelKit("climbing-equipment");
  kit.group.add(equipment.group);
  const wood = "#ba8d5b";
  const edge = "#d6af7c";
  const grain = climbingWoodGrain();
  for (const color of [wood, edge, "#89613e"]) equipment.material(color).map = grain;
  const shelfZ = 0;
  const x = 0;
  {
    equipment.box(1.55, 2.4, 0.07, "#89613e", x, 1.25, shelfZ - 0.43, 0.012);
    for (const dx of [-0.77, 0.77]) equipment.box(0.08, 2.4, 0.88, wood, x + dx, 1.25, shelfZ, 0.012);
    for (const y of [0.08, 0.65, 1.24, 1.84, 2.43]) equipment.box(1.58, 0.07, 0.9, edge, x, y, shelfZ, 0.015);
    equipment.box(0.055, 1.72, 0.84, wood, x, 1.56, shelfZ, 0.008);
    for (const dx of [-0.39, 0.39]) {
      const drawer = equipment.box(0.71, 0.48, 0.075, wood, x + dx, 0.36, shelfZ + 0.41, 0.012);
      drawer.name = "gear-drawer";
      equipment.box(0.19, 0.025, 0.025, "#51483c", x + dx, 0.46, shelfZ + 0.46, 0.006);
    }
    for (const [level, y] of [0.71, 1.3, 1.9].entries()) {
      for (const [slot, dx] of [-0.55, -0.21, 0.21, 0.55].entries()) {
        const px = x + dx;
        const color = ["#d8b640", "#9baaa4", accentColor, "#c77d57"][(slot + cabinet) % 4];
        if (cabinet === 0 || (cabinet === 2 && level === 0)) {
          const shoe = new THREE.Group();
          shoe.name = "climbing-shoe";
          shoe.position.set(px, y, shelfZ + 0.11);
          equipment.group.add(shoe);
          equipment.box(0.23, 0.045, 0.43, "#393e3e", 0, 0.025, 0, 0.025, shoe);
          equipment.sphere(0.108, 0.078, 0.2, level % 2 ? "#97896b" : "#c2ac6b", 0, 0.1, 0, shoe);
          equipment.sphere(0.11, 0.055, 0.095, "#424a47", 0, 0.078, 0.13, shoe);
          for (const z of [-0.06, 0.03]) equipment.box(0.21, 0.02, 0.045, "#343f3f", 0, 0.173, z, 0.007, shoe);
        } else if (cabinet === 1) {
          const helmet = equipment.mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), color, px, y + 0.025, shelfZ + 0.1);
          helmet.name = "climbing-helmet";
          const rim = equipment.mesh(new THREE.TorusGeometry(0.147, 0.012, 6, 18), "#4c5551", px, y + 0.025, shelfZ + 0.1);
          rim.rotation.x = Math.PI / 2;
          for (const ventX of [-0.055, 0.055]) equipment.box(0.026, 0.012, 0.065, "#56625a", px + ventX, y + 0.165, shelfZ + 0.1, 0.008);
        } else if (level === 1) {
          const bag = equipment.cylinder(0.12, 0.095, 0.22, color, px, y + 0.12, shelfZ + 0.09);
          bag.name = "chalk-bag";
          equipment.cylinder(0.101, 0.101, 0.012, "#494c43", px, y + 0.236, shelfZ + 0.09);
          equipment.box(0.035, 0.095, 0.015, "#e9debf", px, y + 0.12, shelfZ + 0.205, 0.006);
        } else {
          const bottle = equipment.cylinder(0.07, 0.07, 0.29, color, px, y + 0.15, shelfZ + 0.09);
          bottle.name = "climbing-bottle";
          equipment.cylinder(0.045, 0.045, 0.06, "#444e48", px, y + 0.32, shelfZ + 0.09);
        }
      }
    }
  }
  if (cabinet !== 1) addClimbingPlanter(equipment, cabinet === 0 ? -0.5 : 0.45, 2.48, 0);
}

function addRopeRack(equipment) {
  equipment.box(1.65, 0.08, 0.1, "#8c6b43", 0, 3.3, -0.1, 0.012);
  for (const [index, color] of ["#b9944b", "#b76949", "#789780"].entries()) {
    const x = (index - 1) * 0.57;
    for (let strand = 0; strand < 5; strand += 1) {
      const rope = equipment.mesh(new THREE.TorusGeometry(0.14 + strand * 0.009, 0.014, 6, 24), color, x, 2.97, 0.08 - strand * 0.018);
      rope.name = "equipment-rope-coil";
      rope.scale.y = 2.3;
    }
    equipment.box(0.04, 0.18, 0.16, "#454e49", x, 3.33, 0.06, 0.008);
  }
}

const CLIMBING_WINDOW = { x: 3.15, y: 7.45, width: 5.6, height: 4.2 };

function addClimbingWindow(kit) {
  const facade = modelKit("climbing-industrial-window");
  const z = CLIMBING.building.minZ + 0.16;
  facade.group.position.set(CLIMBING_WINDOW.x, CLIMBING_WINDOW.y, z);
  kit.group.add(facade.group);
  const frame = "#4c5b54";
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 4; col += 1) {
    const x = -2.1 + col * 1.4;
    const y = -1.38 + row * 1.38;
    const glass = facade.mesh(new THREE.PlaneGeometry(1.33, 1.31), ["#73988b", "#849e91", "#688d81", "#9aab91"][(row + col) % 4], x, y, 0);
    glass.name = "industrial-window-pane";
    glass.userData.roomWindow = true;
    glass.castShadow = false;
    glass.material.side = THREE.DoubleSide;
    glass.material.roughness = 0.27;
    glass.material.metalness = 0.2;
    const reflection = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 1.2), new THREE.MeshBasicMaterial({ color: "#d8e5ce", transparent: true, opacity: 0.09, depthWrite: false }));
    reflection.position.set(x - 0.18, y, 0.012);
    reflection.rotation.z = -0.24;
    facade.group.add(reflection);
  }
  for (const x of [-2.8, -1.4, 0, 1.4, 2.8]) facade.box(0.065, 4.23, 0.12, frame, x, 0, 0.04, 0.008);
  for (const y of [-2.1, -0.69, 0.69, 2.1]) facade.box(5.7, 0.065, 0.12, frame, 0, y, 0.04, 0.008);
  facade.box(5.88, 0.16, 0.34, "#ac987a", 0, -2.22, 0.1, 0.02);
}

function addClimbingSign(kit) {
  const sign = modelKit("higher-together-sign");
  sign.group.position.set(0, 3.05, 0);
  kit.group.add(sign.group);
  const board = sign.box(2.65, 1.65, 0.14, "#bc9666", 0, 0, 0, 0.035);
  board.material.map = climbingWoodGrain();
  for (const y of [-0.43, 0.1, 0.62]) sign.box(2.57, 0.012, 0.015, "#98744b", 0, y, 0.075, 0.003);
  const letters = {
    H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
    I: [[[0.5, 0], [0.5, 1]], [[0, 0], [1, 0]], [[0, 1], [1, 1]]],
    G: [[[1, 0.85], [0.7, 1], [0.15, 0.9], [0, 0.5], [0.15, 0.1], [0.75, 0], [1, 0.2], [1, 0.5], [0.6, 0.5]]],
    E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, 0.5], [0.8, 0.5]]],
    R: [[[0, 0], [0, 1], [0.7, 1], [1, 0.8], [0.8, 0.55], [0, 0.55]], [[0.5, 0.55], [1, 0]]],
    T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
    O: [[[0.2, 0], [0, 0.25], [0, 0.8], [0.2, 1], [0.8, 1], [1, 0.8], [1, 0.2], [0.8, 0], [0.2, 0]]]
  };
  for (const [text, y] of [["HIGHER", 0.15], ["TOGETHER", -0.44]]) {
    const advance = 2.15 / text.length;
    for (const [index, letter] of [...text].entries()) for (const stroke of letters[letter]) {
      for (let point = 1; point < stroke.length; point += 1) {
        const position = ([px, py]) => [-1.075 + index * advance + px * advance * 0.7, y + py * 0.37, 0.09];
        addSteelBeam(sign, position(stroke[point - 1]), position(stroke[point]), 0.027, "#4c4233");
      }
    }
  }
}

function addClimbingArchitecture(kit, wallColor, floorColor) {
  const { building, mezzanine } = CLIMBING;
  const width = building.maxX - building.minX;
  const depth = building.maxZ - building.minZ;
  const centerZ = (building.minZ + building.maxZ) / 2;
  kit.box(width + 0.3, 0.24, depth + 0.3, "#97928b", 0, -0.18, centerZ, 0.025);
  const floor = addRoomSurface(kit, width, 0.1, depth, floorColor, 0, -0.055, centerZ, "floor");
  floor.material.bumpMap = climbingGrain(width * 2, depth * 2);
  floor.material.bumpScale = 0.018;
  floor.material.roughness = 0.94;
  for (let z = building.minZ + 1; z < building.maxZ; z += 1) {
    kit.mesh(new THREE.BoxGeometry(width, 0.003, 0.012), "#9e9d96", 0, 0.002, z);
  }
  for (let x = building.minX + 1; x < building.maxX; x += 1) {
    kit.mesh(new THREE.BoxGeometry(0.012, 0.003, depth), "#9e9d96", x, 0.002, centerZ);
  }
  CLIMBING.walls.forEach((wall) => {
    const side = modelKit("climbing-exterior-wall");
    side.group.userData.walkthroughOnly = Boolean(wall.cutaway);
    kit.group.add(side.group);
    const bottom = wall.z === building.maxZ ? 2.5 : 0;
    if (wall.z === building.minZ) {
      const { x, y, width: windowWidth, height: windowHeight } = CLIMBING_WINDOW;
      const left = x - windowWidth / 2;
      const right = x + windowWidth / 2;
      const sill = y - windowHeight / 2;
      const head = y + windowHeight / 2;
      const minX = wall.x - wall.width / 2;
      const maxX = wall.x + wall.width / 2;
      // Keep the physical glazing, but let the sun pass through the wall aperture.
      for (const [width, height, centerX, centerY] of [
        [left - minX, wall.height, (minX + left) / 2, wall.height / 2],
        [maxX - right, wall.height, (right + maxX) / 2, wall.height / 2],
        [windowWidth, sill, x, sill / 2],
        [windowWidth, wall.height - head, x, (head + wall.height) / 2]
      ]) addRoomSurface(side, width, height, wall.depth, wallColor, centerX, centerY, wall.z, "wall");
    } else {
      addRoomSurface(side, wall.width, wall.height - bottom, wall.depth, wallColor, wall.x, (wall.height + bottom) / 2, wall.z, "wall");
    }
    side.mesh(new THREE.BoxGeometry(wall.width + 0.03, 0.24, wall.depth + 0.03), "#575a58", wall.x, building.height - 0.13, wall.z);
  });
  const entrance = modelKit("climbing-entrance");
  entrance.group.userData.walkthroughOnly = true;
  kit.group.add(entrance.group);
  addRoomSurface(entrance, 3, building.height - 3.2, 0.24, wallColor, -2, (building.height + 3.2) / 2, building.maxZ, "wall");
  for (const x of [-3.6, -0.4]) entrance.box(0.12, 3.2, 0.3, "#676e6c", x, 1.6, building.maxZ, 0.015);
  entrance.box(3.15, 0.14, 0.3, "#676e6c", -2, 3.2, building.maxZ, 0.015);
  addClimbingWindow(kit);
  addClimbingLowerFacade(kit);
  for (const z of [building.minZ + 0.15, -2.2, building.maxZ - 0.15]) {
    for (const x of [building.minX + 0.16, building.maxX - 0.16]) {
      const column = kit.mesh(new THREE.BoxGeometry(0.24, building.height, 0.24), "#5b605e", x, building.height / 2, z);
      column.name = "industrial-column";
      if (x > 0) column.userData.walkthroughOnly = true;
    }
  }
  const roof = modelKit("climbing-ceiling");
  roof.group.userData.walkthroughOnly = true;
  kit.group.add(roof.group);
  addRoomSurface(roof, width + 0.3, 0.18, depth + 0.3, "#777c78", 0, building.height + 0.1, centerZ, "wall");
  const trusses = modelKit("industrial-roof-trusses");
  trusses.group.userData.overhead = true;
  kit.group.add(trusses.group);
  const interiorTrusses = modelKit("industrial-roof-interior");
  interiorTrusses.group.userData.walkthroughOnly = true;
  kit.group.add(interiorTrusses.group);
  const roofY = building.height - 0.1;
  const left = building.minX + 0.1;
  const right = building.maxX - 0.1;
  for (const z of [building.minZ + 0.3, -2.2, building.maxZ - 0.3]) {
    const structure = z === building.minZ + 0.3 ? trusses : interiorTrusses;
    addSteelBeam(structure, [left, roofY - 0.55, z], [right, roofY - 0.55, z], 0.16, "#414745");
    addSteelBeam(structure, [left, roofY, z], [right, roofY, z], 0.18, "#414745");
    const bays = 8;
    const span = (right - left) / bays;
    for (let bay = 0; bay < bays; bay += 1) {
      const x = left + bay * span;
      addSteelBeam(structure, [x, roofY - 0.55, z], [x + span / 2, roofY, z], 0.07, "#59605a");
      addSteelBeam(structure, [x + span / 2, roofY, z], [x + span, roofY - 0.55, z], 0.07, "#59605a");
    }
  }
  for (const x of [left + 0.1, -2.6, 2.6, right - 0.1]) {
    const structure = x === left + 0.1 || x === right - 0.1 ? trusses : interiorTrusses;
    const edgeBeam = addSteelBeam(structure, [x, roofY, building.minZ + 0.1], [x, roofY, building.maxZ - 0.1], 0.12, "#414745");
    if (x === right - 0.1) edgeBeam.userData.walkthroughOnly = true;
  }
  const ductZ = building.minZ + 0.8;
  const duct = trusses.cylinder(0.23, 0.23, width - 0.6, "#8c918c", 0, roofY - 0.4, ductZ);
  duct.name = "ventilation-duct";
  duct.rotation.z = Math.PI / 2;
  for (let x = left + 0.5; x < right; x += 1.3) {
    const joint = trusses.mesh(new THREE.TorusGeometry(0.235, 0.018, 6, 18), "#b5b8ad", x, roofY - 0.4, ductZ);
    joint.rotation.y = Math.PI / 2;
  }
  for (const [x, z, structure] of [[3, building.minZ + 1.4, trusses], [-2, -2.2, interiorTrusses]]) {
    const fan = modelKit("industrial-ceiling-fan");
    fan.group.position.set(x, roofY - 0.85, z);
    structure.group.add(fan.group);
    fan.cylinder(0.035, 0.035, 0.6, "#4f5753", 0, 0.3, 0);
    fan.cylinder(0.19, 0.15, 0.15, "#666e66", 0, 0, 0);
    for (let blade = 0; blade < 4; blade += 1) {
      const angle = blade * Math.PI / 2 + 0.2;
      const shape = fan.box(0.23, 0.025, 0.77, "#727970", Math.sin(angle) * 0.43, -0.04, Math.cos(angle) * 0.43, 0.035);
      shape.rotation.y = angle;
      shape.rotation.z = 0.1;
    }
  }
  for (const [x, z, y, reach] of [[-6, -5, 9.2, 18], [-2.6, -8, 9.2, 18], [2, -8.3, 6.8, 12], [5.7, -8.3, 6.8, 12], [1.5, -5, 3.3, 9], [4.3, -5, 3.3, 9]]) {
    const lampKit = modelKit("gym-pendant");
    if (y > mezzanine.height && y < 9) lampKit.group.userData.mezzanine = true;
    kit.group.add(lampKit.group);
    const ceilingY = y < mezzanine.height ? mezzanine.height - 0.25 : roofY - 0.5;
    lampKit.cylinder(0.018, 0.018, ceilingY - y, "#454a47", x, (ceilingY + y) / 2, z);
    lampKit.cylinder(0.14, 0.38, 0.2, "#51554d", x, y + 0.1, z);
    lampKit.cylinder(0.32, 0.32, 0.018, "#fff0cd", x, y - 0.014, z);
    addWarmBulb(lampKit, x, y - 0.08, z, 0.16);
    const light = new THREE.PointLight("#ffd49a", y < mezzanine.height ? 7 : 13, reach, 1);
    light.userData.roomLamp = true;
    light.userData.roomLampStrength = light.intensity;
    light.position.set(x, y - 0.2, z);
    lampKit.group.add(light);
  }
}

function createClimbingShell({ floorColor, wallColor }) {
  const kit = modelKit("room-shell");
  kit.group.userData.layout = "climbing";
  addClimbingArchitecture(kit, wallColor, floorColor);
  kit.group.add(createBuildingContext(CLIMBING.building));
  addClimbingMezzanine(kit, floorColor);
  return kit.group;
}

function addCafeCounter(kitchen, accentColor) {
  kitchen.box(3.7, 0.86, 0.85, "#a9b09a", 0, 0.43, 0.1, 0.045);
  kitchen.box(3.8, 0.1, 0.95, PALETTE.lightWood, 0, 0.91, 0.1, 0.035);
  for (const x of [-1.25, 0, 1.25]) {
    kitchen.box(1.15, 0.7, 0.025, "#c1c3ab", x, 0.45, 0.54, 0.025);
    kitchen.box(0.26, 0.025, 0.035, PALETTE.darkWood, x, 0.71, 0.57, 0.007);
  }
  kitchen.box(0.76, 0.035, 0.5, "#acbfc1", 1.05, 0.985, 0.12, 0.04);
  kitchen.cylinder(0.025, 0.025, 0.3, "#79888b", 1.05, 1.12, -0.19);
  const tap = kitchen.cylinder(0.025, 0.025, 0.2, "#79888b", 1.05, 1.26, -0.1);
  tap.rotation.x = Math.PI / 2;
  kitchen.box(3.8, 1.15, 0.03, accentColor, 0, 1.66, -0.58, 0.012);
  for (let row = 0; row < 4; row += 1) kitchen.box(3.8, 0.012, 0.01, "#e9dec6", 0, 1.13 + row * 0.3, -0.56, 0.002);
  kitchen.box(3.8, 0.1, 0.37, PALETTE.wood, 0, 2.36, -0.37, 0.025);
  for (const x of [-1.25, -0.85, -0.45]) addCup(kitchen, x, 2.41, -0.35);
  addPlant(kitchen, 1.5, 2.41, -0.36, 0.48);
  kitchen.box(0.48, 0.46, 0.4, "#5e655f", -1.3, 1.2, 0.07, 0.03);
  addCup(kitchen, -0.75, 0.97, 0.26);
}

function createLegacyFacility(kind, { color, panelBacking } = {}) {
  const boardgame = createBoardgameFacility(kind);
  if (boardgame) return boardgame;
  const item = modelKit(kind);
  if (["climbingWallWide", "climbingWallOverhang", "climbingWallNarrow"].includes(kind)) {
    const width = climbingPanelWidth(kind);
    addClimbingPanel(item, { x: 0, z: CLIMBING_PANEL_REAR, width,
      index: kind === "climbingWallOverhang" ? 1 : kind === "climbingWallNarrow" ? 4 : 0, accentColor: color || "#536bd6" });
    if (panelBacking > 0) {
      const top = CLIMBING.building.height - 0.7;
      // Extend the casing behind the panel while keeping its climbing face and landing pad aligned.
      const backing = item.mesh(new THREE.BoxGeometry(width, top - 0.35, panelBacking + 0.02),
        "#979288", 0, (top + 0.35) / 2, CLIMBING_PANEL_REAR - panelBacking / 2);
      backing.name = "climbing-wall-backing";
    }
  } else if (kind === "crashMat") addCrashMat(item, 4.15, 2.3, color || "#7d8b9d");
  else if (kind === "crashMatWide") addCrashMat(item, 4.75, 1.8, color || "#7d8b9d");
  else if (["climbingShoeShelf", "climbingHelmetShelf", "climbingGearShelf"].includes(kind)) {
    addClimbingEquipment(item, color || "#536bd6", ["climbingShoeShelf", "climbingHelmetShelf", "climbingGearShelf"].indexOf(kind));
  } else if (kind === "ropeRack") addRopeRack(item);
  else if (kind === "climbingPlant") addClimbingPlanter(item, 0, 0, 0);
  else if (kind === "climbingSign") addClimbingSign(item);
  else if (kind === "climbingBoard") {
    item.box(4.8, 1.55, 0.09, PALETTE.wood, 0, 2.8, 0, 0.03).name = "climbing-memory-board";
    item.box(4.59, 1.35, 0.025, "#b8a18a", 0, 2.8, 0.06, 0.02);
  } else if (kind === "clubPinboard") addPinboard(item);
  else if (kind === "cafeCounter") addCafeCounter(item, color || "#536bd6");
  else if (kind === "cafeFridge") {
    item.box(0.92, 1.95, 0.87, "#f0e5d7", 0, 0.975, 0, 0.07);
    item.box(0.05, 0.35, 0.055, "#b2a18b", -0.3, 1.15, 0.47, 0.01);
  } else return null;
  return item.group;
}

export function createRoomShell(options = {}) {
  const shell = createRoomShellBase(options);
  return finishArchitecture(shell, options.template ?? "lounge", getRoomLayout(options), options.atmosphere, options.onSurfaceReady);
}

function createRoomShellBase({
  floorColor = "#cfa77c", wallColor = "#f1dfc3", template = "lounge", version = 11,
  accentColor = "#536bd6", atmosphere = {}
} = {}) {
  if (["dining", "band", "study", "photo", "climbing", "boardgame"].includes(template)) return createClubhouseArchitecture(getRoomLayout(template, version), { template, floorColor, wallColor, atmosphere });
  if (template === "climbing") return createClimbingShell({ floorColor, wallColor });
  const kit = modelKit("room-shell");
  if (template === "boardgame") {
    kit.group.add(createBoardgameShell({ floorColor, wallColor, accentColor }));
    kit.group.add(createBuildingContext(BOARDGAME.building));
    return kit.group;
  }
  const layout = getRoomLayout(template, version);
  const { building } = layout;
  addBuildingFloor(kit, floorColor, building);
  kit.group.add(createBuildingContext(building, "lounge"));
  layout.walls.forEach((wall) => addBuildingWall(kit, wall, wallColor, building));
  addDoorFrames(kit, wallColor, building);
  addLoungeTimberwork(kit, building);
  if (layout.mezzanine) addLoungeGallery(kit, floorColor, layout);
  addBuildingCeilings(kit, wallColor, building);
  addRoomLamps(kit, building);
  return kit.group;
}

const MASCOT_SKIN = "#f3c8a8";

export function createWalkProp(kind, avatarColor) {
  const kit = modelKit("walk-prop");
  if (kind === "book") {
    kit.box(0.37, 0.035, 0.25, "#566595", 0, 0, 0, 0.015);
    for (const side of [-1, 1]) {
      kit.box(0.17, 0.022, 0.23, "#fff1d3", side * 0.09, 0.024, 0, 0.01).rotation.z = side * 0.1;
      for (let line = 0; line < 4; line += 1) kit.box(0.11, 0.004, 0.008, "#ae9d8b", side * 0.09, 0.043, line * 0.035 - 0.07);
    }
  } else if (kind === "cookie") {
    kit.cylinder(0.105, 0.1, 0.045, "#c18b4a", 0, 0.05, 0);
    for (const [x, z] of [[-0.04, 0.045], [0.047, -0.04], [0.027, 0.052], [-0.052, -0.03]]) {
      kit.sphere(0.012, 0.006, 0.012, "#5e352c", x, 0.075, z);
    }
  } else {
    const colors = { coffee: ["#ecdfc9", "#523429"], latte: ["#ecb2a9", "#d5a981"], tea: ["#9ab88a", "#bd823e"] };
    addCup(kit, 0, 0, 0, ...(colors[kind] || []));
  }
  const grip = modelKit("first-person-grip");
  const book = kind === "book";
  for (const side of book ? [-1, 1] : [1]) {
    const x = side * (book ? 0.17 : 0.11);
    grip.sphere(0.05, 0.042, 0.069, MASCOT_SKIN, x, -0.012, book ? 0.085 : 0.035);
    const sleeve = grip.sphere(0.057, 0.052, 0.105, avatarColor, x + side * 0.025, -0.049, book ? 0.166 : 0.114);
    sleeve.rotation.y = side * 0.28;
  }
  kit.group.add(grip.group);
  return kit.group;
}

export function createMascot({ color = "#5369dc", pose = "standing", held = null } = {}) {
  const kit = modelKit("mascot");
  const seated = pose === "seated" || pose === "sitting";
  const lift = seated ? -0.22 : 0;
  const skin = MASCOT_SKIN;
  const hair = "#695044";
  for (const x of [-0.14, 0.14]) {
    if (seated) {
      const leg = kit.box(0.2, 0.2, 0.39, "#666c88", x, 0.36, 0.17, 0.08);
      leg.rotation.x = -0.16;
      kit.box(0.21, 0.15, 0.29, "#fff3e0", x, 0.23, 0.34, 0.065);
    } else {
      kit.box(0.19, 0.29, 0.21, "#68708e", x, 0.3, 0, 0.075);
      kit.box(0.23, 0.15, 0.32, "#fff3e0", x, 0.075, 0.065, 0.07);
      kit.box(0.235, 0.04, 0.32, "#d7c9b8", x, 0.025, 0.065, 0.018);
    }
  }
  kit.sphere(0.285, 0.34, 0.22, color, 0, 0.67 + lift, 0);
  kit.box(0.44, 0.09, 0.32, color, 0, 0.43 + lift, 0.015, 0.04);
  kit.sphere(0.27, 0.12, 0.19, color, 0, 0.94 + lift, -0.05);
  for (const x of [-0.09, 0.09]) {
    kit.box(0.018, 0.19, 0.018, "#fff2df", x, 0.78 + lift, 0.214, 0.008);
  }
  kit.box(0.19, 0.09, 0.025, color, 0, 0.56 + lift, 0.22, 0.03);
  for (const side of [-1, 1]) {
    if (pose === "greeting" && side === -1) {
      const upperArm = kit.sphere(0.12, 0.2, 0.125, color, -0.36, 0.87, 0.04);
      upperArm.rotation.z = 0.8;
      const forearm = kit.sphere(0.107, 0.195, 0.11, color, -0.49, 1.1, 0.07);
      forearm.rotation.z = 0.21;
      const hand = kit.sphere(0.094, 0.124, 0.064, skin, -0.54, 1.32, 0.098);
      hand.name = "greeting-hand";
      hand.rotation.z = 0.21;
      kit.sphere(0.049, 0.065, 0.058, skin, -0.466, 1.284, 0.116);
      continue;
    }
    if (held === "book" || (held && side === 1)) {
      const sleeve = kit.sphere(0.12, 0.13, 0.19, color, side * 0.25, 0.67 + lift, 0.17);
      sleeve.rotation.y = side * 0.32;
      kit.sphere(0.088, 0.075, 0.082, skin, side * (held === "book" ? 0.16 : 0.28), 0.68 + lift, 0.32);
      continue;
    }
    const sleeve = kit.sphere(0.12, 0.24, 0.125, color, side * 0.29, 0.68 + lift, 0.025);
    sleeve.rotation.z = side * 0.18;
    kit.sphere(0.092, 0.105, 0.09, skin, side * 0.32, 0.49 + lift, 0.065);
  }
  kit.sphere(0.37, 0.35, 0.32, skin, 0, 1.24 + lift, 0.01);
  for (const side of [-1, 1]) kit.sphere(0.078, 0.105, 0.069, skin, side * 0.36, 1.21 + lift, 0.02);
  kit.sphere(0.385, 0.27, 0.315, hair, 0, 1.42 + lift, -0.04);
  const locks = [
    [-0.29, 1.39, 0.17, -0.45],
    [-0.13, 1.49, 0.25, -0.5],
    [0.06, 1.5, 0.26, -0.35],
    [0.23, 1.43, 0.22, 0.15],
    [0.32, 1.29, 0.1, 0.2]
  ];
  for (const [x, y, z, tilt] of locks) {
    const lock = kit.sphere(0.14, 0.18, 0.11, hair, x, y + lift, z);
    lock.rotation.z = tilt;
  }
  for (const side of [-1, 1]) {
    kit.sphere(0.035, 0.047, 0.018, "#3a3234", side * 0.125, 1.25 + lift, 0.318);
    kit.sphere(0.009, 0.011, 0.005, "#fffaf0", side * 0.125 - 0.009, 1.266 + lift, 0.336);
    kit.sphere(0.064, 0.029, 0.008, "#eaa99e", side * 0.215, 1.16 + lift, 0.28);
  }
  kit.sphere(0.035, 0.025, 0.027, skin, 0, 1.19 + lift, 0.338);
  kit.sphere(0.032, 0.021, 0.008, "#a86661", 0, 1.11 + lift, 0.313);
  return kit.group;
}

export function disposeObject(group) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  group.traverse((object) => {
    if (object.isLight) object.dispose();
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture && !value.userData.roomBakedOcclusion) textures.add(value);
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  group.removeFromParent();
  group.clear();
}
