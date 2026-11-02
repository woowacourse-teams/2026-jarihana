import { createCapsulePhysics, RADIUS, TANK } from '../../public/sparring-arena/src/physics.js';

function advance(physics, seconds) {
  for (let i = 0; i < seconds * 120; i++) physics.step(1 / 120);
}

it('충돌 주변 캡슐을 좌우로 밀고 쌓인 캡슐을 들어 올린다', () => {
  const physics = createCapsulePhysics({ capacity: 4 });
  physics.world.gravity.setZero();
  const [left, right, below, outside] = physics.entries;
  [[-2, 2.85, 0], [2, 2.85, 0], [0, 0.85, 0], [8.4, -2, 0]].forEach((position, index) => {
    physics.entries[index].body.position.set(...position);
  });
  const before = physics.entries.map(entry => [entry.post, entry.visualSide]);
  physics.shockwave({ x: 0, y: 2.85, z: 0 });
  advance(physics, 0.3);
  expect(left.body.position.x).toBeLessThan(-2.5);
  expect(right.body.position.x).toBeGreaterThan(2.5);
  expect(below.body.position.y).toBeGreaterThan(1.35);
  expect(outside.body.velocity.length()).toBe(0);
  expect(physics.entries.map(entry => [entry.post, entry.visualSide])).toEqual(before);
  expect(physics.stats().shockwaves).toBe(1);
});

it('막 발사되어 충돌 지점으로 날아오는 캡슐도 방향을 돌려 밀려난다', () => {
  const physics = createCapsulePhysics({ capacity: 2 });
  physics.world.gravity.setZero();
  const [left, right] = physics.entries;
  [left, right].forEach((entry, index) => {
    entry.body.position.set(index ? 2 : -2, 2.85, 0);
    entry.body.velocity.set(index ? -8 : 8, 0, 0);
    entry.fresh = true; entry.revealed = false; entry.born = physics.world.time;
  });
  physics.shockwave({ x: 0, y: 2.85, z: 0 });
  advance(physics, 0.2);
  expect(left.body.velocity.x).toBeLessThan(-5);
  expect(right.body.velocity.x).toBeGreaterThan(5);
  expect(physics.entries.every(entry => entry.fresh && !entry.revealed)).toBe(true);
});

it('가까운 캡슐부터 먼 캡슐 순서로 전파되고 거리에 따라 힘이 줄어든다', () => {
  const physics = createCapsulePhysics({ capacity: 3 });
  physics.world.gravity.setZero();
  const [near, middle, far] = physics.entries;
  [near, middle, far].forEach((entry, index) => entry.body.position.set([1, 4, 7][index], 1, 0));
  physics.shockwave({ x: 0, y: 1, z: 0 });
  expect(physics.entries.every(entry => entry.body.velocity.length() === 0)).toBe(true);
  advance(physics, 0.05);
  const nearKick = near.body.velocity.x;
  expect(nearKick).toBeGreaterThan(0);
  expect(middle.body.velocity.length()).toBe(0);
  expect(far.body.velocity.length()).toBe(0);
  advance(physics, 0.1);
  const middleKick = middle.body.velocity.x;
  expect(middleKick).toBeGreaterThan(0);
  expect(far.body.velocity.length()).toBe(0);
  advance(physics, 0.12);
  expect(far.body.velocity.x).toBeGreaterThan(0);
  expect(nearKick).toBeGreaterThan(middleKick);
  expect(middleKick).toBeGreaterThan(far.body.velocity.x);
});

it('파동이 도착할 때의 캡슐 위치에서 바깥 방향을 계산한다', () => {
  const physics = createCapsulePhysics({ capacity: 1 });
  physics.world.gravity.setZero();
  const { body } = physics.entries[0];
  body.position.set(-5, 1, 0);
  physics.shockwave({ x: 0, y: 1, z: 0 });
  body.position.set(1, 1, 0);
  advance(physics, 0.15);
  expect(body.velocity.x).toBeGreaterThan(0);
});

it('중앙이 아닌 충돌 지점을 따르고 전파 도중 재사용된 캡슐은 건너뛴다', () => {
  const physics = createCapsulePhysics({ capacity: 2 });
  physics.world.gravity.setZero();
  const [near, reused] = physics.entries;
  near.body.position.set(3, 1, 0);
  reused.body.position.set(-3, 1, 0);
  physics.shockwave({ x: 4, y: 1, z: 0 });
  reused.born = physics.world.time;
  advance(physics, 0.15);
  expect(near.body.velocity.x).toBeLessThan(0);
  near.body.position.set(3, 3, 0); near.body.velocity.setZero();
  advance(physics, 0.85);
  expect(near.body.velocity.length()).toBe(0);
  expect(reused.body.velocity.length()).toBe(0);
});

it('충돌 중심과 캡슐 중심이 겹쳐도 유효한 속도를 유지하고 잘못된 위치는 무시한다', () => {
  const physics = createCapsulePhysics({ capacity: 1 });
  physics.world.gravity.setZero();
  physics.entries[0].body.position.set(0, 1, 0);
  expect(physics.shockwave({ y: NaN })).toBe(0);
  physics.shockwave({ x: 0, y: 1, z: 0 });
  physics.step(1 / 120);
  expect(physics.entries[0].body.velocity.x).toBeLessThan(0);
  expect(physics.stats().finite).toBe(true);
});

it('실제처럼 가득 찬 통에서도 충돌 주변 캡슐들이 대조군보다 눈에 띄게 이동한다', () => {
  const baseline = createCapsulePhysics(), impact = createCapsulePhysics();
  baseline.settle(); impact.settle();
  const initial = impact.entries.map(({ body }) => body.position.clone());
  impact.shockwave({ x: 0, y: 2.85, z: 0.3 });
  for (let i = 0; i < 60; i++) { baseline.step(1 / 120); impact.step(1 / 120); }
  const displacement = impact.entries.map(({ body }, index) => ({
    x: Math.abs(body.position.x - baseline.entries[index].body.position.x),
    distance: body.position.distanceTo(baseline.entries[index].body.position),
    origin: initial[index],
  })).filter(({ origin }) => Math.abs(origin.x) < 5 && origin.y > -2);
  expect(displacement.filter(({ distance }) => distance > 0.5).length).toBeGreaterThan(10);
  expect(displacement.reduce((sum, { x }) => sum + x, 0) / displacement.length).toBeGreaterThan(0.15);
});

it('가득 찬 통에 반복 충격이 와도 캡슐 수와 벽 경계를 유지하고 다시 가라앉는다', () => {
  const physics = createCapsulePhysics();
  physics.settle();
  for (let i = 0; i < 3; i++) {
    physics.shockwave({ x: i - 1, y: 2.85, z: 0.3 });
    advance(physics, 0.15);
  }
  advance(physics, 5);
  expect(physics.stats()).toMatchObject({ physicalCapsules: 240, finite: true, shockwaves: 3 });
  for (const { body } of physics.entries) {
    expect(Math.abs(body.position.x)).toBeLessThan(TANK.width / 2 - RADIUS + 0.05);
    expect(Math.abs(body.position.z)).toBeLessThan(TANK.depth / 2 - RADIUS + 0.05);
    expect(body.position.y).toBeGreaterThan(TANK.bottom + RADIUS - 0.05);
    expect(body.position.y).toBeLessThan(TANK.rim - RADIUS + 0.05);
    expect(body.velocity.length()).toBeLessThan(1);
  }
  const averageSpeed = physics.entries.reduce((sum, { body }) => sum + body.velocity.length(), 0) / physics.entries.length;
  expect(averageSpeed).toBeLessThan(0.1);
});
