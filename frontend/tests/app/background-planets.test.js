import * as THREE from '../../public/sparring-arena/vendor/three.module.js';
import { createBackgroundPlanets } from '../../public/sparring-arena/src/background-planets.js';
import { TANK } from '../../public/sparring-arena/src/physics.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it('배경 행성은 통 뒤에만 놓이고 기존 조명과 전경에 그림자를 추가하지 않는다', () => {
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight(0xffffff, 2.3);
  scene.add(light);
  const group = createBackgroundPlanets(scene);
  expect(scene.children).toEqual([light, group]);
  expect(light.intensity).toBe(2.3);
  expect(group.children).toHaveLength(9);
  for (const mesh of group.children) {
    expect(new THREE.Box3().setFromObject(mesh).max.z).toBeLessThan(-TANK.depth / 2);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
  }
});

it('일곱 행성과 두 고리는 공유 기하를 쓰며 원래 장면 정리 경로로 해제할 수 있다', () => {
  const group = createBackgroundPlanets(new THREE.Scene());
  const planets = group.children.filter(mesh => mesh.geometry.type === 'SphereGeometry');
  const rings = group.children.filter(mesh => mesh.geometry.type === 'TorusGeometry');
  expect(planets).toHaveLength(7);
  expect(rings).toHaveLength(2);
  expect(rings[0].geometry).toBe(rings[1].geometry);
  const [first, second, third] = planets;
  expect(first.geometry).toBe(second.geometry);
  expect(second.geometry).toBe(third.geometry);
  expect(first.material).toBe(third.material);
  const positions = first.geometry.attributes.position;
  const point = new THREE.Vector3();
  let minimum = Infinity, maximum = 0;
  for (let i = 0; i < positions.count; i++) {
    const radius = point.fromBufferAttribute(positions, i).length();
    minimum = Math.min(minimum, radius); maximum = Math.max(maximum, radius);
  }
  expect(minimum).toBeCloseTo(1);
  expect(maximum).toBeGreaterThan(1.01);
  expect(maximum).toBeLessThan(1.02);
  const geometries = new Set(), materials = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  expect(geometries.size).toBe(2);
  expect(materials.size).toBe(3);
  for (const resource of [...geometries, ...materials]) resource.dispose();
});
