import * as THREE from 'three';
import { TANK } from './physics.js';
import { COURT_COLORS, FRAME_COLOR, studioMaterial, teamMaterial } from './studio-materials.js';
import { PLANET_COLORS } from './background-planets.js';

export const PLAYGROUND_FLOOR = Object.freeze({ width: 80, depth: 60, y: -6.4, centerZ: 20 });

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
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const grass = teamMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.65, side: THREE.DoubleSide });
  materials.add(grass);
  const ivory = material(PLANET_COLORS.ivory);
  const mint = material(COURT_COLORS.mint), coral = material(COURT_COLORS.coral);
  const support = studioMaterial({ color: FRAME_COLOR, roughness: 0.5 });
  materials.add(support);
  const mesh = (shape, paint, position, scale = [1, 1, 1], parent = group) => {
    const object = new THREE.Mesh(shape, paint);
    object.position.set(...position);
    object.scale.set(...scale);
    parent.add(object);
    return object;
  };
  const ground = () => PLAYGROUND_FLOOR.y;

  // Extend past the camera edges so the court reads as a floor, not a raised platform.
  const floorGeometry = geometry(new THREE.PlaneGeometry(PLAYGROUND_FLOOR.width, PLAYGROUND_FLOOR.depth, 2, 1).rotateX(-Math.PI / 2).toNonIndexed());
  const colors = new THREE.Float32BufferAttribute(new Float32Array(floorGeometry.attributes.position.count * 3), 3);
  floorGeometry.setAttribute('color', colors);
  mesh(floorGeometry, grass, [0, PLAYGROUND_FLOOR.y, PLAYGROUND_FLOOR.centerZ]).name = 'playground-floor';

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
  ribbon([[-8.3, -5.5], [8.3, -5.5], [8.3, 5.5], [-8.3, 5.5]], 0.085, true);
  ribbon(Array.from({ length: 49 }, (_, index) => [0, -5.5 + index * 11 / 48]), 0.07);
  ribbon(ellipse(2.5, 2.5, 1.3), 0.07, true);
  const markingGeometry = geometry(new THREE.BufferGeometry());
  markingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(markingVertices, 3));
  markingGeometry.computeVertexNormals();
  const marking = material(COURT_COLORS.line);
  marking.roughness = 0.94; marking.envMapIntensity = 0.04;
  marking.polygonOffset = true; marking.polygonOffsetFactor = -1; marking.polygonOffsetUnits = -1;
  mesh(markingGeometry, marking, [0, 0, 0]).name = 'playground-court-markings';

  for (const x of [-7.4, 7.4]) {
    const floor = ground(x, 0), top = TANK.bottom - 0.12;
    mesh(cylinder, support, [x, (floor + top) / 2, 0], [0.18, top - floor, 0.18]).name = 'playground-support';
  }

  const seat = geometry(new THREE.CapsuleGeometry(0.17, 1.9, 4, 16).rotateZ(Math.PI / 2));
  for (const x of [-6.2, 6.2]) {
    const bench = new THREE.Group();
    bench.name = 'playground-bench';
    bench.position.set(x, PLAYGROUND_FLOOR.y, 2.9);
    bench.rotation.y = x < 0 ? -0.12 : 0.12;
    group.add(bench);
    mesh(seat, ivory, [0, 0.65, 0], [1, 1, 2.2], bench);
    for (const side of [-1, 1]) {
      mesh(box, support, [side * 0.72, 0.25, 0], [0.18, 0.5, 0.55], bench);
    }
  }

  const cone = geometry(new THREE.CylinderGeometry(0.06, 0.24, 0.42, 16));
  for (const [x, z] of [[-5.1, 5.1], [5.2, 4.8], [5.9, 5.3]]) {
    const marker = new THREE.Group();
    marker.name = 'playground-court-marker';
    marker.position.set(x, PLAYGROUND_FLOOR.y, z);
    group.add(marker);
    mesh(cylinder, ivory, [0, 0.04, 0], [0.32, 0.08, 0.32], marker);
    mesh(cone, x < 0 ? mint : coral, [0, 0.29, 0], [1, 1, 1], marker);
  }

  let paletteApplied = false, disposed = false;
  function setPeriod() {
    // Keep one playground palette while retaining the sky callback contract.
    if (disposed || paletteApplied) return;
    paletteApplied = true;
    const mint = new THREE.Color(COURT_COLORS.mint), coral = new THREE.Color(COURT_COLORS.coral);
    const positions = floorGeometry.attributes.position;
    for (let face = 0; face < positions.count; face += 3) {
      const top = positions.getX(face) + positions.getX(face + 1) + positions.getX(face + 2) < 0 ? coral : mint;
      for (let i = face; i < face + 3; i++) {
        colors.setXYZ(i, top.r, top.g, top.b);
      }
    }
    colors.needsUpdate = true;
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
