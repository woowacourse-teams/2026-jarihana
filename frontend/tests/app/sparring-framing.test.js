import * as THREE from 'three';
import { ARENA_VIEWS, createArenaCamera, fitArenaCamera, extendArenaViewport } from '../../public/sparring-arena/src/arena-framing.js';
import { TANK, nozzlePose } from '../../public/sparring-arena/src/physics.js';
import { createDispenserPhysics } from '../../public/sparring-arena/src/dispenser-physics.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

function bounds(camera) {
  const points = [];
  for (const x of [-9, 9]) for (const y of [-4.4, 4.4]) for (const z of [-2.2, 2.2]) {
    points.push(new THREE.Vector3(x, y, z).project(camera));
  }
  return { width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}

it.each([[1440, 700], [900, 550], [390, 270]])('참고 구도는 원본의 원근, 화면 점유율과 중심을 유지한다 (%i × %i)', (width, height) => {
  const camera = createArenaCamera('reference');
  fitArenaCamera(camera, 'reference', width, height, TANK);
  expect(camera.isPerspectiveCamera).toBe(true);
  expect(camera.position.toArray()).toEqual([0, -5.5, 19]);
  expect(camera.fov).toBe(48);
  const box = bounds(camera);
  expect((box.minY + box.maxY) / 2).toBeCloseTo(0.18, 10);
  expect(Math.max(box.width / (width <= 700 ? 1.8 : 1.6), (box.maxY - box.minY) / 1.4)).toBeCloseTo(1, 10);
  const front = new THREE.Vector3(1, -6.4, 10.8).project(camera);
  const back = new THREE.Vector3(1, -6.4, 5.1).project(camera);
  expect(front.x).toBeGreaterThan(back.x);
  expect(ARENA_VIEWS.reference.trayWidth).toBe(14);
});

it('기존 구도로 돌아오면 직교 투영과 데스크톱의 36px 위치 보정을 복원한다', () => {
  const camera = createArenaCamera('original');
  fitArenaCamera(camera, 'original', 1440, 700, TANK);
  expect(camera.isOrthographicCamera).toBe(true);
  expect(camera.position.toArray()).toEqual([0, 5, 24]);
  const box = bounds(camera);
  expect((box.minY + box.maxY) / 2).toBeCloseTo(0.24 - 72 / 700, 10);
  expect(Math.max(box.width / 1.6, (box.maxY - box.minY) / 1.32)).toBeCloseTo(1, 10);
  expect(ARENA_VIEWS.original.trayWidth).toBe(10);
});

it.each(['original', 'reference', 'compact'])('%s 구도는 좌우 여백까지 그려도 통 크기와 UI 좌표를 바꾸지 않는다', view => {
  const bounds = { left: 24, top: -32, width: 1377, height: 794 };
  const width = 1425, height = 848;
  const camera = createArenaCamera(view);
  fitArenaCamera(camera, view, bounds.width, bounds.height, TANK);
  const renderCamera = camera.clone();
  const viewport = extendArenaViewport(camera, renderCamera, bounds, width, height);
  expect(viewport.x).toBe(0);
  expect(viewport.width).toBe(width);
  for (const point of [new THREE.Vector3(-9, 4.4, 2.2), new THREE.Vector3(9, -4.4, 2.2), new THREE.Vector3(7, -6.52, 10.8)]) {
    const before = point.clone().project(camera), after = point.clone().project(renderCamera);
    expect((after.x + 1) * viewport.width / 2).toBeCloseTo(bounds.left + (before.x + 1) * bounds.width / 2, 8);
    expect(height - viewport.y - (after.y + 1) * viewport.height / 2).toBeCloseTo(bounds.top + (1 - before.y) * bounds.height / 2, 8);
  }
  // A point in either page gutter used to fall outside the arena's clip volume.
  for (const x of [-1.02, 1.02]) {
    const point = new THREE.Vector3(x, 0, 0.5).unproject(camera).project(renderCamera);
    expect(Math.abs(point.x)).toBeLessThan(1);
  }
});

it.each(['a', 'b'])('%s 참고 구도 파이프는 원본의 발사 방향을 따르고 기존 구도는 유지한다', side => {
  const sign = side === 'a' ? -1 : 1;
  const reference = nozzlePose(side, 'reference'), original = nozzlePose(side, 'original');
  expect(reference.direction).toEqual([-sign * 0.965, -0.15, 0.215]);
  expect(reference.direction).toEqual(reference.launchDirection);
  expect(original.direction).toEqual([-sign * 0.92, 0.08, 0.384]);
  expect(reference.mouth).toEqual(original.mouth);
  expect(reference.launchDirection).toEqual(original.launchDirection);
});

it.each(['original', 'reference', 'compact'])('%s 모바일 추적 중 상단까지 렌더해도 캡슐의 화면 좌표는 유지한다', view => {
  const bounds = { left: 16, top: 180, width: 358, height: 280 }, width = 390, height = 800;
  const camera = createArenaCamera(view);
  fitArenaCamera(camera, view, bounds.width, bounds.height, TANK);
  const render = camera.clone(), viewport = extendArenaViewport(camera, render, bounds, width, height, true);
  expect(viewport).toEqual({ x: 0, y: 0, width, height });
  const world = new THREE.Vector3(0, 1.5, 0.5).unproject(camera), before = world.clone().project(camera), after = world.clone().project(render);
  expect(after.y).toBeLessThan(1);
  expect((1 - after.y) * height / 2).toBeCloseTo(bounds.top + (1 - before.y) * bounds.height / 2, 8);
});

it('바닥 폭을 반복 전환해도 진행 중인 캡슐, 속도, 충돌 기록과 바디 수를 보존한다', () => {
  const physics = createDispenserPhysics();
  const capsule = physics.reset(0);
  for (let i = 0; i < 20; i++) physics.step(1 / 120);
  const position = capsule.position.clone(), velocity = capsule.velocity.clone();
  const stats = physics.stats(0), count = physics.world.bodies.length;
  const bumper = physics.world.bodies.find(body => body.mass === 0 && body.position.z === 10.8);
  for (const width of [14, 4.4, 10, 4.4, 14, 10]) {
    physics.setTrayWidth(width);
    expect(physics.bodies[0]).toBe(capsule);
    expect(capsule.position).toEqual(position);
    expect(capsule.velocity).toEqual(velocity);
    expect(physics.stats(0)).toEqual(stats);
    expect(physics.world.bodies).toHaveLength(count);
    expect(bumper.shapes[0].halfExtents.x).toBe(width / 2);
  }
  for (let i = 0; i < 400 && !physics.ready(0); i++) physics.step(1 / 120);
  expect(physics.ready(0)).toBe(true);
});


it.each([[1440, 700], [390, 270]])('아담한 구도는 통 크기와 카메라, 발사 방향을 참고 구도와 동일하게 유지한다 (%i × %i)', (width, height) => {
  const reference = createArenaCamera('reference'), compact = createArenaCamera('compact');
  fitArenaCamera(reference, 'reference', width, height, TANK);
  fitArenaCamera(compact, 'compact', width, height, TANK);
  expect(compact.position).toEqual(reference.position);
  expect(compact.quaternion.toArray()).toEqual(reference.quaternion.toArray());
  expect(compact.projectionMatrix).toEqual(reference.projectionMatrix);
  expect(ARENA_VIEWS.compact.trayWidth).toBeLessThan(ARENA_VIEWS.original.trayWidth);
  expect(ARENA_VIEWS.compact.trayWidth).toBeLessThan(ARENA_VIEWS.reference.trayWidth);
  for (const side of ['a', 'b']) expect(nozzlePose(side, 'compact')).toEqual(nozzlePose(side, 'reference'));
});


it.each([[1440, 700], [900, 550], [390, 270]])('아담한 마당은 원근 확대를 보정해 기존 구도의 화면 폭에 가깝게 보인다 (%i × %i)', (width, height) => {
  function projectedTrayWidth(view) {
    const camera = createArenaCamera(view);
    fitArenaCamera(camera, view, width, height, TANK);
    const half = ARENA_VIEWS[view].trayWidth / 2;
    const left = new THREE.Vector3(-half, -6.52, 10.8).project(camera);
    const right = new THREE.Vector3(half, -6.52, 10.8).project(camera);
    return right.x - left.x;
  }
  const ratio = projectedTrayWidth('compact') / projectedTrayWidth('original');
  expect(ratio).toBeGreaterThan(0.85);
  expect(ratio).toBeLessThan(1.2);
});
