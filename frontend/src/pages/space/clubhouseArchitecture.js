import { createSurfaceMaterial } from "./architecturalMaterials";
import * as THREE from "three";
import { createBuildingContext } from "./roomBuilding";
import { getClerestoryOpening } from "./clubhouseExterior";
import { buildThemeWall } from "./themeArchitecture";

// Geometry follows the same per-preset plan used by placement and walking.
export function createClubhouseArchitecture(layout, { template, floorColor, wallColor }) {
  const root = new THREE.Group();
  root.name = `${template}-building`;
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.76 }));
    return materials.get(color);
  };
  function box(name, w, h, d, color, x, y, z, parent = root, surface) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), surface ? material(color).clone() : material(color));
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    if (surface) { mesh.userData.roomSurface = surface; mesh.userData.surfaceShade = 1; }
    parent.add(mesh);
    return mesh;
  }
  const { building: b, mezzanine: m, stairs: s } = layout;
  const width = b.maxX - b.minX;
  const depth = b.maxZ - b.minZ;
  const timber = { band: "#34323a", study: "#c7d0d2", photo: "#6c716e", boardgame: "#88613e", dining: "#b3946c", climbing: "#6c777b" }[template];
  const metal = template === "study" ? "#9ba8ad" : template === "climbing" ? "#4b6067" : "#393b40";
  function floor(area, y, parent) {
    const slab = box("floor-slab", area.maxX - area.minX, 0.24, area.maxZ - area.minZ, floorColor,
      (area.minX + area.maxX) / 2, y - 0.12, (area.minZ + area.maxZ) / 2, parent, "floor");
    slab.material = createSurfaceMaterial(template === "study" ? "stone" : template === "band" ? "walnut" : "oak",
      floorColor, area.maxX - area.minX, area.maxZ - area.minZ);
    slab.userData.floorPattern = template === "study" ? "stone" : "oak";
  }
  floor(b, 0, root);
  for (const wall of layout.walls) {
    const group = new THREE.Group();
    group.name = "clubhouse-wall";
    group.userData.buildingWall = true;
    group.userData.walkthroughOnly = Boolean(wall.cutaway);
    root.add(group);
    const front = wall.z === b.maxZ;
    const bottom = front ? 2.5 : 0;
    if (!buildThemeWall(group, wall, layout, template, wallColor)) {
      // The facade provides the window frames and the wall between them.
      const opening = front && layout.terrace ? getClerestoryOpening(wall.height, template) : null;
      const sections = opening ? [[bottom, opening.sill], [opening.head, wall.height]] : [[bottom, wall.height]];
      for (const [from, to] of sections)
        box("plaster-wall", wall.width, to - from, wall.depth, wallColor,
          wall.x, (from + to) / 2, wall.z, group, "wall");
    }
    box("wall-coping", wall.width + 0.06, 0.16, wall.depth + 0.06, metal, wall.x, wall.height, wall.z, group);
    if (!front) {
      box("timber-skirting", wall.width + 0.02, 0.16, wall.depth + 0.04, timber, wall.x, 0.08, wall.z, group);
      if (template === "dining")
        box("wall-dado", wall.width + 0.01, 1.1, wall.depth + 0.01, timber, wall.x, 0.61, wall.z, group);
    }
  }
  const deck = new THREE.Group();
  deck.name = "clubhouse-mezzanine";
  deck.userData.mezzanine = true;
  root.add(deck);
  floor(m, m.height, deck);
  box("mezzanine-front-beam", m.maxX - m.minX, 0.26, 0.18, metal, (m.minX + m.maxX) / 2, m.height - 0.13, m.maxZ, deck);
  for (const pillar of layout.pillars || [])
    box("support-column", pillar.width, m.height, pillar.depth, metal, pillar.x, m.height / 2, pillar.z);
  function beam(from, to, thickness, color, parent) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const mesh = box("railing-beam", thickness, start.distanceTo(end), thickness, color, 0, 0, 0, parent);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  }
  for (const rail of layout.railings || []) {
    const alongX = rail.width > rail.depth;
    const step = { climbing: 1.8, band: 1.6, study: 1.8, photo: 1.3, dining: 0.32, boardgame: 0.48 }[template];
    const count = Math.ceil(Math.max(rail.width, rail.depth) / step);
    for (let i = 0; i <= count; i++) {
      const x = rail.x + (rail.width > rail.depth ? rail.width * (i / count - 0.5) : 0);
      const z = rail.z + (rail.depth > rail.width ? rail.depth * (i / count - 0.5) : 0);
      box("rail-baluster", template === "boardgame" ? 0.07 : 0.04, 1.05, 0.04, template === "boardgame" || template === "dining" ? timber : metal, x, m.height + 0.525, z, deck);
    }
    if (template === "study") {
      const panel = box("study-glass-balustrade", alongX ? rail.width : 0.025, 0.83, alongX ? 0.025 : rail.depth,
        "#afcbd0", rail.x, m.height + 0.54, rail.z, deck);
      panel.material = panel.material.clone(); panel.material.transparent = true; panel.material.opacity = 0.27; panel.material.depthWrite = false;
    } else if (template === "band") {
      box("band-solid-studio-parapet", alongX ? rail.width : 0.09, 0.72, alongX ? 0.09 : rail.depth,
        "#34333c", rail.x, m.height + 0.44, rail.z, deck);
    } else if (template === "climbing" || template === "photo") {
      for(const height of [0.35,0.65,0.9])box("horizontal-safety-rail", alongX ? rail.width : 0.025, 0.025, alongX ? 0.025 : rail.depth,
        metal, rail.x, m.height + height, rail.z, deck);
    }
    for (const y of [m.height + 0.12, m.height + 1.05])
      box("rail-handrail", rail.width, 0.065, rail.depth, y > m.height + 1 ? timber : metal, rail.x, y, rail.z, deck);
  }
  const run = s.maxZ - s.minZ;
  const sw = s.maxX - s.minX;
  for (let i = 0; i < s.steps; i++) {
    const y = s.height * (i + 1) / s.steps;
    box("stair-tread", sw, 0.09, run / s.steps + 0.02, timber, (s.minX + s.maxX) / 2,
      y - 0.045, s.maxZ - (i + 0.5) * run / s.steps, deck);
    if (["band", "boardgame", "dining", "study"].includes(template))
      box(`${template}-closed-stair-riser`, sw, s.height / s.steps, 0.07, template === "dining" || template === "study" ? "#dadbd3" : timber,
        (s.minX+s.maxX)/2, y-s.height/s.steps/2, s.maxZ-i*run/s.steps-0.04, deck);
  }
  for (const x of [s.minX + 0.05, s.maxX - 0.05]) {
    beam([x, 0.05, s.maxZ], [x, s.height, s.minZ], 0.13, metal, deck);
    beam([x, 1.05, s.maxZ], [x, s.height + 1.05, s.minZ], 0.07, timber, deck);
    for (let i = 0; i <= 10; i++) {
      const y = s.height * i / 10;
      box("stair-baluster", 0.035, 1.05, 0.035, metal, x, y + 0.525, s.maxZ - run * i / 10, deck);
    }
  }
  const roof = new THREE.Group();
  roof.name = "interior-ceiling";
  roof.userData.walkthroughOnly = true;
  roof.userData.exteriorDetail = !layout.terrace;
  box("ceiling", width, 0.18, depth, template === "band" ? "#29272d" : "#e5ded1", 0, b.height + 0.09, (b.minZ + b.maxZ) / 2, roof);
  root.add(roof);
  root.add(createBuildingContext(b, template, layout.terrace));
  return root;
}
