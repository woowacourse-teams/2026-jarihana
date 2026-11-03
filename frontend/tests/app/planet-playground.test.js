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

it('놀이터 마당은 매끄러운 민트 바닥과 간결한 소품만 두고 중앙 동선을 비워 둔다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const group = scene.getObjectByName('planet-playground'), ground = group.getObjectByName('playground-planet');
  expect(ground.position.toArray()).toEqual([0, -8, 0]);
  expect(ground.scale.toArray()).toEqual([9.3, 1.2, 6.5]);
  const bounds = new THREE.Box3().setFromObject(ground), size = bounds.getSize(new THREE.Vector3());
  expect(bounds.max.y).toBeCloseTo(-6.8);
  expect(size.y / size.x).toBeCloseTo(1.2 / 9.3);
  expect(size.z / size.x).toBeCloseTo(6.5 / 9.3);
  expect(ground.material.roughness).toBe(0.94);
  expect(ground.material.envMapIntensity).toBe(0.04);
  expect(ground.geometry.attributes.surfaceShade).toBeUndefined();
  const point = new THREE.Vector3(), positions = ground.geometry.attributes.position;
  const radii = Array.from({ length: positions.count }, (_, index) => point.fromBufferAttribute(positions, index).length());
  expect(Math.min(...radii)).toBeGreaterThan(0.999999);
  expect(Math.max(...radii)).toBeLessThan(1.000001);
  const trees = [], pebbles = [];
  let batches = 0;
  group.traverse(object => {
    if (object.name === 'playground-tree-canopy') trees.push(object);
    if (object.name === 'playground-pebble') pebbles.push(object);
    if (object.isMesh) batches++;
  });
  expect(trees.map(tree => [tree.position.x, tree.position.z])).toEqual([[-7, 3.1], [7, 3.8]]);
  expect(pebbles).toHaveLength(2);
  const seesaw = group.getObjectByName('playground-seesaw');
  expect([seesaw.position.x, seesaw.position.z]).toEqual([-5.6, 4.1]);
  for (const name of ['playground-ringed-planet', 'playground-moon', 'playground-orbit-ring', 'playground-flag', 'playground-puffy-stars', 'playground-mint-satellite']) {
    expect(group.getObjectByName(name)).toBeUndefined();
  }
  expect(batches).toBeLessThanOrEqual(15);
  playground.dispose();
});

it('마당 위 지지대와 놀이터 소품은 기존 접지 높이를 유지한다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const group = scene.getObjectByName('planet-playground');
  const floor = (x, z) => -8 + 1.2 * Math.sqrt(Math.max(0, 1 - (x / 9.3) ** 2 - (z / 6.5) ** 2));
  group.traverse(object => {
    const { x, y, z } = object.position;
    if (object.name === 'playground-support' || object.name === 'playground-tree-trunk') {
      expect(y - object.scale.y / 2).toBeCloseTo(floor(x, z));
    }
    if (object.name === 'playground-pebble') {
      expect(y - object.scale.y).toBeLessThan(floor(x, z));
      expect(y + object.scale.y).toBeGreaterThan(floor(x, z));
    }
  });
  const seesaw = group.getObjectByName('playground-seesaw');
  expect(seesaw.position.y).toBeCloseTo(floor(seesaw.position.x, seesaw.position.z));
  playground.dispose();
});

it('시간대 콜백은 고정 낮 팔레트와 기존 기하 및 색 버퍼를 재사용한다', () => {
  const scene = new THREE.Scene(), playground = createPlanetPlayground(scene);
  const ground = scene.getObjectByName('playground-planet'), geometry = ground.geometry;
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
