import * as THREE from 'three';
import { createComposerCharacters } from './composer-characters.js';
import { addPipeRings, createPipeSurfaces, NOZZLE_LENGTH_RATIO, NOZZLE_DEPTH, NOZZLE_HORIZONTAL } from './pipe-surfaces.js';

const COLORS = { a: 0x2ac1bc, b: 0xed6a5a };

// Pixel-space geometry uses the arena's renderer/environment, not another WebGL context.
export function createTransportScene(environment) {
  const back = new THREE.Scene(), front = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  camera.position.z = 1000;
  for (const scene of [back, front]) {
    scene.environment = environment;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe5e7eb, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(-400, 1000, 700);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xe9faff, 0.5);
    fill.position.set(500, 400, -500);
    scene.add(fill);
  }
  const materials = Object.fromEntries(Object.entries(COLORS).map(([side, color]) => [side, createPipeSurfaces(color)]));
  const groups = new Map();
  let viewportWidth = 0, viewportHeight = 0;
  const pixel = (x, y, z = 0) => new THREE.Vector3(x - viewportWidth / 2, viewportHeight / 2 - y, z);

  const characters = createComposerCharacters(front, pixel);

  function clear(group) {
    group.traverse(object => {
      object.geometry?.dispose();
      if (object.isInstancedMesh) object.dispose();
    });
    group.removeFromParent();
  }
  function addTube(group, points, radius, material) {
    if (points.length < 2 || points[0].distanceTo(points[points.length - 1]) < 0.01) return;
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const segments = Math.min(240, Math.max(12, Math.ceil(curve.getLength() / 6)));
    const geometry = new THREE.TubeGeometry(curve, segments, radius, 20, false);
    group.add(new THREE.Mesh(geometry, material));
    return curve;
  }
  function pathPoints(path, start = 0) {
    if (!path || typeof path.getTotalLength !== 'function') return [];
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= start) return [];
    const count = Math.max(2, Math.ceil((length - start) / 8));
    return Array.from({ length: count + 1 }, (_, index) => {
      const point = path.getPointAtLength(start + (length - start) * index / count);
      return pixel(point.x, point.y);
    });
  }
  function hose(group, points, radius, material, offset) {
    const curve = addTube(group, points, radius, material.wall);
    addTube(group, points, radius * (0.65 / 0.8), material.inner);
    if (curve) addPipeRings(group, curve, radius * 2, material.solid, offset);
    return curve?.getLength() ?? 0;
  }
  function nozzle(group, inlet, diameter, side, material) {
    const inward = side === 'a' ? 1 : -1;
    const radius = diameter / 2, length = diameter * NOZZLE_LENGTH_RATIO;
    const direction = new THREE.Vector3(inward * NOZZLE_HORIZONTAL, 0, NOZZLE_DEPTH);
    const mouth = pixel(inlet.x, inlet.y, length * NOZZLE_DEPTH);
    const rear = mouth.clone().addScaledVector(direction, -length);
    const body = new THREE.Group();
    body.position.copy(mouth).addScaledVector(direction, -length / 2);
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    for (const [scale, surface] of [[1, material.wall], [0.65 / 0.8, material.inner]]) {
      const geometry = new THREE.CylinderGeometry(radius * scale, radius * scale, length, 36, 1, true);
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.rotation.x = Math.PI / 2;
      body.add(mesh);
    }
    for (const z of [-length / 2, length / 2]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * (0.73 / 0.8), radius * (0.095 / 0.8), 12, 36), material.solid);
      lip.position.z = z;
      body.add(lip);
    }
    addPipeRings(body, new THREE.LineCurve3(new THREE.Vector3(0, 0, length / 2), new THREE.Vector3(0, 0, -length / 2)), diameter, material.solid);
    group.add(body);
    return { rear, projectedLength: length * NOZZLE_HORIZONTAL };
  }

  function update(layout, width, height) {
    const resized = viewportWidth !== width || viewportHeight !== height;
    viewportWidth = width; viewportHeight = height;
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    characters.update(layout);
    const visible = new Set();
    for (const entry of layout) {
      const { side, diameter, frontPath, backPath, inlet } = entry;
      if (!materials[side] || !Number.isFinite(diameter) || diameter <= 0 || !inlet) continue;
      const key = [diameter, inlet.x, inlet.y, frontPath?.getAttribute('d'), backPath?.getAttribute('d')].join('|');
      visible.add(side);
      const existing = groups.get(side);
      if (!resized && existing?.key === key) continue;
      if (existing) { clear(existing.front); clear(existing.back); }
      const foreground = new THREE.Group(), background = new THREE.Group();
      front.add(foreground); back.add(background);
      const material = materials[side];
      const { rear, projectedLength } = nozzle(foreground, inlet, diameter, side, material);
      const points = pathPoints(frontPath, projectedLength);
      let distance = diameter * NOZZLE_LENGTH_RATIO;
      if (points.length) {
        // The barrel owns the first straight run; avoid a second tube inside it.
        points[0] = rear;
        distance += hose(foreground, points, diameter / 2, material, distance);
      }
      hose(background, pathPoints(backPath), diameter / 2, material, distance);
      groups.set(side, { key, front: foreground, back: background });
    }
    for (const [side, group] of groups) {
      if (visible.has(side)) continue;
      clear(group.front); clear(group.back); groups.delete(side);
    }
  }

  return {
    back, front, camera, update,
    step: characters.step, ship: characters.ship,
    dispose() {
      characters.dispose();
      for (const group of groups.values()) { clear(group.front); clear(group.back); }
      groups.clear();
      for (const material of Object.values(materials)) Object.values(material).forEach(value => value.dispose());
    },
  };
}
