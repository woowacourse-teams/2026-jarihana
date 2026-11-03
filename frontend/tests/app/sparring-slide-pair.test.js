import { createDispenserPhysics, SLIDE, TRAY } from '../../public/sparring-arena/src/dispenser-physics.js';
import * as THREE from 'three';
import { createDispenser } from '../../public/sparring-arena/src/dispenser.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: () => ({ draw() {}, hide() {} }) }));

it('굴러가는 잔상과 먼지, 곡선 반짝임을 표시하고 정리한다', () => {
  const scene = new THREE.Scene(), opened = jest.fn();
  const dispenser = createDispenser(scene, () => {}, { onOpened: opened });
  const effects = scene.getObjectByName('slide-effects');
  dispenser.startPair([{ post: { id: 'one', side: 'a' }, fresh: true }, { post: { id: 'two', side: 'b' }, fresh: true }]);
  dispenser.step(0.025);
  expect(effects.children.some(child => child.isMesh && child.visible)).toBe(true);
  const firstDust = effects.children.find(child => child.name === 'slide-rolling-dust' && child.visible).position.clone();
  for (let i = 0; i < 28; i++) dispenser.step(0.025);
  expect(effects.children.some(child => child.name === 'slide-rolling-dust' && child.visible && child.position.z > firstDust.z + 0.15)).toBe(true);
  let sawCurveSparkles = false;
  for (let i = 0; i < 500 && dispenser.outputs().every(entry => entry.landingElapsed === undefined); i++) {
    dispenser.step(0.025);
    sawCurveSparkles ||= effects.children.some(child => child.name === 'slide-curve-sparkles' && child.visible);
  }
  expect(sawCurveSparkles).toBe(true);
  expect(dispenser.outputs().some(entry => entry.landingElapsed === 0)).toBe(true);
  expect(opened).not.toHaveBeenCalled();
  for (let i = 0; i < 10; i++) dispenser.step(0.025);
  expect(opened).toHaveBeenCalled();
  expect(effects.children.some(child => child.name.startsWith('slide-opening-'))).toBe(false);
  dispenser.clearAll();
  expect(effects.children.every(child => !child.visible)).toBe(true);
});

it('일반 대화와 모션 감소 설정에서는 미끄럼틀 효과를 표시하지 않는다', () => {
  const scene = new THREE.Scene(), opened = jest.fn();
  const dispenser = createDispenser(scene, () => {}, { onOpened: opened });
  dispenser.start({ post: { id: 'normal', side: 'b' }, kind: 'history', fresh: false });
  for (let i = 0; i < 400 && !opened.mock.calls.length; i++) dispenser.step(0.025);
  expect(opened).toHaveBeenCalledTimes(1);
  expect(scene.getObjectByName('slide-effects').children.every(child => !child.visible)).toBe(true);
  dispenser.clearAll();
  dispenser.start({ post: { id: 'one', side: 'a' }, kind: 'history', fresh: false }, true);
  expect(opened).toHaveBeenCalledTimes(2);
  expect(scene.getObjectByName('slide-effects').children.every(child => !child.visible)).toBe(true);
});

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


it('구도를 바꿔도 미끄럼틀과 마당 테두리는 바닥에 붙고 같은 두께로 이어진다', () => {
  const scene = new THREE.Scene();
  const dispenser = createDispenser(scene, () => {}, { trayWidth: 4.4, edgeScale: 0.45 });
  const rails = scene.children.filter(mesh => mesh.geometry?.type === 'TubeGeometry');
  const floor = scene.children.find(mesh => mesh.geometry?.type === 'BufferGeometry');
  const floorBefore = [...floor.geometry.attributes.position.array];
  const meshCount = scene.children.length;
  expect(rails).toHaveLength(3);
  for (const [width, scale] of [[10, 1], [14, 1], [4.4, 0.45]]) {
    const disposed = jest.fn();
    floor.geometry.addEventListener('dispose', disposed);
    dispenser.setTrayWidth(width, scale);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(meshCount);
    for (const rail of rails) expect(rail.geometry.parameters.radius).toBeCloseTo(0.1 * scale);
    const positions = floor.geometry.attributes.position;
    const segments = positions.count / 2 - 1;
    for (let i = 0; i <= segments; i++) {
      for (let side = 0; side < 2; side++) {
        const edge = rails[side].geometry.parameters.path.getPoint(i / segments);
        expect(edge.x).toBeCloseTo(positions.getX(i * 2 + side));
        expect(edge.z).toBeCloseTo(positions.getZ(i * 2 + side));
        expect(edge.y - positions.getY(i * 2 + side)).toBeCloseTo(0.07 * scale);
        expect(edge.y - rails[side].geometry.parameters.radius).toBeLessThan(positions.getY(i * 2 + side));
      }
      if (i > 0) expect(positions.getZ(i * 2)).toBeGreaterThan(positions.getZ((i - 1) * 2));
    }
    expect(positions.getX(positions.count - 1)).toBeCloseTo(width / 2);
    expect(positions.getZ(positions.count - 1)).toBeCloseTo(TRAY.front);
    const front = rails[2].geometry.parameters.path;
    expect(front.v1.distanceTo(rails[0].geometry.parameters.path.getPoint(1))).toBeCloseTo(0);
    expect(front.v2.distanceTo(rails[1].geometry.parameters.path.getPoint(1))).toBeCloseTo(0);
  }
  expect([...floor.geometry.attributes.position.array]).toEqual(floorBefore);
});
