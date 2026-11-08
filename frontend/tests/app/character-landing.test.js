import { LANDING_FALL_SECONDS, LANDING_SECONDS, landingDuration, releasedCharacterPose } from '../../public/sparring-arena/src/character-landing.js';

const frame = { phase: 'brawling', yaw: .6, position: { x: 2, y: -6.3, z: 10 },
  pose: { scale: .7, stride: .3, crouch: .1, leftArm: -.8, rightArm: -.4, chairVisible: true } };
const held = { position: { x: -1, y: -1, z: 8 }, landing: frame.position, scale: 2.4, originalScale: .7, angle: .2,
  time: 0, lastFrame: { yaw: 0, pose: { leftArm: .4, rightArm: -.9, hanging: true, airRun: 1,
    chairFlight: { progress: .6 }, cameraShake: { x: 4, y: 2 } } } };

it('놓은 위치에서 가속해 떨어지고 바닥에 철푸덕한 뒤 일어나 원래 활동으로 돌아간다', () => {
  const start = releasedCharacterPose(frame, held);
  expect(start.phase).toBe('landing');
  expect(start.position).toEqual(held.position);
  expect(start.pose.scale).toBe(held.scale);
  const early = releasedCharacterPose(frame, { ...held, time: LANDING_FALL_SECONDS * .25 });
  const late = releasedCharacterPose(frame, { ...held, time: LANDING_FALL_SECONDS * .75 });
  expect(held.position.y - early.position.y).toBeLessThan(early.position.y - late.position.y);
  const contact = releasedCharacterPose(frame, { ...held, time: LANDING_FALL_SECONDS });
  expect(contact.phase).toBe('splat');
  expect(contact.position.x).toBe(held.landing.x);
  expect(contact.position.y).toBeCloseTo(held.landing.y);
  expect(contact.position.z).toBe(held.landing.z);
  expect(contact.pose.scale).toBeCloseTo(.7);
  expect(contact.pose).toMatchObject({ fallPitch: 1.4, landingDust: 0, hanging: false, released: true });
  expect(contact.pose.lift).toBeGreaterThan(0);
  const rise = releasedCharacterPose(frame, { ...held, time: .85 });
  expect(rise.phase).toBe('recovering');
  expect(rise.pose.fallPitch).toBeGreaterThan(0);
  expect(rise.pose.fallPitch).toBeLessThan(contact.pose.fallPitch);
  expect(releasedCharacterPose(frame, { ...held, time: LANDING_SECONDS })).toBe(frame);
  expect(releasedCharacterPose(frame, { ...held, time: 10 })).toBe(frame);
});

it('충격 때만 먼지를 내고 투척·발버둥·카메라 충격은 이어받지 않는다', () => {
  for (const time of [0, .2, .34, .5, .8, 1.13]) {
    const result = releasedCharacterPose(frame, { ...held, time });
    expect(result.pose).toMatchObject({ hanging: false, chairVisible: false, chairCarry: false, speaking: false });
    for (const key of ['airRun', 'chairFlight', 'cameraShake']) expect(result.pose[key]).toBeUndefined();
    if (time >= .34 && time < .86) {
      expect(result.pose.landingDust).toBeGreaterThanOrEqual(0);
      expect(result.pose.landingDust).toBeLessThan(1);
    } else expect(result.pose.landingDust).toBeUndefined();
  }
});

it('일어나기 끝의 자세와 크기는 복귀 자세에 연속적으로 가까워지고 입력은 유지한다', () => {
  const before = JSON.stringify({ frame, held });
  const nearEnd = releasedCharacterPose(frame, { ...held, time: LANDING_SECONDS - .0001 });
  for (const key of ['stride', 'crouch', 'leftArm', 'rightArm']) expect(nearEnd.pose[key]).toBeCloseTo(frame.pose[key], 5);
  expect(nearEnd.pose.fallPitch).toBeCloseTo(0, 5);
  expect(nearEnd.pose.lift).toBeCloseTo(0, 5);
  expect(nearEnd.pose.scale).toBeCloseTo(held.originalScale);
  for (const time of [-1, NaN, 0, .17, .34, .54, 1.13]) {
    const result = releasedCharacterPose(frame, { ...held, time });
    expect(Object.values(result.position).every(Number.isFinite)).toBe(true);
    expect(Object.values(result.pose).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
  }
  expect(JSON.stringify({ frame, held })).toBe(before);
});

it.each([
  { x: 9, y: 5, z: -4 },
  { x: -7, y: -3, z: 6 },
])('던진 순간의 속도와 방향으로 출발하고 정해진 시간에 착지한다: %j', velocity => {
  const thrown = { ...held, flight: { duration: .55, velocity } };
  const start = releasedCharacterPose(frame, thrown);
  expect(start.position).toEqual(held.position);
  expect(start.pose.scale).toBe(held.scale);
  const dt = .000001;
  const next = releasedCharacterPose(frame, { ...thrown, time: dt });
  for (const axis of ['x', 'y', 'z']) {
    expect((next.position[axis] - start.position[axis]) / dt).toBeCloseTo(velocity[axis], 3);
  }
  expect(releasedCharacterPose(frame, { ...thrown, time: .54 }).phase).toBe('landing');
  const contact = releasedCharacterPose(frame, { ...thrown, time: .55 });
  expect(contact.phase).toBe('splat');
  expect(contact.position).toEqual(held.landing);
  expect(contact.pose).toMatchObject({ landingDust: 0, fallPitch: 1.4 });
});

it('비행 시간만 늘리고 철푸덕·먼지·일어나기 시간과 일반 내려놓기는 유지한다', () => {
  const thrown = { ...held, flight: { duration: .65, velocity: { x: 8, y: 4, z: -2 } } };
  expect(landingDuration(held)).toBe(LANDING_SECONDS);
  expect(landingDuration(thrown)).toBeCloseTo(1.45);
  const before = JSON.stringify(thrown);
  for (const contactTime of [0, .1, .21, .4, .51, .53, .79]) {
    const normal = releasedCharacterPose(frame, { ...held, time: LANDING_FALL_SECONDS + contactTime });
    const flight = releasedCharacterPose(frame, { ...thrown, time: thrown.flight.duration + contactTime });
    expect(flight.phase).toBe(normal.phase);
    expect(flight.position).toEqual(held.landing);
    for (const key of ['scale', 'fallPitch', 'leftArm', 'rightArm']) expect(flight.pose[key]).toBeCloseTo(normal.pose[key]);
    if (normal.pose.landingDust === undefined) expect(flight.pose.landingDust).toBeUndefined();
    else expect(flight.pose.landingDust).toBeCloseTo(normal.pose.landingDust);
  }
  for (const time of [-1, NaN, 0, .1, .3, .65, 1, 1.44]) {
    const result = releasedCharacterPose(frame, { ...thrown, time });
    expect(Object.values(result.position).every(Number.isFinite)).toBe(true);
    expect(Object.values(result.pose).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
  }
  expect(releasedCharacterPose(frame, { ...thrown, time: landingDuration(thrown) })).toBe(frame);
  expect(JSON.stringify(thrown)).toBe(before);
});
