import { createWoodGrain } from "./architecturalMaterials";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const WOOD = "#bd8752";
const DARK = "#343139";
const STEEL = "#9c9d99";
const CREAM = "#eee1c7";

export const DINING_BAND_ASSETS = Object.freeze([
  { kind: "kitchenCounter", name: "싱크대와 조리 수납장", width: 3.2, depth: 0.9, height: 2.8, collection: "dining" },
  { kind: "kitchenIsland", name: "오픈 키친 아일랜드", width: 3.8, depth: 1.5, height: 1.5, collection: "dining" },
  { kind: "kitchenRange", name: "레인지와 후드", width: 1.8, depth: 0.9, height: 2.65, collection: "dining" },
  { kind: "kitchenFridge", name: "메모가 붙은 냉장고", width: 1.2, depth: 1, height: 2.2, collection: "dining" },
  { kind: "pantryShelf", name: "식재료 팬트리", width: 2.4, depth: 0.65, height: 2.8, collection: "dining" },
  { kind: "cafeCabinet", name: "커피와 간식 코너", width: 2.4, depth: 0.8, height: 1.9, collection: "dining" },
  { kind: "feastTable", name: "함께 먹는 긴 식탁", width: 4.8, depth: 1.8, height: 1.5, collection: "dining" },
  { kind: "menuBoard", name: "오늘의 메뉴 칠판", width: 1.25, depth: 0.6, height: 1.9, collection: "dining" },
  { kind: "foodMap", name: "우리 맛집 지도 보드", width: 2.6, depth: 0.5, height: 2.6, collection: "dining" },
  { kind: "drumKit", name: "어쿠스틱 드럼 세트", width: 2.8, depth: 2.5, height: 1.9, collection: "band" },
  { kind: "guitarRack", name: "기타 세 대와 거치대", width: 2, depth: 0.65, height: 1.7, collection: "band" },
  { kind: "rehearsalKeyboard", name: "88건반과 연주대", width: 1.8, depth: 0.8, height: 1.1, collection: "band" },
  { kind: "amplifier", name: "기타 앰프 스택", width: 1.2, depth: 0.65, height: 1.65, collection: "band" },
  { kind: "microphoneStand", name: "보컬 마이크 스탠드", width: 0.65, depth: 0.65, height: 1.8, collection: "band" },
  { kind: "mixingDesk", name: "레코딩 믹싱 데스크", width: 2.4, depth: 1, height: 1.65, collection: "band" },
  { kind: "acousticPanel", name: "이동식 흡음 패널", width: 1.6, depth: 0.35, height: 2.7, collection: "band" },
  { kind: "bandPoster", name: "공연 포스터 전시대", width: 1.6, depth: 0.4, height: 2.6, collection: "band" },
  { kind: "rehearsalStage", name: "낮은 연습 무대", width: 6, depth: 4, height: 0.25, walkableHeight: 0.25, collection: "band" },
  { kind: "stageLight", name: "보라빛 무대 조명", width: 0.7, depth: 0.7, height: 2.9, collection: "band" }
].map((asset) => Object.freeze({ ...asset, category: "furniture" })));

function grainTexture() { return createWoodGrain(); }

function kit(name) {
  const group = new THREE.Group();
  group.name = name;
  const materials = new Map();
  let grain;
  function material(color, finish = "matte") {
    const key = `${color}:${finish}`;
    if (!materials.has(key)) {
      if (finish === "wood" && !grain) grain = grainTexture();
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: finish === "metal" ? 0.38 : finish === "ceramic" ? 0.32 : 0.84,
        metalness: finish === "metal" ? 0.65 : 0, map: finish === "wood" ? grain : null }));
    }
    return materials.get(key);
  }
  function mesh(geometry, color, x = 0, y = 0, z = 0, finish) {
    const object = new THREE.Mesh(geometry, material(color, finish));
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    group.add(object);
    return object;
  }
  function box(w, h, d, color, x = 0, y = 0, z = 0, radius = 0.015, finish) {
    return mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d), color, x, y, z, finish);
  }
  function cylinder(top, bottom, height, color, x, y, z, finish) {
    return mesh(new THREE.CylinderGeometry(top, bottom, height, 20), color, x, y, z, finish);
  }
  function sphere(radius, color, x, y, z) {
    return mesh(new THREE.SphereGeometry(radius, 12, 8), color, x, y, z);
  }
  return { group, box, cylinder, sphere, mesh, material };
}

function beam(target, from, to, thickness, color = DARK) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const delta = b.clone().sub(a);
  const mesh = target.mesh(new THREE.CylinderGeometry(thickness, thickness, delta.length(), 8), color,
    ...a.clone().add(b).multiplyScalar(0.5).toArray(), "metal");
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

function glow(target, width, height, depth, color, x, y, z, intensity = 1.1) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.4
  }));
  object.position.set(x, y, z);
  object.userData.roomBulb = true;
  target.group.add(object);
  return object;
}

function legs(target, width, depth, height, color = DARK) {
  for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) {
    target.box(0.07, height, 0.07, color, x, height / 2, z);
  }
}

function cup(target, x, y, z, color = CREAM) {
  target.cylinder(0.075, 0.06, 0.14, color, x, y + 0.07, z, "ceramic");
  target.cylinder(0.059, 0.059, 0.008, "#684732", x, y + 0.142, z);
  const handle = target.mesh(new THREE.TorusGeometry(0.04, 0.013, 6, 12), color, x + 0.08, y + 0.08, z);
  handle.rotation.y = Math.PI / 2;
}

function bottle(target, x, y, z, color = "#68784c") {
  target.cylinder(0.055, 0.058, 0.23, color, x, y + 0.115, z, "ceramic");
  target.cylinder(0.022, 0.038, 0.08, color, x, y + 0.27, z);
  target.cylinder(0.024, 0.024, 0.035, "#c8a56c", x, y + 0.32, z);
  target.box(0.08, 0.1, 0.008, CREAM, x, y + 0.13, z + 0.056, 0);
}

function herb(target, x, y, z) {
  target.cylinder(0.12, 0.09, 0.2, "#c78c66", x, y + 0.1, z);
  for (let i = 0; i < 7; i += 1) {
    const angle = i * 2.4;
    const leaf = target.sphere(0.09, i % 2 ? "#70894f" : "#8b9e56", x + Math.sin(angle) * 0.09, y + 0.25 + i % 3 * 0.055, z + Math.cos(angle) * 0.09);
    leaf.scale.set(0.6, 1.3, 0.8);
  }
}

function cabinet(target, width, depth, color, doors = 3) {
  target.box(width - 0.1, 0.1, depth - 0.12, DARK, 0, 0.05, 0);
  target.box(width - 0.06, 0.83, depth - 0.06, color, 0, 0.515, 0, 0.025, "wood");
  target.box(width, 0.085, depth, "#e4d8bd", 0, 0.97, 0, 0.018);
  for (let i = 0; i < doors; i += 1) {
    const x = (i + 0.5) * (width - 0.12) / doors - (width - 0.12) / 2;
    target.box((width - 0.12) / doors - 0.028, 0.71, 0.035, color, x, 0.51, depth / 2 - 0.01, 0.01, "wood");
    target.box(0.24, 0.022, 0.04, "#b8a27d", x, 0.77, depth / 2, 0.008);
  }
}

function kitchenCounter(target, color) {
  cabinet(target, 3.16, 0.84, color || "#849080", 4);
  target.box(3.12, 0.65, 0.045, "#b5bea5", 0, 1.34, -0.395, 0);
  for (let x = -1.48; x < 1.55; x += 0.39) target.box(0.012, 0.6, 0.006, CREAM, x, 1.34, -0.369, 0);
  target.box(1.04, 0.035, 0.55, STEEL, -0.5, 1.025, 0, 0.035, "metal");
  target.box(0.82, 0.04, 0.39, "#666e6a", -0.5, 1.037, 0.01, 0.04, "metal");
  beam(target, [-0.5, 1.04, -0.3], [-0.5, 1.4, -0.3], 0.025, STEEL);
  beam(target, [-0.5, 1.4, -0.3], [-0.5, 1.4, -0.05], 0.025, STEEL);
  for (const y of [1.88, 2.38]) {
    target.box(3.08, 0.07, 0.33, WOOD, 0, y, -0.23, 0.01, "wood");
  }
  glow(target, 2.9, 0.018, 0.05, "#ffcd87", 0, 1.83, -0.08);
}

function kitchenIsland(target, color) {
  cabinet(target, 3.76, 1.44, color || "#7c8877", 4);

}

function range(target, color) {
  cabinet(target, 1.76, 0.84, color || "#6a6d65", 2);
  target.box(1.5, 0.5, 0.04, "#282b2d", 0, 0.49, 0.426, 0.018);
  target.box(1.16, 0.32, 0.012, "#414747", 0, 0.49, 0.443, 0.01);
  target.box(1.15, 0.035, 0.04, STEEL, 0, 0.79, 0.43);
  for (const x of [-0.43, 0.43]) for (const z of [-0.2, 0.2]) {
    target.cylinder(0.18, 0.18, 0.018, DARK, x, 1.025, z);
    target.box(0.43, 0.035, 0.025, STEEL, x, 1.045, z);
    target.box(0.025, 0.035, 0.43, STEEL, x, 1.045, z);
  }
  target.cylinder(0.21, 0.2, 0.24, "#a9513a", -0.43, 1.19, -0.2, "metal");
  target.cylinder(0.22, 0.22, 0.035, STEEL, -0.43, 1.32, -0.2, "metal");
  target.box(1.76, 0.18, 0.84, STEEL, 0, 2.07, 0, 0.025, "metal");
  target.box(0.65, 0.48, 0.54, "#b2b2a9", 0, 2.4, -0.14, 0.01, "metal");
  glow(target, 1.35, 0.018, 0.07, "#ffdb9c", 0, 1.97, 0.1);
}

function fridge(target, color) {
  target.box(1.15, 2.15, 0.94, color || "#bec3bd", 0, 1.075, 0, 0.06, "metal");
  for (const [y, h] of [[0.47, 0.82], [1.52, 1.22]]) {
    target.box(1.09, h, 0.055, color || "#c9cec6", 0, y, 0.463, 0.025, "metal");
    target.box(0.034, h * 0.45, 0.075, DARK, 0.43, y, 0.462, 0.01);
  }
  for (let i = 0; i < 5; i += 1) {
    const note = target.box(0.19, 0.24, 0.008, ["#e7cc76", "#b3cfc0", "#ddaa91"][i % 3], -0.27 + i % 2 * 0.35, 1.45 + Math.floor(i / 2) * 0.2, 0.496, 0);
    note.rotation.z = (i - 2) * 0.055;
  }
}

function pantry(target, color) {
  const wood = color || WOOD;
  target.box(2.35, 2.72, 0.055, "#755639", 0, 1.36, -0.28, 0, "wood");
  for (const x of [-1.14, 0, 1.14]) target.box(0.07, 2.76, 0.61, wood, x, 1.38, 0, 0.01, "wood");
  for (let row = 0; row < 5; row += 1) {
    const y = 0.12 + row * 0.55;
    target.box(2.36, 0.065, 0.62, wood, 0, y, 0, 0.01, "wood");
    for (let i = 0; i < 8; i += 1) {
      const x = -0.98 + i * 0.28;
      if (row % 2) bottle(target, x, y + 0.033, 0.08, ["#a67445", "#85936e", "#d3b77e"][i % 3]);
      else {
        target.box(0.2, 0.33, 0.26, ["#d4b780", "#aeb690", "#c78d6d"][i % 3], x, y + 0.2, 0.07, 0.025);
        target.box(0.13, 0.12, 0.012, CREAM, x, y + 0.23, 0.206, 0);
      }
    }
  }
}

function cafe(target, color) {
  cabinet(target, 2.36, 0.74, color || "#a06f47", 3);
  target.box(0.85, 0.59, 0.48, "#4a4c49", -0.52, 1.31, -0.04, 0.035, "metal");
  target.box(0.74, 0.21, 0.09, STEEL, -0.52, 1.39, 0.21, 0.015, "metal");
  target.box(0.82, 0.04, 0.34, STEEL, -0.52, 1.05, 0.12, 0.01, "metal");
  for (const x of [-0.75, -0.35]) cup(target, x, 1.08, 0.12);
  target.cylinder(0.17, 0.17, 0.23, "#a27b53", 0.37, 1.14, 0);
  target.cylinder(0.2, 0.2, 0.04, CREAM, 0.37, 1.27, 0);
  herb(target, 0.9, 1.015, 0);
  target.box(2.3, 0.065, 0.24, WOOD, 0, 1.67, -0.25, 0.01, "wood");
  for (let i = 0; i < 7; i += 1) cup(target, -0.9 + i * 0.29, 1.705, -0.24);
}

function feast(target, color) {
  target.box(4.76, 0.13, 1.76, color || WOOD, 0, 0.91, 0, 0.045, "wood");
  legs(target, 4.25, 1.3, 0.85, "#695342");
  target.box(4.65, 0.014, 0.5, "#d6be91", 0, 0.983, 0, 0.005);
  for (const x of [-1.65, -0.55, 0.55, 1.65]) for (const z of [-0.55, 0.55]) {
    target.cylinder(0.22, 0.18, 0.025, CREAM, x, 1.006, z, "ceramic").name = "dining-place-setting";
    target.cylinder(0.15, 0.15, 0.012, "#c3905d", x, 1.024, z);
    target.box(0.023, 0.017, 0.32, STEEL, x + 0.27, 1.003, z, 0.004);
    target.box(0.025, 0.017, 0.29, STEEL, x - 0.27, 1.003, z, 0.004);
    cup(target, x + 0.3, 0.99, z * 0.54);
  }
  herb(target, 0, 0.99, 0);
  for (const x of [-1.15, 1.15]) {
    target.cylinder(0.2, 0.2, 0.02, CREAM, x, 1.005, 0);
    for (let i = 0; i < 5; i += 1) target.sphere(0.06, i % 2 ? "#c8794e" : "#9a9c4f", x + Math.sin(i * 2) * 0.1, 1.06, Math.cos(i * 2) * 0.08);
  }
}

function display(target, width, height, color, map = false, footDepth = 0.55) {
  for (const x of [-width * 0.37, width * 0.37]) target.box(0.06, height, 0.06, WOOD, x, height / 2, -0.1, 0.01, "wood");
  target.box(width, height * 0.65, 0.09, WOOD, 0, height * 0.64, -0.08, 0.025, "wood");
  target.box(width - 0.12, height * 0.65 - 0.12, 0.012, color, 0, height * 0.64, -0.028, 0);
  for (const x of [-width * 0.37, width * 0.37]) target.box(0.28, 0.06, map ? 0.48 : footDepth, DARK, x, 0.03, 0);
  if (map) {
    for (let i = 0; i < 7; i += 1) {
      const x = -width * 0.35 + i * width * 0.12;
      const line = target.box(0.025, height * 0.52, 0.012, CREAM, x, height * 0.64, -0.014, 0);
      line.rotation.z = (i % 3 - 1) * 0.35;
      const pin = target.sphere(0.055, "#c46748", x, height * (0.48 + i % 3 * 0.16), 0.035);
      pin.name = "food-map-pin";
    }
    for (const y of [0.48, 0.63, 0.78]) target.box(width * 0.86, 0.025, 0.012, CREAM, 0, height * y, -0.013, 0);
  } else for (let i = 0; i < 5; i += 1) {
    target.box(width * (i ? 0.57 : 0.72), 0.023, 0.012, "#ded8b8", 0, height * (0.85 - i * 0.09), -0.014, 0);
  }
}

function drum(target, x, y, z, radius, depth, front = false, color = "#8d403b") {
  const shell = target.cylinder(radius, radius, depth, color, x, y, z, "metal");
  if (front) shell.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const skin = target.cylinder(radius * 0.98, radius * 0.98, 0.025, front ? "#323139" : "#ded8c9", x, y + (front ? 0 : side * depth / 2), z + (front ? side * depth / 2 : 0));
    if (front) skin.rotation.x = Math.PI / 2;
    const rim = target.mesh(new THREE.TorusGeometry(radius, 0.023, 6, 24), STEEL, x, y + (front ? 0 : side * depth / 2), z + (front ? side * depth / 2 : 0), "metal");
    if (!front) rim.rotation.x = Math.PI / 2;
  }
}

function drumKit(target, color) {
  drum(target, 0, 0.49, 0.35, 0.46, 0.62, true, color);
  for (const [x, y, z, r, d] of [[-0.45, 1, 0, 0.28, 0.32], [0.35, 1.06, 0, 0.3, 0.35], [0.8, 0.61, -0.35, 0.35, 0.45], [-0.65, 0.64, -0.5, 0.3, 0.22]]) {
    drum(target, x, y, z, r, d, false, color);
    beam(target, [x, 0.04, z], [x, y - d / 2, z], 0.025, STEEL);
  }
  for (const [x, y, z, r] of [[-1, 1.45, 0.2, 0.32], [1, 1.6, 0.25, 0.35], [0.4, 1.65, -0.75, 0.31], [-0.8, 1.02, -0.78, 0.22]]) {
    beam(target, [x, 0.05, z], [x, y, z], 0.02, STEEL);
    target.cylinder(0.045, r, 0.045, "#cba35b", x, y, z, "metal").name = "drum-cymbal";
    for (const a of [0, 2.1, 4.2]) beam(target, [x, 0.32, z], [x + Math.sin(a) * 0.22, 0.025, z + Math.cos(a) * 0.22], 0.012, STEEL);
  }
  target.cylinder(0.22, 0.22, 0.1, DARK, 0, 0.58, -0.93);
  target.cylinder(0.035, 0.035, 0.53, STEEL, 0, 0.265, -0.93, "metal");
}

function guitars(target, color) {
  target.box(1.95, 0.07, 0.61, DARK, 0, 0.035, 0);
  beam(target, [-0.85, 0.06, -0.2], [-0.85, 1.2, -0.2], 0.022);
  beam(target, [0.85, 0.06, -0.2], [0.85, 1.2, -0.2], 0.022);
  beam(target, [-0.85, 1.2, -0.2], [0.85, 1.2, -0.2], 0.022);
  for (let i = 0; i < 3; i += 1) {
    const x = (i - 1) * 0.62;
    const paint = color || ["#c18a4a", "#b96743", "#e8d7ac"][i];
    const body = target.sphere(0.25, paint, x, 0.44, 0.04); body.scale.set(0.85, 1.22, 0.34);
    const upper = target.sphere(0.18, paint, x, 0.67, 0.04); upper.scale.set(0.9, 1, 0.4);
    target.box(0.09, 0.72, 0.05, "#76533a", x, 1.08, 0.04, 0.012, "wood");
    target.box(0.14, 0.23, 0.06, paint, x, 1.52, 0.04, 0.025);
    for (let fret = 0; fret < 12; fret += 1) target.box(0.09, 0.009, 0.009, STEEL, x, 0.77 + fret * 0.05, 0.07, 0);
    target.box(0.13, 0.07, 0.035, DARK, x, 0.47, 0.13);
    for (const dx of [-0.028, 0, 0.028]) beam(target, [x + dx, 0.44, 0.15], [x + dx, 1.55, 0.08], 0.0025, "#b5b0a1");
  }
}

function keyboard(target, color) {
  target.box(1.76, 0.14, 0.52, color || DARK, 0, 0.95, 0, 0.025);
  for (let i = 0; i < 35; i += 1) {
    const x = -0.81 + i * 0.047;
    target.box(0.043, 0.025, 0.33, CREAM, x, 1.029, 0.075, 0.003).name = "keyboard-white-key";
    if (![2, 6].includes(i % 7)) target.box(0.022, 0.04, 0.2, "#242429", x + 0.021, 1.052, 0.01, 0.003);
  }
  for (const z of [-0.25, 0.25]) {
    beam(target, [-0.6, 0.05, z], [0.6, 0.88, z], 0.026);
    beam(target, [0.6, 0.05, z], [-0.6, 0.88, z], 0.026);
  }
}

function amp(target, color) {
  target.box(1.16, 1.08, 0.6, color || "#28292d", 0, 0.61, 0, 0.045);
  target.box(1.02, 0.94, 0.018, "#4c4945", 0, 0.6, 0.309, 0.02);
  for (const x of [-0.26, 0.26]) for (const y of [0.35, 0.82]) {
    const speaker = target.cylinder(0.2, 0.2, 0.015, "#343334", x, y, 0.317);
    speaker.rotation.x = Math.PI / 2;
  }
  target.box(1.08, 0.37, 0.5, color || "#343339", 0, 1.35, 0, 0.025);
  target.box(0.97, 0.12, 0.018, "#b39b69", 0, 1.39, 0.257, 0.005, "metal");
  for (let i = 0; i < 8; i += 1) target.sphere(0.025, "#e1d6b5", -0.36 + i * 0.1, 1.39, 0.28);
  target.box(0.34, 0.055, 0.11, DARK, 0, 1.56, 0);
  for (const x of [-0.42, 0.42]) for (const z of [-0.2, 0.2]) target.cylinder(0.05, 0.05, 0.09, DARK, x, 0.045, z);
}

function microphone(target) {
  beam(target, [0, 0.06, 0], [0, 1.6, 0], 0.018);
  for (let i = 0; i < 3; i += 1) beam(target, [0, 0.23, 0], [Math.sin(i * 2.094) * 0.29, 0.02, Math.cos(i * 2.094) * 0.29], 0.012);
  beam(target, [0, 1.6, 0], [0, 1.67, 0.2], 0.024);
  const mic = target.cylinder(0.045, 0.025, 0.19, DARK, 0, 1.71, 0.2);
  mic.rotation.x = Math.PI / 3;
  target.sphere(0.052, STEEL, 0, 1.748, 0.27);
}

function mixer(target, color) {
  target.box(2.35, 0.11, 0.94, color || "#76513c", 0, 0.87, 0, 0.02, "wood");
  legs(target, 2.1, 0.72, 0.81);
  target.box(1.35, 0.08, 0.65, "#3d4044", -0.15, 0.97, 0.08, 0.015);
  for (let channel = 0; channel < 12; channel += 1) {
    const x = -0.73 + channel * 0.105;
    target.box(0.01, 0.008, 0.27, "#171b20", x, 1.015, 0.16, 0);
    target.box(0.06, 0.025, 0.04, channel % 4 ? "#cec8b4" : "#a9604f", x, 1.03, 0.1 + channel % 3 * 0.06);
    for (let row = 0; row < 3; row += 1) target.cylinder(0.018, 0.018, 0.03, ["#739393", "#bcaa68", "#a56865"][row], x, 1.03, -0.12 + row * 0.07);
  }
  target.box(0.86, 0.49, 0.055, DARK, 0, 1.34, -0.35, 0.025);
  glow(target, 0.76, 0.39, 0.012, "#577b84", 0, 1.34, -0.315, 0.25);
  for (let i = 0; i < 6; i += 1) target.box(0.65, 0.018, 0.008, i % 2 ? "#b99b70" : "#7ab0a4", 0, 1.19 + i * 0.055, -0.302, 0);
  for (const x of [-0.98, 0.98]) {
    target.box(0.28, 0.44, 0.28, DARK, x, 1.15, -0.23, 0.025);
    const speaker = target.cylinder(0.09, 0.09, 0.015, "#bdaf7b", x, 1.12, -0.08);
    speaker.rotation.x = Math.PI / 2;
  }
}

function acoustic(target, color) {
  target.box(1.54, 2.5, 0.12, color || "#39333e", 0, 1.42, 0, 0.025);
  for (let row = 0; row < 12; row += 1) for (let col = 0; col < 7; col += 1) {
    const tile = target.mesh(new THREE.ConeGeometry(0.12, 0.1, 4), color || "#48404d", -0.65 + col * 0.215, 0.3 + row * 0.204, 0.1);
    tile.rotation.x = Math.PI / 2;
  }
  for (const x of [-0.57, 0.57]) target.box(0.23, 0.08, 0.34, DARK, x, 0.04, 0);
}

function poster(target, color) {
  display(target, 1.55, 2.55, color || "#604357", false, 0.35);
  target.box(1.2, 0.73, 0.012, "#c98b67", 0, 1.42, 0.004, 0);
  for (let i = 0; i < 4; i += 1) {
    target.sphere(0.085, DARK, -0.42 + i * 0.28, 1.57 + i % 2 * 0.08, 0.04);
    target.box(0.17, 0.3, 0.045, DARK, -0.42 + i * 0.28, 1.32 + i % 2 * 0.08, 0.04, 0.03);
  }
}

function stage(target, color) {
  target.box(6, 0.21, 4, color || "#73503c", 0, 0.105, 0, 0.035, "wood");
  for (let i = 0; i < 16; i += 1) target.box(5.96, 0.04, 0.243, color || (i % 2 ? "#a4744e" : "#ad8058"), 0, 0.23, -1.87 + i * 0.249, 0.002, "wood");
  glow(target, 5.88, 0.025, 0.014, "#ffba66", 0, 0.16, 1.99);
}

function stageLight(target, color) {
  target.cylinder(0.24, 0.3, 0.08, DARK, 0, 0.04, 0);
  target.cylinder(0.025, 0.035, 2.5, DARK, 0, 1.28, 0);
  const housing = target.cylinder(0.17, 0.13, 0.33, DARK, 0, 2.64, 0);
  housing.rotation.x = Math.PI * 2 / 3;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshStandardMaterial({ color: color || "#b781df", emissive: color || "#b781df", emissiveIntensity: 0.35, roughness: 1 }));
  lens.position.set(0, 2.55, 0.15);
  target.group.add(lens);
  lens.rotation.x = Math.PI / 6;
  lens.userData.roomBulb = true;
  lens.userData.roomBulbColor = color || "#b781df";
  lens.userData.roomBulbStrength = 0.35;
  const light = new THREE.SpotLight(color || "#c18ce8", 7, 6, Math.PI / 4, 0.85, 2);
  light.position.set(0, 2.54, 0.167);
  light.target.position.set(0, 2.04, 0.167 + Math.sqrt(3) / 2);
  light.userData.roomLamp = true;
  light.userData.roomLampColor = color || "#c18ce8";
  light.userData.roomLampStrength = 7;
  target.group.add(light, light.target);
}

const BUILDERS = { kitchenCounter, kitchenIsland, kitchenRange: range, kitchenFridge: fridge, pantryShelf: pantry,
  cafeCabinet: cafe, feastTable: feast, menuBoard: (target) => display(target, 1.2, 1.85, "#35463e"),
  foodMap: (target) => display(target, 2.55, 2.55, "#a4b48b", true), drumKit, guitarRack: guitars,
  rehearsalKeyboard: keyboard, amplifier: amp, microphoneStand: microphone, mixingDesk: mixer,
  acousticPanel: acoustic, bandPoster: poster, rehearsalStage: stage, stageLight };

export function createDiningBandAsset(kind, { color } = {}) {
  if (!Object.hasOwn(BUILDERS, kind)) return null;
  const target = kit(kind);
  BUILDERS[kind](target, color);
  target.group.userData.assetKind = kind;
  return target.group;
}

function loftLayout({ halfWidth, back, height, deckFront, deckHeight, stairsSide, name, ground }) {
  const left = stairsSide === "left";
  const stairX = left ? -halfWidth + 0.4 : halfWidth - 2.5;
  const stairEnd = 1.7;
  const rails = left ? [
    { x: -halfWidth + 0.16, z: deckFront, width: 0.32, depth: 0.12, height: 1 },
    { x: 1.1, z: deckFront, width: halfWidth * 2 - 2.2, depth: 0.12, height: 1 }
  ] : [
    { x: -1.1, z: deckFront, width: halfWidth * 2 - 2.2, depth: 0.12, height: 1 },
    { x: halfWidth - 0.16, z: deckFront, width: 0.32, depth: 0.12, height: 1 }
  ];
  return {
    displayName: name, groundName: ground, windowSide: left ? "right" : "none",
    building: { minX: -halfWidth, maxX: halfWidth, minZ: back, maxZ: 5, height },
    mezzanine: { minX: -halfWidth, maxX: halfWidth, minZ: back, maxZ: deckFront, height: deckHeight },
    stairs: { minX: stairX, maxX: stairX + 2.1, minZ: deckFront, maxZ: stairEnd, height: deckHeight, steps: 28 },
    walls: [
      { x: 0, z: back, width: halfWidth * 2 + 0.2, depth: 0.24, height },
      { x: -halfWidth, z: (back + 5) / 2, width: 0.24, depth: 5 - back, height, cutaway: true },
      { x: halfWidth, z: (back + 5) / 2, width: 0.24, depth: 5 - back, height, cutaway: false },
      { x: (-halfWidth - 3.5) / 2, z: 5, width: halfWidth - 3.5, depth: 0.24, height, cutaway: true },
      { x: (halfWidth - 0.5) / 2, z: 5, width: halfWidth + 0.5, depth: 0.24, height, cutaway: true }
    ],
    pillars: [-halfWidth + 2.8, 0, halfWidth - 0.3].map((x) => ({ x, z: deckFront - 0.12, width: 0.22, depth: 0.22, height: deckHeight })),
    railings: rails,
    stairRails: [stairX, stairX + 2.1].map((x) => ({ x, z: (deckFront + stairEnd) / 2, width: 0.12, depth: stairEnd - deckFront, height: 1 })),
    clearPaths: [
      { minX: -3.4, maxX: -0.6, minZ: 3.5, maxZ: 8.2 },
      { minX: -halfWidth + 0.15, maxX: halfWidth - 0.15, minZ: 3.5, maxZ: 4.8 },
      { minX: left ? -halfWidth + 0.15 : halfWidth - 2.85, maxX: left ? -halfWidth + 2.85 : halfWidth - 0.15, minZ: deckFront, maxZ: 4.8 }
    ],
    mezzaninePaths: [{ minX: -halfWidth, maxX: halfWidth, minZ: deckFront - 1.2, maxZ: deckFront }],
    facilityWalk: [], facilityPlacement: [],
    zones: [{ id: "hall", name: ground, minX: -halfWidth, maxX: halfWidth, minZ: deckFront, maxZ: 5 },
      { id: "rear", name: left ? "오픈 키친" : "레코딩 코너", minX: -halfWidth, maxX: halfWidth, minZ: back, maxZ: deckFront }]
  };
}

export const DINING_BAND_LAYOUTS = Object.freeze({
  dining: loftLayout({ halfWidth: 11, back: -12, height: 9.4, deckFront: -6.3, deckHeight: 4.4, stairsSide: "left", name: "맛집 다이닝 하우스", ground: "1층 공동 식탁과 키친" }),
  band: loftLayout({ halfWidth: 10, back: -14, height: 9.6, deckFront: -8.4, deckHeight: 4.5, stairsSide: "right", name: "밴드 리허설 스튜디오", ground: "1층 합주실과 라운지" })
});

const item = (id, kind, x, z, rotation = 0, color, level = 0) => ({ id, kind, x, z, rotation, ...(color ? { color } : {}), ...(level ? { level } : {}) });

export function createDiningBandPresetItems(template) {
  if (!["dining", "band"].includes(template)) return [];
  const entrance = [item("entrance-bench", "bench", -6, 5.9), item("entrance-plant1", "plant", -8, 5.9), item("entrance-plant2", "plant", 6, 5.9)];
  if (template === "dining") return [...entrance,
    item("dining-memories", "clubPinboard", 10.65, -0.4, 3),
    item("dining-table-light", "pendantLight", 0.7, 0.1),
    item("dining-island-light", "pendantLight", 5.6, -3.9),
    item("dining-upper-art", "gameWallArt", 0, -11.65, 0, undefined, 1),
    item("dining-upper-art2", "gameWallArt", -7.6, -11.65, 0, undefined, 1),
    item("dining-upper-lamp", "floorLamp", 6.6, -10.9, 0, undefined, 1),
    item("dining-upper-green", "plant", -9.1, -10.8, 0, undefined, 1),
    item("kitchen-sink", "kitchenCounter", 4.3, -7.1), item("kitchen-range", "kitchenRange", 7, -7.1),
    item("kitchen-fridge", "kitchenFridge", 9, -7.1), item("pantry", "pantryShelf", 9.9, -10.2, 3),
    item("kitchen-island", "kitchenIsland", 5.6, -3.9), item("island-seat1", "stool", 4.3, -2.55), item("island-seat2", "stool", 5.6, -2.55), item("island-seat3", "stool", 6.9, -2.55),
    item("cafe", "cafeCabinet", -0.2, -7.1), item("food-map", "foodMap", -3.4, -7.1),
    item("feast", "feastTable", 0.7, 0.1),
    ...[-1.1, 0.1, 1.3, 2.5].flatMap((x, index) => [item(`dining-seat-${index}-back`, "gameChair", x, -1.4, 0, "#a78d65"), item(`dining-seat-${index}-front`, "gameChair", x, 1.6, 2, "#a78d65")]),
    item("lounge-sofa", "clubSofa", -5.9, -5.1, 0, "#b38c67"), item("lounge-seat", "roundChair", -5.1, -1.6, 2, "#94a17b"),
    item("lounge-table", "table", -5.8, -3.3), item("lounge-rug", "rug", -5.8, -3.3),
    item("lounge-plant", "plant", -7.4, -6.4), item("menu", "menuBoard", 8.5, 1.3),
    item("music-console", "musicConsole", 6.3, 2.3), item("corner-plant", "plant", 9.6, 2.7),
    item("upper-table-left", "feastTable", -4.4, -9.9, 0, undefined, 1),
    ...[-5.9, -4.4, -2.9].flatMap((x, index) => [item(`upper-dining-${index}-back`, "gameChair", x, -11.35, 0, "#9d956b", 1), item(`upper-dining-${index}-front`, "gameChair", x, -8.45, 2, "#9d956b", 1)]),
    item("upper-table-right", "diningTable", 3.2, -10, 0, undefined, 1),
    ...[2.1, 4.3].flatMap((x, index) => [item(`upper-cafe-${index}-back`, "gameChair", x, -11.35, 0, "#9d956b", 1), item(`upper-cafe-${index}-front`, "gameChair", x, -8.6, 2, "#9d956b", 1)]),
    item("upper-pantry", "pantryShelf", 9.6, -9.7, 3, undefined, 1), item("upper-plant", "plant", 7.5, -8.3, 0, undefined, 1)
  ];
  return [...entrance,
    item("band-memories", "clubPinboard", -9.65, 0.3, 1),
    item("band-lounge-light", "pendantLight", -4.5, 2),
    item("band-upper-art", "gameWallArt", -5.8, -13.65, 0, undefined, 1),
    item("band-upper-art2", "gameWallArt", 4.6, -13.65, 0, undefined, 1),
    item("band-upper-lamp", "floorLamp", -1.8, -11.7, 0, undefined, 1),
    item("stage", "rehearsalStage", -4.5, -5.8), item("drums", "drumKit", -4.5, -6.3),
    item("amp-left", "amplifier", -8.2, -6.5), item("amp-right", "amplifier", -0.8, -6.5),
    item("guitars", "guitarRack", -8.6, -2.8, 1), item("keyboard", "rehearsalKeyboard", -5.4, -2.8), item("rehearsal-stool", "stool", -7.8, -1),
    item("microphone-left", "microphoneStand", -3.4, -2.9), item("microphone-right", "microphoneStand", -1.7, -2.9),
    item("stage-light-left", "stageLight", -8.2, -7.7), item("stage-light-right", "stageLight", -0.8, -7.7),
    ...[-6.6, -4.7, -2.8].map((x, index) => item(`acoustic-${index}`, "acousticPanel", x, -8.0)),
    item("mixing", "mixingDesk", 4.1, -6.5), item("mix-chair", "gameChair", 4.1, -5.2),
    item("poster", "bandPoster", 1.3, -7.5), item("record-storage", "bookshelf", 4, -9.2),
    item("main-sofa", "clubSofa", -4.5, 0.1, 0, "#4d4659"), item("lounge-table", "table", -4.5, 2),
    item("side-sofa", "clubSofa", 0, 0.5, 1, "#725347"), item("side-table", "table", 2.3, 0.5, 1),
    item("lounge-chair", "roundChair", 4.5, 0.5, 3, "#8f6750"), item("lounge-rug", "rug", -4.5, 1.3),
    item("music-console", "musicConsole", 4.2, 2.7), item("lounge-plant", "plant", -8.5, 2.7),
    item("record-plant", "plant", 6.2, -6.5),
    item("upper-mixing", "mixingDesk", 4.6, -12.9, 0, undefined, 1), item("upper-mix-chair", "gameChair", 4.6, -11.6, 0, undefined, 1),
    item("upper-sofa", "clubSofa", -5.8, -13.1, 0, "#80604b", 1), item("upper-table", "table", -5.8, -11.3, 0, undefined, 1),
    item("upper-chair", "roundChair", -3.4, -11.3, 3, "#aa8262", 1), item("upper-shelf", "bookshelf", 0, -13.3, 0, undefined, 1),
    item("upper-poster", "bandPoster", -8.4, -12.1, 1, undefined, 1), item("upper-plant", "plant", 7.8, -12.7, 0, undefined, 1)
  ];
}
