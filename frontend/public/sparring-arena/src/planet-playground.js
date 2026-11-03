import * as THREE from 'three';
import { TANK } from './physics.js';

const PLANET = Object.freeze({ x: 9.3, y: 1.2, z: 6.5, centerY: -8, centerZ: 0 });
const PALETTE = Object.freeze({
  grass: 0xc99458, underside: 0x344962, leaves: 0x78cbb2,
  frame: 0x82c7c4, structure: 0xe6eff2, coral: 0xed958b,
  marking: 0xffffff, trunk: 0x986744,
});

export function createPlanetPlayground(scene) {
  const group = new THREE.Group();
  group.name = 'planet-playground';
  scene.add(group);
  const geometries = new Set(), materials = new Set();
  const geometry = value => { geometries.add(value); return value; };
  const material = color => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, envMapIntensity: 0.12 });
    materials.add(value);
    return value;
  };
  const sphere = geometry(new THREE.SphereGeometry(1, 20, 12));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const grass = material(0xffffff), leaves = material(PALETTE.leaves);
  grass.roughness = 0.94; grass.envMapIntensity = 0.04;
  const frame = material(PALETTE.frame), structure = material(PALETTE.structure);
  const coral = material(PALETTE.coral), trunk = material(PALETTE.trunk);
  const mesh = (shape, paint, position, scale = [1, 1, 1], parent = group) => {
    const object = new THREE.Mesh(shape, paint);
    object.position.set(...position);
    object.scale.set(...scale);
    parent.add(object);
    return object;
  };
  const ground = (x, z) => PLANET.centerY + PLANET.y * Math.sqrt(Math.max(0,
    1 - (x / PLANET.x) ** 2 - ((z - PLANET.centerZ) / PLANET.z) ** 2));

  // The top stays below every tray profile; the foreground curve carries the scenery.
  const globeGeometry = geometry(new THREE.SphereGeometry(1, 64, 24));
  const colors = new THREE.Float32BufferAttribute(new Float32Array(globeGeometry.attributes.position.count * 3), 3);
  globeGeometry.setAttribute('color', colors);
  grass.vertexColors = true;
  mesh(globeGeometry, grass, [0, PLANET.centerY, PLANET.centerZ], [PLANET.x, PLANET.y, PLANET.z]).name = 'playground-planet';

  const markingVertices = [];
  function ribbon(points, width, closed = false) {
    const edges = points.map(([x, z], index) => {
      const previous = points[closed ? (index + points.length - 1) % points.length : Math.max(0, index - 1)];
      const next = points[closed ? (index + 1) % points.length : Math.min(points.length - 1, index + 1)];
      const dx = next[0] - previous[0], dz = next[1] - previous[1];
      const offset = width / (2 * Math.hypot(dx, dz));
      return [1, -1].map(side => {
        const px = x + dz * offset * side, pz = z - dx * offset * side;
        return [px, ground(px, pz) + 0.008, pz];
      });
    });
    for (let i = 0; i < edges.length - (closed ? 0 : 1); i++) {
      const [a, b] = edges[i], [c, d] = edges[(i + 1) % edges.length];
      markingVertices.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  const ellipse = (rx, rz, centerZ = 0) => Array.from({ length: 96 }, (_, index) => {
    const angle = index * Math.PI * 2 / 96;
    return [Math.cos(angle) * rx, centerZ + Math.sin(angle) * rz];
  });
  ribbon(ellipse(8.3, 5.5), 0.085, true);
  ribbon(Array.from({ length: 49 }, (_, index) => [0, -5.5 + index * 11 / 48]), 0.07);
  ribbon(ellipse(2.5, 2.5, 1.3), 0.07, true);
  const markingGeometry = geometry(new THREE.BufferGeometry());
  markingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(markingVertices, 3));
  markingGeometry.computeVertexNormals();
  const marking = material(PALETTE.marking);
  marking.roughness = 0.94; marking.envMapIntensity = 0.04;
  marking.polygonOffset = true; marking.polygonOffsetFactor = -1; marking.polygonOffsetUnits = -1;
  mesh(markingGeometry, marking, [0, 0, 0]).name = 'playground-court-markings';

  for (const x of [-7.4, 7.4]) {
    const floor = ground(x, 0), top = TANK.bottom - 0.12;
    mesh(cylinder, structure, [x, (floor + top) / 2, 0], [0.18, top - floor, 0.18]).name = 'playground-support';
  }

  for (const [x, z, size] of [[-7, 3.1, 0.9], [7, 3.8, 1.1]]) {
    const base = ground(x, z);
    mesh(cylinder, trunk, [x, base + 0.55 * size, z], [0.12 * size, 1.1 * size, 0.12 * size]).name = 'playground-tree-trunk';
    mesh(sphere, leaves, [x, base + 1.55 * size, z], [0.66 * size, 0.98 * size, 0.66 * size]).name = 'playground-tree-canopy';
  }

  const seesaw = new THREE.Group();
  seesaw.name = 'playground-seesaw';
  seesaw.position.set(-5.6, ground(-5.6, 4.1), 4.1);
  seesaw.rotation.y = -0.24;
  group.add(seesaw);
  mesh(geometry(new THREE.CylinderGeometry(0, 0.5, 0.72, 3)), frame, [0, 0.36, 0], [1, 1, 1], seesaw);
  const beam = new THREE.Group(); beam.position.y = 0.74; beam.rotation.z = -0.13; seesaw.add(beam);
  mesh(box, structure, [0, 0, 0], [2.6, 0.14, 0.42], beam);
  for (const side of [-1, 1]) {
    mesh(sphere, side < 0 ? frame : coral, [side * 1.03, 0.1, 0], [0.4, 0.1, 0.32], beam);
    mesh(cylinder, side < 0 ? frame : coral, [side * 0.72, 0.32, 0], [0.045, 0.48, 0.045], beam);
  }

  for (const [x, z, size] of [[5.5, 4.2, 0.36], [6.2, 3.5, 0.22]]) {
    mesh(sphere, structure, [x, ground(x, z) + size * 0.35, z], [size, size * 0.55, size * 0.8]).name = 'playground-pebble';
  }

  let paletteApplied = false, disposed = false;
  function setPeriod() {
    // Keep one playground palette while retaining the sky callback contract.
    if (disposed || paletteApplied) return;
    paletteApplied = true;
    const top = new THREE.Color(PALETTE.grass), bottom = new THREE.Color(PALETTE.underside);
    const tint = new THREE.Color(), positions = globeGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const blend = THREE.MathUtils.smoothstep(positions.getY(i), -0.25, 0.9);
      tint.copy(bottom).lerp(top, blend);
      colors.setXYZ(i, tint.r, tint.g, tint.b);
    }
    colors.needsUpdate = true;
    leaves.color.set(PALETTE.leaves); frame.color.set(PALETTE.frame);
  }
  setPeriod();
  return {
    setPeriod,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometries.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
    },
  };
}
