import { createCapsulePhysics } from '../../public/sparring-arena/src/physics.js';

it('충격파가 통의 기존 캡슐을 움직이고 아직 도착하지 않은 새 캡슐은 건드리지 않는다', () => {
  const physics = createCapsulePhysics({ capacity: 4 });
  const [near, fresh, outside] = physics.entries;
  near.body.position.set(0, 0, 0);
  fresh.body.position.set(1, 0, 0);
  outside.body.position.set(9, 0, 0);
  fresh.fresh = true; fresh.revealed = false; fresh.born = physics.world.time;
  for (const entry of physics.entries) entry.body.velocity.setZero();
  const before = physics.entries.map(entry => [entry.post, entry.visualSide]);

  expect(physics.shockwave()).toBeGreaterThan(0);
  physics.step(0.05);
  expect(near.body.velocity.y).toBeGreaterThan(0);
  expect(fresh.body.velocity.y).toBeLessThan(0);
  expect(outside.body.velocity.y).toBeLessThan(0);
  expect(physics.entries.map(entry => [entry.post, entry.visualSide])).toEqual(before);
  expect(physics.stats().shockwaves).toBe(1);
  expect(physics.entries.every(entry => Number.isFinite(entry.body.velocity.length()))).toBe(true);
});

it('밀집된 캡슐 더미가 충격에 올라간 뒤 중력으로 다시 내려온다', () => {
  const physics = createCapsulePhysics();
  physics.settle();
  const center = physics.entries.filter(entry => Math.abs(entry.body.position.x) < 4);
  const averageHeight = () => center.reduce((sum, entry) => sum + entry.body.position.y, 0) / center.length;
  const initial = averageHeight();
  physics.shockwave();
  let lifted = initial;
  for (let i = 0; i < 96; i++) { physics.step(1 / 120); lifted = Math.max(lifted, averageHeight()); }
  for (let i = 0; i < 120; i++) physics.step(1 / 120);
  expect(lifted).toBeGreaterThan(initial + 0.15);
  expect(averageHeight()).toBeLessThan(lifted);
});

it('충돌 중심부터 가까운 캡슐, 중간 캡슐, 먼 캡슐 순으로 약해지며 전파된다', () => {
  const physics = createCapsulePhysics({ capacity: 3 });
  physics.world.gravity.setZero();
  const [near, middle, far] = physics.entries;
  [near, middle, far].forEach((entry, index) => entry.body.position.set([1, 4, 7][index], 1, 0));
  physics.shockwave({ x: 0, y: 1, z: 0 });
  expect(physics.entries.every(entry => entry.body.velocity.length() === 0)).toBe(true);
  for (let i = 0; i < 3; i++) physics.step(0.05);
  expect(near.body.velocity.y).toBeGreaterThan(0);
  const nearKick = near.body.velocity.y;
  expect(middle.body.velocity.length()).toBe(0);
  expect(far.body.velocity.length()).toBe(0);
  for (let i = 0; i < 6; i++) physics.step(0.05);
  expect(middle.body.velocity.y).toBeGreaterThan(0);
  const middleKick = middle.body.velocity.y;
  expect(far.body.velocity.length()).toBe(0);
  for (let i = 0; i < 6; i++) physics.step(0.05);
  expect(far.body.velocity.y).toBeGreaterThan(0);
  expect(nearKick).toBeGreaterThan(middleKick);
  expect(middleKick).toBeGreaterThan(far.body.velocity.y);
});

it('중앙이 아닌 충돌 지점을 따르고 전파 도중 새 발사로 재사용된 캡슐은 건너뛴다', () => {
  const physics = createCapsulePhysics({ capacity: 2 });
  physics.world.gravity.setZero();
  const [near, reused] = physics.entries;
  near.body.position.set(3, 1, 0);
  reused.body.position.set(-3, 1, 0);
  physics.shockwave({ x: 4, y: 1, z: 0 });
  reused.born = physics.world.time;
  for (let i = 0; i < 3; i++) physics.step(0.05);
  expect(near.body.velocity.x).toBeLessThan(0);
  expect(near.body.velocity.y).toBeGreaterThan(0);
  for (let i = 0; i < 20; i++) physics.step(0.05);
  expect(reused.body.velocity.length()).toBe(0);
});
