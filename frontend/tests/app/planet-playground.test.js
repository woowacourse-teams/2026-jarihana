import * as THREE from '../../public/sparring-arena/vendor/three.module.js';
import { createPlanetPlayground } from '../../public/sparring-arena/src/planet-playground.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it('놀이터는 기존 조명을 유지하며 공유 자원을 한 번만 정리한다', () => {
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight(0xffffff, 2.3);
  scene.add(light);
  const playground = createPlanetPlayground(scene);
  const group = scene.getObjectByName('planet-playground');
  const geometries = new Set(), materials = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
    expect(object.castShadow).not.toBe(true);
  });
  const disposals = [...geometries, ...materials].map(resource => jest.spyOn(resource, 'dispose'));
  playground.setPeriod('night');
  playground.setPeriod('sunset');
  expect(light.intensity).toBe(2.3);
  expect(light.color.getHex()).toBe(0xffffff);
  playground.dispose(); playground.dispose();
  expect(scene.children).toEqual([light]);
  disposals.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
});

it('넓은 평면 마당은 중앙을 비워두고 낮은 코트 소품만 양옆에 둔다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const group = scene.getObjectByName('planet-playground'), ground = group.getObjectByName('playground-floor');
  const bounds = new THREE.Box3().setFromObject(ground), size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(-6.4);
  expect(bounds.max.y).toBeCloseTo(-6.4);
  expect(size.x).toBeGreaterThan(40);
  expect(size.z).toBeGreaterThan(30);
  expect(bounds.min.z).toBeLessThan(-5.5);
  expect(bounds.max.z).toBeGreaterThan(10);
  expect(ground.material.isMeshPhysicalMaterial).toBe(true);
  expect(ground.material.roughness).toBe(0.65);
  expect(ground.geometry.attributes.surfaceShade).toBeUndefined();
  const normals = ground.geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeCloseTo(1);
  const props = group.children.filter(object => ['playground-bench', 'playground-court-marker'].includes(object.name));
  expect(props.filter(object => object.name === 'playground-bench')).toHaveLength(2);
  expect(props.filter(object => object.name === 'playground-court-marker')).toHaveLength(3);
  for (const prop of props) {
    const bounds = new THREE.Box3().setFromObject(prop);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(0.9);
    expect(bounds.max.x < -4 || bounds.min.x > 4).toBe(true);
  }
  for (const name of ['playground-tree-trunk', 'playground-tree-canopy', 'playground-planet-sculpture-ring', 'playground-seesaw', 'playground-pebble']) {
    expect(group.getObjectByName(name)).toBeUndefined();
  }
  let batches = 0;
  group.traverse(object => { if (object.isMesh) batches++; });
  expect(batches).toBeLessThanOrEqual(18);
  playground.dispose();
});

it('통 다리와 코트 소품은 평평한 바닥에 접지한다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const group = scene.getObjectByName('planet-playground');
  const grounded = group.children.filter(object => ['playground-support', 'playground-bench', 'playground-court-marker'].includes(object.name));
  expect(grounded).toHaveLength(7);
  for (const object of grounded) {
    const bounds = new THREE.Box3().setFromObject(object);
    expect(bounds.min.y).toBeCloseTo(-6.4);
  }
  playground.dispose();
});

it('시간대 콜백은 고정 낮 팔레트와 기존 기하 및 색 버퍼를 재사용한다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const ground = scene.getObjectByName('playground-floor'), geometry = ground.geometry;
  const colors = geometry.attributes.color, dayColors = Array.from(colors.array), version = colors.version;
  const positions = Array.from(geometry.attributes.position.array), normals = Array.from(geometry.attributes.normal.array);
  for (const period of ['night', 'sunset', 'unknown', 'day']) playground.setPeriod(period);
  expect(ground.geometry).toBe(geometry);
  expect(geometry.attributes.color).toBe(colors);
  expect(Array.from(colors.array)).toEqual(dayColors);
  expect(colors.version).toBe(version);
  expect(Array.from(geometry.attributes.position.array)).toEqual(positions);
  expect(Array.from(geometry.attributes.normal.array)).toEqual(normals);
  playground.dispose();
  expect(() => playground.setPeriod('night')).not.toThrow();
});

it('마당 코트의 왼쪽은 코랄, 오른쪽은 민트이며 중앙을 가로질러 색이 섞이지 않는다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const { position, color } = scene.getObjectByName('playground-floor').geometry.attributes;
  const samples = [0, 0];
  for (let i = 0; i < position.count; i += 3) {
    const xs = [position.getX(i), position.getX(i + 1), position.getX(i + 2)];
    expect(Math.min(...xs) >= -1e-6 || Math.max(...xs) <= 1e-6).toBe(true);
    for (let vertex = i; vertex < i + 3; vertex++) {
      if (Math.abs(position.getX(vertex)) < 0.1) continue;
      if (position.getX(vertex) < 0) {
        expect(color.getX(vertex)).toBeGreaterThan(color.getY(vertex)); samples[0]++;
      } else {
        expect(color.getY(vertex)).toBeGreaterThan(color.getX(vertex)); samples[1]++;
      }
    }
  }
  expect(samples[0]).toBeGreaterThan(0); expect(samples[1]).toBeGreaterThan(0);
  playground.dispose();
});


it('경기장 선은 한 메시로 평평한 바닥에 붙고 위에서 보이는 면을 유지한다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const markings = scene.getObjectByName('playground-court-markings');
  const positions = markings.geometry.attributes.position;
  const normals = markings.geometry.attributes.normal;
  expect(markings.isMesh).toBe(true);
  expect(positions.count).toBeGreaterThan(0);
  expect(positions.count % 3).toBe(0);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    expect(Number.isFinite(x + y + z)).toBe(true);
    expect(Math.abs(x)).toBeLessThan(8.4);
    expect(Math.abs(z)).toBeLessThan(5.6);
    const floor = -6.4;
    expect(y - floor).toBeGreaterThan(0);
    expect(y - floor).toBeLessThan(0.02);
    expect(normals.getY(i)).toBeGreaterThan(0);
  }
  expect(markings.material.map).toBeNull();
  expect(markings.castShadow).toBe(false);
  playground.dispose();
});
