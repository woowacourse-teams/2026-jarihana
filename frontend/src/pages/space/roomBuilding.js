import { createFloatingIsland } from "./floatingIsland";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { addClubhouseExterior, addClubhouseSign, getClubhouseExteriorPalette } from "./clubhouseExterior";
import { addClubhouseTerrace } from "./clubhouseTerrace";
import { getIslandLayout } from "./islandLayout";
import { createClearWindowMaterial } from "./roomGlazing";

function buildingKit(name, rounded = true) {
  const group = new THREE.Group();
  group.name = name;
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    return materials.get(color);
  };
  const box = (name, width, height, depth, color, x, y, z, parent = group) => {
    const geometry = rounded
      ? new RoundedBoxGeometry(width, height, depth, 1, Math.min(0.018, width / 3, height / 3, depth / 3))
      : new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  return { group, material, box };
}

function addGlazing(kit, parent, width, height, x, y, z, frame) {
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), createClearWindowMaterial());
  glass.name = "building-window-glass";
  glass.userData.roomWindow = true;
  glass.position.set(x, y, z);
  parent.add(glass);
  for (const dx of [-width / 2, 0, width / 2]) kit.box("window-mullion", 0.045, height + 0.07, 0.075, frame, x + dx, y, z + 0.025, parent);
  for (const dy of [-height / 2, 0.1, height / 2]) kit.box("window-mullion", width + 0.07, 0.045, 0.075, frame, x, y + dy, z + 0.025, parent);
  return glass;
}

function addSconce(kit, x, z) {
  const group = new THREE.Group();
  group.name = "entrance-wall-sconce";
  group.position.set(x, 1.9, z);
  kit.group.add(group);
  kit.box("sconce-mount", 0.12, 0.35, 0.07, "#57564d", 0, 0, 0, group);
  kit.box("sconce-arm", 0.04, 0.04, 0.25, "#57564d", 0, 0.06, 0.15, group);
  const globe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 14), new THREE.MeshStandardMaterial({
    color: "#f7e5bb", emissive: "#ffd29b", emissiveIntensity: 0.6, roughness: 0.4
  }));
  globe.position.set(0, -0.03, 0.25);
  globe.userData.roomBulb = true;
  group.add(globe);
  for (const y of [-0.18, 0.12]) kit.box("sconce-cap", 0.19, 0.035, 0.19, "#635c4c", 0, y, 0.25, group);
  const light = new THREE.PointLight("#ffd5a4", 2.4, 4.5, 1);
  light.position.set(0, -0.03, 0.35);
  light.userData.roomLamp = true;
  light.userData.roomLampStrength = light.intensity;
  group.add(light);
}

function addFacadeLighting(kit, building, island) {
  const { minX, maxX, minZ, maxZ, height } = building;
  const centerX = (minX + maxX) / 2;
  const { walkable } = getIslandLayout(building);
  const lensMaterial = new THREE.MeshStandardMaterial({ color: "#fff1d4", emissive: "#ffd39a", roughness: 0.38 });

  function addSpot(x, z, wallX, wallZ) {
    const position = new THREE.Vector3(x, 0.22, z);
    const aim = new THREE.Vector3(wallX, height * 0.62, wallZ);
    const reach = position.distanceTo(aim);
    // Cap the lower spill so a distant facade fixture does not dazzle someone on the lawn.
    const cone = Math.min(Math.PI / 4, Math.asin((aim.y - position.y) / reach) + 0.035);
    const lamp = new THREE.SpotLight("#ffd39a", reach ** 2 * 1.6, reach * 2.5, cone, 0.85, 2);
    lamp.name = "yard-facade-spotlight";
    lamp.position.copy(position);
    lamp.target.position.copy(aim);
    lamp.userData.roomLamp = true;
    lamp.userData.roomLampStrength = lamp.intensity;
    // The fixtures are on the full lawn, but their light reaches the cropped web diorama.
    kit.group.add(lamp, lamp.target);
    kit.box("yard-spotlight-base", 0.28, 0.08, 0.28, "#454644", x, 0.04, z, island);
    kit.box("yard-spotlight-mount", 0.1, 0.15, 0.1, "#454644", x, 0.13, z, island);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.115, 0.24, 12), kit.material("#454644"));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.106, 12), lensMaterial);
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = 0.122;
    lens.userData.roomBulb = true;
    housing.add(lens);
    housing.position.copy(position);
    housing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim.sub(position).normalize());
    island.add(housing);
  }

  for (const side of [-1, 1]) {
    const x = centerX + side * (maxX - minX) * 0.26;
    addSpot(x, walkable.maxZ - 0.4, x, maxZ + 0.35);
    const wallX = side < 0 ? minX : maxX;
    const edgeX = side < 0 ? walkable.minX + 0.4 : walkable.maxX - 0.4;
    for (const segment of [0.26, 0.74]) {
      const z = THREE.MathUtils.lerp(minZ, maxZ, segment);
      addSpot(edgeX, z, wallX + side * 0.22, z);
    }
  }
}

function addOpenDoor(kit, x, direction, frame) {
  const leaf = new THREE.Group();
  leaf.name = "open-glass-entry-door";
  leaf.position.set(x, 0, 5.12);
  leaf.rotation.y = -direction * Math.PI / 2;
  kit.group.add(leaf);
  const center = direction * 0.7;
  const glass = addGlazing(kit, leaf, 1.33, 2.06, center, 1.15, 0, frame);
  glass.name = "entry-door-glass";
  // Doors stay open parallel to the passage, outside its full three-metre width.
  kit.box("door-kickplate", 1.4, 0.12, 0.065, "#62675e", center, 0.08, 0, leaf);
  for (const z of [-0.065, 0.065]) {
    kit.box("door-pull-handle", 0.025, 0.4, 0.025, "#c0a774", direction * 1.12, 1.08, z, leaf);
    for (const y of [0.92, 1.24]) kit.box("door-pull-bracket", 0.025, 0.025, 0.065, "#c0a774", direction * 1.12, y, z / 2, leaf);
  }
  for (const y of [0.35, 1.88]) kit.box("door-hinge", 0.06, 0.12, 0.09, "#7f8175", direction * 0.025, y, 0, leaf);
}

function addFrontFacade(building, palette) {
  const kit = buildingKit("building-entrance");
  kit.group.userData.entrance = true;
  const z = building.maxZ + 0.02;
  const wall = palette?.wall || "#d4c8b6";
  const frame = palette?.trim || "#4a514d";
  const plinth = palette?.roof || "#aaa697";
  const sill = palette?.accent || "#c3b5a0";
  for (const [min, max] of [[building.minX, -3.5], [-0.5, building.maxX]]) {
    const width = max - min;
    const center = (min + max) / 2;
    kit.box("facade-plaster-sill", width, 0.55, 0.24, wall, center, 0.275, z);
    kit.box("facade-stone-plinth", width, 0.19, 0.27, plinth, center, 0.095, z + 0.01);
    kit.box("facade-upper-band", width, 0.23, 0.24, wall, center, 2.335, z);
    kit.box("facade-stone-coping", width + 0.04, 0.06, 0.28, palette ? sill : "#b3ac9d", center, 2.48, z);
    const bays = Math.max(1, Math.floor(width / 2.35));
    const span = width / bays;
    for (let bay = 0; bay < bays; bay += 1) {
      const x = min + span * (bay + 0.5);
      addGlazing(kit, kit.group, span - 0.38, 1.52, x, 1.36, z + 0.035, frame);
      kit.box("window-stone-sill", span - 0.23, 0.07, 0.33, sill, x, 0.57, z + 0.05);
    }
    for (let bay = 0; bay <= bays; bay += 1) {
      const x = min + span * bay;
      const offset = bay === 0 ? 0.12 : bay === bays ? -0.12 : 0;
      kit.box("facade-pier", 0.24, 2.22, 0.25, wall, x + offset, 1.11, z);
    }
    for (let x = min + 0.8; x < max; x += 0.8) kit.box("plinth-joint", 0.012, 0.18, 0.008, "#908d81", x, 0.095, z + 0.15);
  }
  for (const x of [-3.62, -0.38]) kit.box("entry-jamb", 0.12, 2.58, 0.28, frame, x, 1.29, z + 0.04);
  kit.box("entry-transom", 3.36, 0.38, 0.23, frame, -2, 2.53, z + 0.04);
  kit.box("entry-sign-mount", 2.65, 0.28, 0.12, "#705e48", -2, 2.55, 5.16);
  addClubhouseSign(kit.group, 2.5, 0.23, -2, 2.55, 5.245, true);
  kit.box("entry-canopy", 3.65, 0.11, 0.92, palette ? frame : "#6f7165", -2, 2.79, 5.37);
  kit.box("canopy-warm-underside", 3.35, 0.025, 0.68, palette ? sill : "#d5bb8c", -2, 2.725, 5.37);
  kit.box("entry-threshold", 3, 0.012, 0.36, "#b4b2a5", -2, 0.006, 5.08);
  const mat = kit.box("entry-doormat", 2.6, 0.026, 1.05, "#8e8170", -2, 0.013, 5.85);
  mat.material.roughness = 1;
  for (let x = -3.2; x < -0.7; x += 0.09) kit.box("doormat-rib", 0.02, 0.005, 0.92, "#756d5f", x, 0.029, 5.85);
  addOpenDoor(kit, -3.65, 1, frame);
  addOpenDoor(kit, -0.35, -1, frame);
  for (const x of [-3.95, 0]) addSconce(kit, x, 5.18);
  kit.box("room-number-mount", 0.48, 0.2, 0.055, "#a78e64", -3.94, 1.48, 5.19);
  return kit.group;
}

export function createBuildingContext(building, template, terracePlan) {
  const kit = buildingKit("building-context");
  kit.group.userData.buildingContext = true;
  kit.group.userData.entrance = true;
  const island = createFloatingIsland(building, terracePlan);
  kit.group.add(island);
  addFacadeLighting(kit, building, island);
  const facade = addFrontFacade(building, terracePlan && getClubhouseExteriorPalette(template));
  delete facade.userData.entrance;
  if (terracePlan) {
    facade.userData.exteriorDetail = true;
    kit.group.add(facade);
    addClubhouseExterior(kit, building, template);
    const terrace = buildingKit("clubhouse-terrace", false);
    addClubhouseTerrace(terrace, building, template, terracePlan);
    kit.group.add(terrace.group);
    return kit.group;
  }
  facade.userData.entrance = true;
  kit.group.add(facade);
  const terrace = buildingKit("dollhouse-entrance-deck");
  const width = building.maxX - building.minX;
  terrace.box("entry-deck", width, 0.18, 3.2, "#aa9984", 0, -0.12, 6.6);
  for (let z = 5.18; z < 8.2; z += 0.28)
    terrace.box("entry-plank", width, 0.022, 0.26, "#bdab91", 0, -0.019, z);
  terrace.box("cutaway-front-plinth", width, 0.28, 0.18, "#766251", 0, -0.05, 8.2);
  kit.group.add(terrace.group);
  return kit.group;
}
