import * as THREE from "three";

const PALETTES = {
  climbing: { stone: "#c7c6bb", inset: "#abae9e", timber: "#af8656", edge: "#505b5b", planter: "#a7aa9d", leaf: "#657754" },
  boardgame: { stone: "#c7ba9f", inset: "#b2a58e", timber: "#9d7951", edge: "#43564c", planter: "#ad7961", leaf: "#536d50" },
  dining: { stone: "#dacdb4", inset: "#c4b69c", timber: "#b39166", edge: "#79816b", planter: "#ae785c", leaf: "#75805c" },
  band: { stone: "#a7aaa4", inset: "#8e9690", timber: "#986d48", edge: "#333a3b", planter: "#626c63", leaf: "#667959" },
  study: { stone: "#d2cfc0", inset: "#b8bcae", timber: "#ad936c", edge: "#67776c", planter: "#a4ad99", leaf: "#627c61" },
  photo: { stone: "#dedbd1", inset: "#c6c7bd", timber: "#b9aa8b", edge: "#656b67", planter: "#b5b8ab", leaf: "#708167" }
};

function addPlanting(kit, parent, width, depth, palette, index) {
  const planting = new THREE.Group();
  planting.name = "terrace-layered-planting";
  planting.userData.exteriorDetail = true;
  parent.add(planting);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const count = Math.max(3, Math.floor(width / 0.45));
  for (let i = 0; i < count; i += 1) {
    const x = -width / 2 + (i + 0.5) * width / count;
    const height = 0.28 + ((i + index) % 3) * 0.12;
    const leaves = new THREE.Mesh(geometry, kit.material(i % 2 ? palette.leaf : "#89946d"));
    leaves.name = "terrace-shrub-canopy";
    leaves.position.set(x, 0.64 + height * 0.4, -depth * 0.23);
    leaves.scale.set(Math.min(width / count * 0.62, 0.35), height, depth * 0.24);
    leaves.castShadow = leaves.receiveShadow = true;
    planting.add(leaves);
    if (i % 2 === 0) {
      for (let blade = 0; blade < 3; blade += 1) {
        const grass = kit.box("terrace-grass-blade", 0.035, height + 0.35, 0.025,
          "#a0a17b", x + (blade - 1) * 0.07, 0.83, -depth * 0.3, planting);
        grass.rotation.z = (blade - 1) * 0.2;
      }
    }
  }
}

function addPlanterBench(kit, terrace, fixture, palette, index) {
  const { x, z, width, depth } = fixture;
  const group = new THREE.Group();
  group.name = "terrace-integrated-planter-bench";
  group.position.set(x, 0, z);
  const alongSide = depth > width;
  const length = Math.max(width, depth);
  const span = Math.min(width, depth);
  const centerX = (terrace.minX + terrace.maxX) / 2;
  group.rotation.y = alongSide ? (x < centerX ? Math.PI / 2 : -Math.PI / 2) : Math.PI;
  kit.group.add(group);
  kit.box("terrace-planter-shadow-base", length - 0.1, 0.1, span - 0.1, palette.edge, 0, 0.05, 0, group);
  kit.box("terrace-planter-body", length, 0.51, span * 0.58, palette.planter, 0, 0.355, -span * 0.21, group);
  kit.box("terrace-planter-soil", length - 0.15, 0.025, span * 0.58 - 0.15, "#55594a", 0, 0.607, -span * 0.21, group);
  for (const side of [-1, 1]) {
    kit.box("terrace-planter-end-cap", 0.075, 0.05, span * 0.58, palette.stone,
      side * (length / 2 - 0.038), 0.625, -span * 0.21, group);
  }
  kit.box("terrace-planter-rear-cap", length, 0.05, 0.075, palette.stone, 0, 0.625, -span / 2 + 0.038, group);
  kit.box("terrace-built-in-seat-support", length - 0.2, 0.3, span * 0.35, palette.edge, 0, 0.22, span * 0.29, group);
  for (let slat = 0; slat < 4; slat += 1) {
    kit.box("terrace-built-in-seat-slat", length - 0.06, 0.075, span * 0.095, palette.timber,
      0, 0.435, span * (0.12 + slat * 0.105), group);
  }
  const strip = kit.box("terrace-recessed-seat-light", length - 0.35, 0.018, 0.012,
    "#c6aa7f", 0, 0.34, span * 0.47, group);
  strip.material = new THREE.MeshStandardMaterial({ color: "#c6aa7f", emissive: "#dfb67d", emissiveIntensity: 0.18, roughness: 0.8 });
  addPlanting(kit, group, length - 0.17, span, palette, index);
}

export function addClubhouseTerrace(kit, building, template, terrace) {
  const palette = PALETTES[typeof template === "string" ? template : template?.id] || PALETTES.study;
  const width = terrace.maxX - terrace.minX;
  const depth = terrace.maxZ - terrace.minZ;
  const centerX = (terrace.minX + terrace.maxX) / 2;
  const centerZ = (terrace.minZ + terrace.maxZ) / 2;
  const base = kit.box("terrace-foundation", width, 0.18, depth, palette.edge, centerX, -0.13, centerZ);
  base.userData.terraceEdging = true;
  // Every finish ends at y=0 so the terrace shares the entrance walking plane.
  const stoneWidth = width - 1.92;
  const columns = Math.ceil(stoneWidth / 1.2);
  const rows = Math.ceil(depth / 1.15);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      kit.box("terrace-stone-paver", stoneWidth / columns - 0.012, 0.04, depth / rows - 0.012,
        (row + column) % 5 === 0 ? palette.inset : palette.stone,
        terrace.minX + 0.96 + (column + 0.5) * stoneWidth / columns, -0.02,
        terrace.minZ + (row + 0.5) * depth / rows);
    }
  }
  // Timber borders stay flush with the paving and clear of the central entry route.
  for (const side of [-1, 1]) {
    const x = side < 0 ? terrace.minX + 0.48 : terrace.maxX - 0.48;
    for (let slat = 0; slat < 5; slat += 1) {
      kit.box("terrace-timber-inlay", 0.18, 0.04, depth, palette.timber,
        x + (slat - 2) * 0.19, -0.02, centerZ);
    }
    kit.box("terrace-low-side-edge", 0.16, 0.2, depth + 0.16, palette.edge,
      side < 0 ? terrace.minX - 0.08 : terrace.maxX + 0.08, 0.04, centerZ).userData.terraceEdging = true;
  }
  kit.box("terrace-front-coping", width + 0.32, 0.14, 0.16, palette.edge,
    centerX, 0.01, terrace.maxZ + 0.08).userData.terraceEdging = true;
  const drainLength = Math.max(0.1, Math.min(width - 0.4, building.maxX - building.minX - 0.4));
  kit.box("terrace-facade-drain", drainLength, 0.008, 0.07, palette.edge,
    centerX, -0.004, terrace.minZ + 0.12);
  terrace.fixtures.forEach((fixture, index) => addPlanterBench(kit, terrace, fixture, palette, index));
}
