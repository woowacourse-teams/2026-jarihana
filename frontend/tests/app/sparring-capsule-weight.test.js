import { createCapsulePhysics, nozzlePose, RADIUS, TANK } from '../../public/sparring-arena/src/physics.js';

it.each(['a', 'b'])('새 캡슐은 %s 파이프의 발사 속도를 유지하면서 빠르게 떨어지고 낮게 튕긴다', side => {
  const physics = createCapsulePhysics({ capacity: 1 });
  const capsule = physics.launch({ id: 'new', side }, { fresh: true, speed: 12 });
  expect(capsule.body.velocity.toArray()).toEqual(nozzlePose(side).launchDirection.map(value => value * 12));

  let landedAt = null, reboundHeight = 0;
  for (let frame = 1; frame <= 180; frame++) {
    physics.step(1 / 120);
    if (frame === 48) expect(capsule.body.position.y).toBeLessThan(1.2);
    if (capsule.landedAt !== null) {
      landedAt ??= frame / 120;
      reboundHeight = Math.max(reboundHeight, capsule.body.position.y - (TANK.bottom + RADIUS));
    }
  }
  expect(landedAt).not.toBeNull();
  expect(landedAt).toBeLessThan(0.9);
  expect(reboundHeight).toBeLessThan(RADIUS * 0.3);
  expect(physics.stats().finite).toBe(true);
});
