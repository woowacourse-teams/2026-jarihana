import * as THREE from 'three';
import { createComposerCharacters } from './composer-characters.js';
import { addPipeRings, createPipeSurfaces } from './pipe-surfaces.js';
import { createTransportGeometry, HOSE_RADIUS } from './transport-geometry.js';

const COLORS = { a: 0x2ac1bc, b: 0xed6a5a };

export function createTransportScene(environment) {
  const world = new THREE.Scene(), front = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  camera.position.z = 1000;
  for (const scene of [world, front]) {
    scene.environment = environment;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe5e7eb, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(-4, 10, 7); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xe9faff, 0.5);
    fill.position.set(5, 4, -5); scene.add(fill);
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
  function build(shape, material) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.position.copy(shape.mouth).add(shape.inletRear).multiplyScalar(0.5);
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), shape.inletDirection);
    const length = shape.mouth.distanceTo(shape.inletRear);
    const tubePath = new THREE.CurvePath();
    tubePath.add(new THREE.LineCurve3(shape.mouth, shape.inletRear));
    tubePath.add(shape.hose);
    for (const [radius, surface] of [[HOSE_RADIUS, material.wall], [0.65, material.inner]]) {
      group.add(new THREE.Mesh(new THREE.TubeGeometry(tubePath, 200, radius, 36, false), surface));
    }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.095, 12, 36), material.solid);
    lip.position.z = length / 2; body.add(lip);
    group.add(body);
    const end = shape.hose.getLength();
    addPipeRings(group, shape.hose, 1.6, material.solid, { start: shape.ringStart, spacing: shape.ringSpacing, offset: shape.ringOffset, end: end + shape.ringOffset });
    return group;
  }
  function update(layout, width, height, view) {
    viewportWidth = width; viewportHeight = height;
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    characters.update(layout);
    const visible = new Set();
    for (const entry of layout) {
      if (!view || !entry.outlet || !materials[entry.side]) continue;
      visible.add(entry.side);
      const key = JSON.stringify([entry.inlet, entry.outlet, entry.diameter, view.bounds, width, view.camera.projectionMatrix.elements, view.camera.matrixWorld.elements]);
      const previous = groups.get(entry.side);
      if (previous?.key === key) continue;
      if (previous) clear(previous.group);
      const shape = createTransportGeometry(entry, view.camera, view.bounds, width);
      const group = build(shape, materials[entry.side]);
      world.add(group);
      groups.set(entry.side, { key, group, shape, capsuleRatio: (entry.capsuleDiameter ?? entry.diameter * 0.8) / entry.diameter });
    }
    for (const [side, item] of groups) {
      if (visible.has(side)) continue;
      clear(item.group); groups.delete(side);
    }
  }
  return {
    world, front, camera, update,
    presentation: characters.presentation,
    setPresentation(view, bounds, active) {
      characters.setProjection(active ? (position, diameter) => {
        const p = position.clone().project(view);
        const right = new THREE.Vector3(diameter / 2, 0, 0).applyQuaternion(view.quaternion);
        const edge = position.clone().add(right).project(view);
        return { x: bounds.left + (p.x + 1) * bounds.width / 2,
          y: bounds.top + (1 - p.y) * bounds.height / 2, diameter: Math.abs(edge.x - p.x) * bounds.width };
      } : null);
    },
    step: characters.step,
    ship(request) {
      const item = groups.get(request.post.side);
      return characters.ship(item ? { ...request, route: item.shape.route,
        diameter: item.shape.inletDiameter * item.capsuleRatio, worldDiameter: HOSE_RADIUS * 2 * item.capsuleRatio } : request);
    },
    dispose() {
      characters.dispose();
      for (const item of groups.values()) clear(item.group);
      groups.clear();
      for (const material of Object.values(materials)) Object.values(material).forEach(value => value.dispose());
    },
  };
}
