import { createDispenserPhysics, SLIDE } from '../../public/sparring-arena/src/dispenser-physics.js';

it('두 캡슐이 함께 미끄럼틀을 내려온 뒤 기존 물리 흐름으로 돌아간다', () => {
  const physics = createDispenserPhysics();
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
