import { createDispenserPhysics, SLIDE } from '../../public/sparring-arena/src/dispenser-physics.js';
import * as THREE from 'three';
import { createDispenser } from '../../public/sparring-arena/src/dispenser.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: () => ({ draw() {}, hide() {} }) }));

it('받아치기 캡슐의 미끄럼틀 위치를 추적하고 열릴 때도 복귀 시간이 초기화되지 않는다', () => {
  const dispenser = createDispenser(new THREE.Scene(), () => {});
  const original = { id: 'original', side: 'b', replyTo: { id: 'older' } };
  const reply = { id: 'reply', side: 'a', mine: true, replyTo: original };
  dispenser.startPair([{ post: original, fresh: true }, { post: reply, fresh: true }]);
  const start = dispenser.presentation();
  expect(start).toMatchObject({ id: 'reply', mine: true, fresh: true, phase: 'slide', elapsed: 0 });
  for (let i = 0; i < 20; i++) dispenser.step(0.05);
  expect(dispenser.presentation().follow.z).toBeGreaterThan(start.follow.z);
  for (let i = 0; i < 16; i++) dispenser.step(0.05);
  expect(dispenser.presentation().elapsed).toBeCloseTo(dispenser.presentation().releaseAt);
  dispenser.clearAll();
  expect(dispenser.presentation()).toBeNull();
});

it.each([10, 4.4])('폭 %s의 마당에서도 두 캡슐이 함께 내려온 뒤 착지한다', trayWidth => {
  const physics = createDispenserPhysics({ trayWidth });
  const left = physics.reset(0), right = physics.reset(1);
  physics.positionPair([0, 1], 0);
  const initialZ = left.position.z;
  physics.positionPair([0, 1], 0.5);
  expect(left.position.z).toBeGreaterThan(initialZ);
  expect(Math.abs(left.position.x - right.position.x)).toBeLessThan(1);
  expect(Math.abs(left.position.z - right.position.z)).toBeLessThan(0.3);
  physics.positionPair([0, 1], 1);
  expect(left.position.z).toBeCloseTo(SLIDE.points.at(-1)[0]);
  physics.releasePair([0, 1]);
  expect(left.velocity.z).toBeGreaterThan(0);
  expect(right.velocity.z).toBeGreaterThan(0);
  for (let i = 0; i < 600 && !(physics.ready(0) && physics.ready(1)); i++) physics.step(1 / 120);
  expect(physics.ready(0)).toBe(true);
  expect(physics.ready(1)).toBe(true);
});

it('지난 대화 캡슐은 천천히 굴러도 실제 착지 충돌 후에 열린다', () => {
  const physics = createDispenserPhysics();
  const body = physics.reset(0, 5.2), start = body.position.z;
  expect(physics.ready(0)).toBe(false);
  for (let i = 0; i < 24; i++) physics.step(1 / 120);
  expect(body.position.z).toBeGreaterThan(start);
  expect(physics.ready(0)).toBe(false);
  for (let i = 0; i < 900 && !physics.ready(0); i++) physics.step(1 / 120);
  expect(physics.ready(0)).toBe(true);
  expect(physics.stats(0).impact.speed).toBeGreaterThan(2.2);
  expect(physics.stats(0).impact.z).toBeGreaterThan(5.5);
});


it('아담한 구도의 얇은 앞턱과 난간은 다른 구도로 전환하면 기존 두께로 복원된다', () => {
  const scene = new THREE.Scene();
  const dispenser = createDispenser(scene, () => {}, { trayWidth: 4.4, edgeScale: 0.45 });
  const edge = scene.children.find(mesh => mesh.geometry?.parameters?.height === 0.32);
  const rails = scene.children.filter(mesh => mesh.geometry?.type === 'TubeGeometry');
  const floor = scene.children.find(mesh => mesh.geometry?.attributes.position.count === 4);
  const floorBefore = [...floor.geometry.attributes.position.array];
  expect(edge.scale.y).toBe(0.45);
  for (const [width, scale] of [[10, 1], [14, 1], [4.4, 0.45]]) {
    dispenser.setTrayWidth(width, scale);
    expect(edge.scale.y).toBe(scale);
    expect(edge.scale.z).toBe(scale);
    for (const rail of rails) expect(rail.geometry.parameters.radius).toBeCloseTo(0.09 * scale);
  }
  expect([...floor.geometry.attributes.position.array]).toEqual(floorBefore);
});
