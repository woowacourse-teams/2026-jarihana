import { sharedDoor } from "./sharedDoor.js";
import { createWoodGrain } from "./architecturalMaterials";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const OAK = "#bc936a";
const CHARCOAL = "#343a40";
const IVORY = "#ede9df";
const ACCENTS = ["#758ca5", "#b47a54", "#90a088", "#d5b679", "#888395"];

export const STUDY_PHOTO_KINDS = Object.freeze([
  "studyDesk", "focusDesk", "whiteboard", "projectScreen", "serverRack", "projectShelf",
  "studyCabinet", "projectDisplay", "photoBackdrop", "softbox", "photoTripod", "cameraCabinet",
  "photoEditDesk", "photoPrintBench", "galleryPartition", "photoEquipmentCase", "photoReflector"
]);

// Textures and materials belong to a single asset, so deleting it cannot damage another copy.
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
      materials.set(key, new THREE.MeshStandardMaterial({ color,
        map: finish === "wood" ? grain : null,
        roughness: finish === "metal" ? 0.42 : finish === "wood" ? 0.72 : 0.84,
        metalness: finish === "metal" ? 0.55 : 0
      }));
    }
    return materials.get(key);
  }
  function mesh(geometry, color, x, y, z, finish = "matte") {
    const object = new THREE.Mesh(geometry, material(color, finish));
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }
  function box(w, h, d, color, x = 0, y = 0, z = 0, radius = 0.015, finish = "matte") {
    return mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)) :
      new THREE.BoxGeometry(w, h, d), color, x, y, z, finish);
  }
  function cylinder(top, bottom, height, color, x = 0, y = 0, z = 0, segments = 16) {
    return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), color, x, y, z, "metal");
  }
  return { group, material, mesh, box, cylinder };
}

function beam(target, from, to, width = 0.025, color = CHARCOAL) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const object = target.box(width, direction.length(), width, color,
    ...start.clone().add(end).multiplyScalar(0.5).toArray(), 0.006, "metal");
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

function named(object, name) { object.name = name; return object; }

function glow(target, w, h, d, color, x, y, z) {
  const object = target.box(w, h, d, color, x, y, z, 0.006);
  object.material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4 });
  object.userData.roomBulb = true;
  return object;
}

function table(target, width, depth, color = OAK, height = 0.79) {
  named(target.box(width, 0.09, depth, color, 0, height - 0.045, 0, 0.035, "wood"), "worktop");
  for (const x of [-width / 2 + 0.15, width / 2 - 0.15]) {
    for (const z of [-depth / 2 + 0.13, depth / 2 - 0.13]) {
      target.box(0.065, height - 0.09, 0.065, CHARCOAL, x, (height - 0.09) / 2, z, 0.008, "metal");
    }
    target.box(0.04, 0.07, depth - 0.22, CHARCOAL, x, 0.16, 0, 0.008, "metal");
  }
  target.box(width - 0.28, 0.07, 0.04, CHARCOAL, 0, height - 0.14, -depth / 2 + 0.13, 0.008, "metal");
}

function mug(target, x, y, z) {
  const cup = named(target.cylinder(0.065, 0.057, 0.13, IVORY, x, y + 0.065, z), "desk-mug");
  cup.material = target.material(IVORY);
  target.cylinder(0.052, 0.052, 0.004, "#584235", x, y + 0.132, z);
  const handle = target.mesh(new THREE.TorusGeometry(0.039, 0.01, 5, 12), IVORY, x + 0.068, y + 0.07, z);
  handle.rotation.y = Math.PI / 2;
}

function monitor(target, x, y, z, width = 0.98, reverse = false, photo = false) {
  const unit = kit("monitor-workstation");
  unit.box(width, width * 0.61, 0.055, CHARCOAL, 0, 0.48, -0.08, 0.025);
  glow(unit, width - 0.055, width * 0.61 - 0.055, 0.008, photo ? "#657c85" : "#263e50", 0, 0.48, -0.047);
  if (photo) {
    unit.box(width * 0.61, width * 0.43, 0.009, "#bbab92", -width * 0.08, 0.48, -0.039, 0);
    const mountain = unit.mesh(new THREE.ConeGeometry(width * 0.19, width * 0.3, 3), "#657268", -width * 0.11, 0.48, -0.031);
    mountain.scale.z = 0.015;
    unit.box(width * 0.58, width * 0.09, 0.009, "#557580", -width * 0.08, 0.31, -0.027, 0);
  } else {
    for (let row = 0; row < 8; row += 1) {
      unit.box(width * (0.28 + (row * 3 % 5) * 0.06), 0.012, 0.005, ACCENTS[row % 5], -width * 0.06,
        0.64 - row * 0.043, -0.039, 0);
    }
    unit.box(width * 0.16, width * 0.52, 0.008, "#1b2c38", -width * 0.37, 0.48, -0.035, 0);
  }
  unit.box(0.045, 0.19, 0.045, CHARCOAL, 0, 0.16, -0.08, 0.01, "metal");
  unit.box(0.31, 0.023, 0.19, CHARCOAL, 0, 0.025, -0.05, 0.015, "metal");
  named(unit.box(0.46, 0.026, 0.15, "#d9dcdb", 0, 0.016, 0.24, 0.014), "keyboard");
  for (let row = 0; row < 3; row += 1) for (let key = 0; key < 12; key += 1) {
    unit.box(0.025, 0.004, 0.027, "#8b9295", -0.199 + key * 0.036, 0.032, 0.195 + row * 0.043, 0.003);
  }
  unit.box(0.065, 0.027, 0.105, "#d6d8d6", 0.34, 0.018, 0.24, 0.025);
  unit.group.position.set(x, y, z);
  if (reverse) unit.group.rotation.y = Math.PI;
  target.group.add(unit.group);
}

function deskLamp(target, x, y, z) {
  target.cylinder(0.09, 0.11, 0.018, CHARCOAL, x, y + 0.009, z);
  beam(target, [x, y, z], [x, y + 0.46, z - 0.08]);
  beam(target, [x, y + 0.46, z - 0.08], [x + 0.18, y + 0.5, z]);
  target.cylinder(0.045, 0.105, 0.09, "#656b62", x + 0.18, y + 0.46, z);
  glow(target, 0.13, 0.012, 0.13, "#ffe0aa", x + 0.18, y + 0.41, z);
}

function desk(target, kind, color) {
  const shared = kind === "studyDesk";
  const edit = kind === "photoEditDesk";
  table(target, shared ? 4.4 : edit ? 2.8 : 2.2, shared ? 2 : 1.1, color);
  if (shared) {
    for (const x of [-1.1, 1.1]) for (const reverse of [false, true]) {
      monitor(target, x, 0.79, reverse ? -0.23 : 0.23, 0.92, reverse);
      mug(target, x + (reverse ? -0.68 : 0.68), 0.79, reverse ? -0.61 : 0.61);
    }
    target.box(4, 0.16, 0.075, "#7f9290", 0, 0.87, 0, 0.016);
    named(target.box(3.6, 0.075, 0.18, CHARCOAL, 0, 0.64, 0, 0.01), "cable-tray");
  } else {
    monitor(target, edit ? -0.39 : -0.22, 0.79, -0.1, edit ? 1.3 : 1, false, edit);
    if (edit) {
      target.box(0.44, 0.69, 0.67, "#535b5c", 0.98, 0.35, -0.04, 0.035);
      for (let slot = 0; slot < 5; slot += 1) target.box(0.24, 0.015, 0.005, "#1c2328", 0.98, 0.34 + slot * 0.045, 0.299, 0);
      target.box(0.4, 0.02, 0.26, "#3a464f", 0.63, 0.807, 0.27, 0.02);
    }
    mug(target, edit ? 0.94 : 0.64, 0.79, 0.34);
    deskLamp(target, edit ? 0.93 : 0.72, 0.79, -0.35);
    target.box(0.27, 0.018, 0.34, ACCENTS[2], edit ? 0.18 : 0.53, 0.805, 0.21, 0.008);
  }
}

function rollingBase(target, width, depth) {
  for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) {
    target.box(0.06, 0.82, 0.06, "#636b70", x, 0.48, 0, 0.01, "metal");
    target.box(0.1, 0.05, depth - 0.07, "#636b70", x, 0.1, 0, 0.02, "metal");
    for (const z of [-depth / 2 + 0.08, depth / 2 - 0.08]) {
      const wheel = target.cylinder(0.055, 0.055, 0.035, CHARCOAL, x, 0.055, z);
      wheel.rotation.z = Math.PI / 2;
    }
  }
}

function board(target, kind, color) {
  const screen = kind === "projectScreen";
  const display = kind === "projectDisplay";
  const width = screen ? 3.6 : display ? 3 : 2.6;
  const height = screen ? 2.8 : display ? 2.4 : 2.35;
  rollingBase(target, width, 0.7);
  target.box(width, height - 0.8, 0.1, display ? CHARCOAL : "#a89e8c", 0, (height + 0.8) / 2, 0, 0.035, "metal");
  target.box(width - 0.1, height - 0.9, 0.012, screen ? "#d3cfe3" : display ? "#274d62" : color || "#f2f0e6",
    0, (height + 0.8) / 2, 0.058, 0.01);
  if (screen || display) {
    const glyph = named(target.group, screen ? "presentation-screen" : "project-demo-display");
    glyph.userData.screenType = screen ? "presentation" : "project";
    for (const side of [-1, 1]) {
      beam(target, [side * 0.57, 1.7, 0.08], [side * 0.8, 1.95, 0.08], 0.05, IVORY);
      beam(target, [side * 0.8, 1.95, 0.08], [side * 0.57, 2.2, 0.08], 0.05, IVORY);
    }
    beam(target, [-0.09, 1.7, 0.08], [0.09, 2.2, 0.08], 0.045, IVORY);
    target.box(1.35, 0.035, 0.01, "#e9e3d9", 0, 1.35, 0.08, 0.008);
    target.box(0.95, 0.025, 0.01, "#b4bbc5", 0, 1.22, 0.08, 0.006);
  } else {
    for (let col = 0; col < 3; col += 1) {
      target.box(0.57, 0.075, 0.006, ACCENTS[col], -0.8 + col * 0.8, 2.13, 0.073, 0.006);
      if (col < 2) target.box(0.007, 0.92, 0.008, "#b7b6ae", -0.4 + col * 0.8, 1.54, 0.075, 0);
      for (let row = 0; row < 3 - col; row += 1) {
        named(target.box(0.23, 0.2, 0.01, ["#e6cb76", "#b4c9b1", "#d9b5bd"][row % 3],
          -0.93 + col * 0.8 + row % 2 * 0.28, 1.87 - row * 0.29, 0.08, 0.005), "sprint-note");
      }
    }
    target.box(2.3, 0.035, 0.12, "#8b9090", 0, 0.89, 0.12, 0.01, "metal");
    for (let i = 0; i < 3; i += 1) target.box(0.17, 0.018, 0.025, ACCENTS[i], 0.48 + i * 0.2, 0.917, 0.12, 0.006);
  }
}

function cabinet(target, width, depth, height, color = OAK) {
  target.box(width, 0.09, depth, color, 0, 0.07, 0, 0.015, "wood");
  target.box(width, 0.07, depth, color, 0, height - 0.035, 0, 0.015, "wood");
  target.box(width, height - 0.12, 0.045, "#675446", 0, height / 2, -depth / 2 + 0.025, 0.008, "wood");
  for (const x of [-width / 2 + 0.04, width / 2 - 0.04]) target.box(0.08, height, depth, color, x, height / 2, 0, 0.012, "wood");
}

function books(target, x, y, z, count, spread = 1) {
  const geometry = new THREE.BoxGeometry(0.065, 0.29, 0.19);
  const mesh = new THREE.InstancedMesh(geometry, target.material("#ffffff"), count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    dummy.position.set(x + index * 0.08 * spread, y + 0.145, z);
    dummy.scale.set(1, 0.74 + (index * 7 % 5) * 0.07, 1);
    dummy.rotation.z = index % 8 === 7 ? -0.08 : 0;
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, new THREE.Color(ACCENTS[index % ACCENTS.length]));
  }
  mesh.name = "reference-books";
  mesh.castShadow = mesh.receiveShadow = true;
  target.group.add(mesh);
}

function camera(target, x, y, z, scale = 1) {
  const part = kit("camera-body-and-lens");
  part.box(0.28, 0.19, 0.12, CHARCOAL, 0, 0.095, 0, 0.025);
  part.box(0.075, 0.08, 0.13, "#20262a", 0.115, 0.08, 0.015, 0.022);
  part.box(0.09, 0.045, 0.075, "#535b5e", -0.03, 0.21, 0, 0.012);
  const lens = part.cylinder(0.075, 0.078, 0.18, "#262d32", 0, 0.1, 0.12, 24);
  lens.rotation.x = Math.PI / 2;
  const glass = part.cylinder(0.064, 0.064, 0.008, "#54717d", 0, 0.1, 0.215, 24);
  glass.rotation.x = Math.PI / 2;
  const ring = part.mesh(new THREE.TorusGeometry(0.074, 0.006, 5, 24), "#7c8486", 0, 0.1, 0.19, "metal");
  ring.name = "lens-focus-ring";
  part.cylinder(0.025, 0.025, 0.018, "#9d9c93", 0.08, 0.2, -0.005);
  part.group.position.set(x, y, z);
  part.group.scale.setScalar(scale);
  target.group.add(part.group);
}

function shelves(target, kind, color) {
  const photo = kind === "cameraCabinet";
  const width = photo ? 2.8 : 2.6;
  const height = photo ? 2.7 : 2.65;
  cabinet(target, width, photo ? 0.65 : 0.6, height, color);
  for (const x of [-width / 6, width / 6]) target.box(0.055, height - 0.16, 0.52, color, x, height / 2, 0, 0.008, "wood");
  for (let row = 0; row < 4; row += 1) {
    const y = 0.22 + row * 0.6;
    target.box(width - 0.15, 0.05, 0.54, color, 0, y, 0.015, 0.009, "wood");
    for (let col = 0; col < 3; col += 1) {
      const x = (col - 1) * width / 3;
      if (photo) {
        if ((row + col) % 2) {
          camera(target, x - 0.2, y + 0.025, 0.01, 1.1);
          camera(target, x + 0.22, y + 0.025, 0.01, 0.9);
        } else for (let lens = 0; lens < 3; lens += 1) {
          target.cylinder(0.075, 0.08, 0.22 + lens * 0.05, CHARCOAL, x - 0.23 + lens * 0.23, y + 0.14 + lens * 0.025, 0.06);
          target.cylinder(0.079, 0.079, 0.02, "#7d8588", x - 0.23 + lens * 0.23, y + 0.1, 0.06);
        }
      } else books(target, x - 0.3, y + 0.027, 0.08, 8);
    }
  }
  glow(target, width - 0.22, 0.015, 0.035, "#ffe3b6", 0, height - 0.09, 0.2);
}

function server(target, color) {
  target.box(0.94, 2.2, 0.9, color || "#454d55", 0, 1.12, 0, 0.04, "metal");
  target.box(0.81, 1.98, 0.018, "#222c33", 0, 1.17, 0.46, 0.008);
  for (let unit = 0; unit < 8; unit += 1) {
    const y = 0.3 + unit * 0.23;
    target.box(0.73, 0.18, 0.03, "#727a7c", 0, y, 0.48, 0.008, "metal");
    for (let slot = 0; slot < 5; slot += 1) target.box(0.054, 0.075, 0.01, "#202c31", -0.2 + slot * 0.08, y, 0.494, 0.003);
    glow(target, 0.018, 0.022, 0.008, unit % 3 ? "#90c8a5" : "#7bafe3", -0.31, y + 0.03, 0.494);
  }
}

function storage(target, color) {
  cabinet(target, 2.4, 0.65, 0.94, color);
  for (let col = 0; col < 3; col += 1) {
    for (let row = 0; row < 2; row += 1) {
      const panel = target.box(0.72, 0.35, 0.055, row ? "#d8cfbb" : color, (col - 1) * 0.77, 0.31 + row * 0.39, 0.2775, 0.014, "wood");
      const handle = target.box(0.14, 0.018, 0.025, CHARCOAL, (col - 1) * 0.77, 0.39 + row * 0.39, 0.311, 0.007, "metal");
      sharedDoor(target.group, [panel, handle], (col - 1) * 0.77 - 0.36, 0.2775);
    }
  }
  for (let i = 0; i < 4; i += 1) target.box(0.35, 0.043, 0.28, ACCENTS[i], -0.7, 0.965 + i * 0.045, 0, 0.009);
  target.box(0.36, 0.15, 0.28, "#8f9f92", 0.57, 1.015, 0, 0.015);
}

function tripodBase(target, radius, height) {
  target.cylinder(0.018, 0.026, height, CHARCOAL, 0, height / 2, 0);
  for (let index = 0; index < 3; index += 1) {
    const angle = Math.PI / 6 + index * Math.PI * 2 / 3;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    beam(target, [0, height * 0.57, 0], [x, 0.035, z], 0.027);
    target.box(0.055, 0.04, 0.07, "#282d30", x, 0.02, z, 0.012);
    beam(target, [0, height * 0.25, 0], [x * 0.62, height * 0.21, z * 0.62], 0.014, "#73797b");
  }
}

function backdrop(target, color) {
  const points = [new THREE.Vector2(-1.32, 3.45), new THREE.Vector2(-1.32, 0.8)];
  for (let index = 0; index <= 16; index += 1) {
    const angle = Math.PI + index / 16 * Math.PI / 2;
    points.push(new THREE.Vector2(-0.52 + Math.cos(angle) * 0.8, 0.8 + Math.sin(angle) * 0.8));
  }
  points.push(new THREE.Vector2(1.37, 0.018));
  const vertices = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]; const b = points[index + 1];
    vertices.push(-2.12, a.y, a.x, 2.12, a.y, a.x, -2.12, b.y, b.x,
      2.12, a.y, a.x, 2.12, b.y, b.x, -2.12, b.y, b.x);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const cyc = named(target.mesh(geometry, color || "#e9e5df", 0, 0, 0), "seamless-curved-backdrop");
  cyc.material.side = THREE.DoubleSide;
  for (const x of [-2.28, 2.28]) {
    target.cylinder(0.024, 0.027, 3.5, CHARCOAL, x, 1.75, -1.1);
    target.box(0.2, 0.035, 0.52, CHARCOAL, x, 0.03, -1.1, 0.012, "metal");
    target.cylinder(0.04, 0.04, 0.1, "#767d7b", x, 2.5, -1.1);
  }
  beam(target, [-2.37, 3.5, -1.1], [2.37, 3.5, -1.1], 0.06);
  const roll = target.cylinder(0.075, 0.075, 4.3, IVORY, 0, 3.46, -1.22, 24);
  roll.rotation.z = Math.PI / 2;
}

function softbox(target, color) {
  tripodBase(target, 0.63, 2.02);
  const housing = target.mesh(new THREE.CylinderGeometry(0.53, 0.2, 0.36, 8), color || "#34383d", 0, 2.11, 0);
  housing.rotation.x = Math.PI / 2;
  const diffuser = target.mesh(new THREE.CircleGeometry(0.5, 8), "#f8efde", 0, 2.11, 0.185);
  diffuser.material = new THREE.MeshStandardMaterial({ color: "#fff6e9", emissive: "#ffefd7", emissiveIntensity: 0.3, roughness: 1 });
  diffuser.castShadow = diffuser.receiveShadow = false;
  diffuser.userData.roomBulb = true;
  diffuser.userData.roomBulbStrength = 0.3;
  named(diffuser, "softbox-diffuser");
  const light = new THREE.SpotLight("#fff0da", 7, 6, Math.PI / 3, 1, 2);
  light.position.set(0, 2.11, 0.205);
  light.target.position.set(0, 2.11, 1.205);
  light.userData.roomLamp = true;
  light.userData.roomLampStrength = 7;
  target.group.add(light, light.target);
  for (const x of [-0.35, 0.35]) beam(target, [x, 2.11, 0], [x * 0.45, 1.92, -0.08], 0.018, "#747a7b");
}

function landscape(target, x, y, z, width, height, variant = 0) {
  named(target.box(width, height, 0.065, variant % 2 ? "#4c4843" : OAK, x, y, z, 0.01, "wood"), "framed-photo");
  target.box(width - 0.075, height - 0.075, 0.015, "#efede5", x, y, z + 0.04, 0.002);
  target.box(width - 0.18, height - 0.18, 0.012, variant % 2 ? "#9cabb0" : "#afbbbd", x, y, z + 0.052, 0);
  const mountain = target.mesh(new THREE.ConeGeometry(width * 0.31, height * 0.46, 3), variant % 2 ? "#65746b" : "#8d7e68", x, y - height * 0.07, z + 0.063);
  mountain.scale.z = 0.01;
  target.box(width - 0.18, height * 0.16, 0.014, "#71868b", x, y - height * 0.27, z + 0.077, 0);
}

function gallery(target, color) {
  target.box(3.14, 2.72, 0.14, color || "#dbd5ca", 0, 1.53, 0, 0.022);
  for (const x of [-1.17, 1.17]) target.box(0.09, 0.06, 0.48, CHARCOAL, x, 0.03, 0, 0.015, "metal");
  for (const [side, angle] of [["front", 0], ["back", Math.PI]]) {
    const face = kit(`gallery-${side}`);
    for (let index = 0; index < 4; index += 1) {
      landscape(face, index % 2 ? 0.73 : -0.73, index < 2 ? 2.19 : 1.1, 0.1, 1.18, 0.88, index);
    }
    face.group.rotation.y = angle;
    target.group.add(face.group);
  }
  named(target.group, "movable-photo-gallery");
}

function printBench(target, color) {
  table(target, 3, 1.1, color, 0.88);
  target.box(0.95, 0.34, 0.57, "#858d8d", -0.83, 1.05, -0.11, 0.035);
  target.box(0.81, 0.12, 0.03, "#373f44", -0.83, 1.03, 0.19, 0.015);
  target.box(0.62, 0.025, 0.43, IVORY, -0.83, 0.94, 0.28, 0.008);
  for (let index = 0; index < 4; index += 1) {
    const print = kit("portfolio-print");
    landscape(print, 0, 0, 0, 0.32, 0.24, index);
    print.group.rotation.x = -Math.PI / 2;
    print.group.position.set(0.1 + index % 2 * 0.55, 0.9, -0.22 + Math.floor(index / 2) * 0.43);
    target.group.add(print.group);
  }
  for (let index = 0; index < 3; index += 1) target.cylinder(0.07, 0.07, 0.48, ["#d3ccbd", "#899293", "#b5aa9a"][index], 1.1 + index * 0.11, 1.12, -0.19);
  target.box(2.6, 0.06, 0.72, color, 0, 0.2, 0, 0.012, "wood");
  target.box(0.8, 0.22, 0.6, "#68757a", 0.5, 0.34, 0, 0.02);
  target.box(0.78, 0.02, 0.59, IVORY, -0.6, 0.24, 0, 0.005);
}

function equipmentCase(target, color) {
  target.box(1.16, 0.68, 0.76, color || "#4d5758", 0, 0.39, 0, 0.035);
  for (const x of [-0.56, 0.56]) for (const z of [-0.36, 0.36]) {
    target.box(0.06, 0.71, 0.06, "#9faaa8", x, 0.4, z, 0.01, "metal");
  }
  target.box(1.18, 0.035, 0.78, "#a0a7a4", 0, 0.51, 0, 0.01, "metal");
  for (const x of [-0.35, 0.35]) target.box(0.07, 0.13, 0.025, "#b3b6ac", x, 0.5, 0.385, 0.012, "metal");
  target.box(0.26, 0.06, 0.06, CHARCOAL, 0, 0.77, 0, 0.02);
  for (const x of [-0.4, 0.4]) for (const z of [-0.26, 0.26]) {
    const wheel = target.cylinder(0.055, 0.055, 0.04, CHARCOAL, x, 0.055, z);
    wheel.rotation.z = Math.PI / 2;
  }
}

export function createStudyPhotoAsset(kind, { color } = {}) {
  if (!STUDY_PHOTO_KINDS.includes(kind)) return null;
  const target = kit(`asset-${kind}`);
  if (["studyDesk", "focusDesk", "photoEditDesk"].includes(kind)) desk(target, kind, color || OAK);
  else if (["whiteboard", "projectScreen", "projectDisplay"].includes(kind)) board(target, kind, color);
  else if (["projectShelf", "cameraCabinet"].includes(kind)) shelves(target, kind, color || OAK);
  else if (kind === "studyCabinet") storage(target, color || OAK);
  else if (kind === "serverRack") server(target, color);
  else if (kind === "photoBackdrop") { backdrop(target, color); target.group.scale.y = 0.9; }
  else if (kind === "softbox") softbox(target, color);
  else if (kind === "photoTripod") {
    tripodBase(target, 0.43, 1.39);
    camera(target, 0, 1.4, 0, 1.15);
    beam(target, [0, 1.35, 0], [0.2, 1.29, -0.22], 0.017);
  } else if (kind === "galleryPartition") gallery(target, color);
  else if (kind === "photoPrintBench") printBench(target, color || OAK);
  else if (kind === "photoEquipmentCase") equipmentCase(target, color);
  else if (kind === "photoReflector") {
    tripodBase(target, 0.31, 1.25);
    const reflector = target.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.025, 40), color || "#e8ddc0", 0, 1.45, 0);
    reflector.rotation.x = Math.PI / 2;
    named(reflector, "photography-reflector");
    target.mesh(new THREE.TorusGeometry(0.55, 0.018, 6, 40), CHARCOAL, 0, 1.45, 0);
  }
  target.group.userData.assetKind = kind;
  return target.group;
}

export const STUDY_PHOTO_LAYOUTS = Object.freeze({
  study: {
    displayName: "개발 스터디 워크스페이스", groundName: "1층 공동 작업실", windowSide: "left",
    building: { minX: -11, maxX: 11, minZ: -12, maxZ: 5, height: 9.8 },
    mezzanine: { minX: -11, maxX: 11, minZ: -12, maxZ: -7, height: 4.6 },
    stairs: { minX: 8.6, maxX: 10.6, minZ: -7, maxZ: 2.7, height: 4.6, steps: 29 },
    walls: [
      { x: 0, z: -12, width: 22.2, depth: 0.24, height: 9.8 },
      { x: -11, z: -3.5, width: 0.24, depth: 17, height: 9.8 },
      { x: 11, z: -3.5, width: 0.24, depth: 17, height: 9.8, cutaway: true },
      { x: -7.25, z: 5, width: 7.5, depth: 0.24, height: 9.8, cutaway: true },
      { x: 5.25, z: 5, width: 11.5, depth: 0.24, height: 9.8, cutaway: true }
    ],
    pillars: [
      { x: -10.75, z: -7.1, width: 0.24, depth: 0.24, height: 4.6 },
      { x: 0, z: -7.1, width: 0.24, depth: 0.24, height: 4.6 },
      { x: 8.35, z: -7.1, width: 0.24, depth: 0.24, height: 4.6 }
    ],
    railings: [
      { x: -1.2, z: -7, width: 19.6, depth: 0.12, height: 1.05 },
      { x: 10.85, z: -7, width: 0.3, depth: 0.12, height: 1.05 }
    ],
    stairRails: [
      { x: 8.6, z: -2.15, width: 0.12, depth: 9.7, height: 1.05 },
      { x: 10.6, z: -2.15, width: 0.12, depth: 9.7, height: 1.05 }
    ],
    clearPaths: [
      { minX: -3.1, maxX: -1, minZ: -6.8, maxZ: 8.2 },
      { minX: -10.7, maxX: 10.7, minZ: 3.5, maxZ: 4.8 },
      { minX: 8.2, maxX: 10.9, minZ: -7, maxZ: 4.8 },
      { minX: -10.7, maxX: 8.4, minZ: -6.8, maxZ: -5.5 }
    ],
    mezzaninePaths: [{ minX: -11, maxX: 11, minZ: -8.3, maxZ: -7 }],
    facilityWalk: [], facilityPlacement: [],
    zones: [
      { id: "work", name: "공동 개발 데스크", minX: -10.8, maxX: 8.1, minZ: -5.5, maxZ: 3.4 },
      { id: "presentation", name: "발표와 프로젝트 전시", minX: -10.8, maxX: 8.1, minZ: -11.8, maxZ: -6.8 }
    ]
  },
  photo: {
    displayName: "포토 스튜디오와 갤러리", groundName: "1층 촬영·편집 스튜디오", windowSide: "back",
    building: { minX: -9, maxX: 9, minZ: -13, maxZ: 5, height: 9.4 },
    mezzanine: { minX: -9, maxX: 2.4, minZ: -13, maxZ: -7.3, height: 4.4 },
    stairs: { minX: -8.7, maxX: -6.7, minZ: -7.3, maxZ: 2.5, height: 4.4, steps: 28 },
    walls: [
      { x: 0, z: -13, width: 18.2, depth: 0.24, height: 9.4 },
      { x: -9, z: -4, width: 0.24, depth: 18, height: 9.4, cutaway: true },
      { x: 9, z: -4, width: 0.24, depth: 18, height: 9.4 },
      { x: -6.25, z: 5, width: 5.5, depth: 0.24, height: 9.4, cutaway: true },
      { x: 4.25, z: 5, width: 9.5, depth: 0.24, height: 9.4, cutaway: true }
    ],
    pillars: [
      { x: -6.5, z: -7.45, width: 0.24, depth: 0.24, height: 4.4 },
      { x: 2.2, z: -7.45, width: 0.24, depth: 0.24, height: 4.4 }
    ],
    railings: [
      { x: -8.85, z: -7.3, width: 0.3, depth: 0.12, height: 1.05 },
      { x: -2.15, z: -7.3, width: 9.1, depth: 0.12, height: 1.05 },
      { x: 2.4, z: -10.15, width: 0.12, depth: 5.7, height: 1.05 }
    ],
    stairRails: [
      { x: -8.7, z: -2.4, width: 0.12, depth: 9.8, height: 1.05 },
      { x: -6.7, z: -2.4, width: 0.12, depth: 9.8, height: 1.05 }
    ],
    clearPaths: [
      { minX: -2.9, maxX: -1.1, minZ: -6.8, maxZ: 8.2 },
      { minX: -8.7, maxX: 8.7, minZ: 3.5, maxZ: 4.8 },
      { minX: -8.95, maxX: -6.4, minZ: -7.3, maxZ: 4.8 },
      { minX: -6.3, maxX: 8.8, minZ: -6.8, maxZ: -5.5 }
    ],
    mezzaninePaths: [{ minX: -9, maxX: 2.4, minZ: -8.6, maxZ: -7.3 }],
    facilityWalk: [], facilityPlacement: [],
    zones: [
      { id: "shoot", name: "촬영 부스", minX: 2.5, maxX: 8.8, minZ: -12.8, maxZ: -6.8 },
      { id: "edit", name: "사진 작업과 휴식", minX: -6.3, maxX: 8.8, minZ: -5.5, maxZ: 3.4 }
    ]
  }
});
