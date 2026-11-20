import { createCapsulePhysics } from '../../public/sparring-arena/src/physics.js';

const originalResolver = physics => Object.getPrototypeOf(physics.world.narrowphase).sphereBox;
const snapshot = physics => physics.entries.map(({ body, post, landedAt, born }) => [
  ...body.position.toArray(), ...body.quaternion.toArray(), ...body.velocity.toArray(),
  ...body.angularVelocity.toArray(), body.sleepState, post?.id, landedAt, born,
]);
const contacts = physics => physics.world.contacts.map(contact => [
  physics.world.bodies.indexOf(contact.bi), physics.world.bodies.indexOf(contact.bj),
  ...contact.ni.toArray(), ...contact.ri.toArray(), ...contact.rj.toArray(),
]);

it.each([19, 71])('240개 캡슐의 발사·착지·충격파 궤적과 접촉 순서가 기존 계산과 같다 (seed %i)', seed => {
  const baseline = createCapsulePhysics({ seed }), optimized = createCapsulePhysics({ seed });
  baseline.world.narrowphase.sphereBox = originalResolver(baseline);
  // Keep wall-clock catch-up limits out of the deterministic physics comparison.
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  try {
    for (let frame = 0; frame < 720; frame++) {
      for (const physics of [baseline, optimized]) {
        if (frame % 60 === 0) physics.launch({ id: String(frame), side: frame % 120 ? 'a' : 'b' }, { speed: 12, fresh: frame % 120 === 0 });
        if (frame === 300) physics.shockwave({ x: -2, y: -2, z: .3 });
        physics.step(1 / 120);
      }
      if (frame % 30 === 0 || frame === 719) {
        expect(snapshot(optimized)).toEqual(snapshot(baseline));
        expect(contacts(optimized)).toEqual(contacts(baseline));
        expect(optimized.takeCollision()).toEqual(baseline.takeCollision());
      }
    }
    expect(optimized.stats()).toEqual(baseline.stats());
  } finally { clock.mockRestore(); }
}, 30000);

it('먼 벽의 정밀 계산을 건너뛰어도 면·모서리·꼭짓점·접선 및 회전한 벽 접촉을 보존한다', () => {
  const physics = createCapsulePhysics({ capacity: 1 });
  const baseline = createCapsulePhysics({ capacity: 1 });
  baseline.world.narrowphase.sphereBox = originalResolver(baseline);
  const probe = (target, position, rotated) => {
    const sphere = target.entries[0].body, floor = target.world.bodies[0];
    const h = floor.shapes[0].halfExtents;
    floor.quaternion.setFromEuler(0, 0, rotated ? .4 : 0);
    sphere.position.set(h.x + position[0], floor.position.y + h.y + position[1], h.z + position[2]);
    const result = [];
    target.world.narrowphase.getContacts([sphere], [floor], target.world, result, [], [], []);
    return result.map(contact => [...contact.ni.toArray(), ...contact.ri.toArray(), ...contact.rj.toArray()]);
  };
  for (const rotated of [false, true]) {
    for (const position of [[-2, .49, -1], [0, .49, -1], [.2, .2, .2], [0, .5, 0], [0, .50000001, 0], [0, 5, 0]]) {
      expect(probe(physics, position, rotated)).toEqual(probe(baseline, position, rotated));
    }
  }
  const box = physics.world.bodies[0].shapes[0];
  const normals = jest.spyOn(box, 'getSideNormals');
  probe(physics, [0, 5, 0], false);
  expect(normals).not.toHaveBeenCalled();
  probe(physics, [-2, .49, -1], false);
  expect(normals).toHaveBeenCalledTimes(1);
  normals.mockRestore();
});
