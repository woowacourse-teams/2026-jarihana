import { historyWalkPose, PACKED_SCALE, WALKOUT_SECONDS } from '../../public/sparring-arena/src/history-walk.js';

const origin = { x: 0.4, y: -6.1, z: 8.4, floorY: -6.3 };
const destination = { x: -3.5, y: -6.5, z: 10.1 };
const frame = (elapsed, extra = {}) => historyWalkPose({ origin, destination, elapsed, side: 'a', ...extra });
const atPhase = elapsed => frame(elapsed * WALKOUT_SECONDS / 2.4);

it('개봉 순간 내부 인물의 발과 크기를 이어받고 걷기 전에 몸을 편다', () => {
  expect(frame(0).position).toEqual({ x: origin.x, y: origin.y, z: origin.z });
  expect(frame(0).pose).toMatchObject({ scale: PACKED_SCALE, crouch: 0.45, leftArm: -0.95, rightArm: -0.95, head: 0.04 });
  expect(atPhase(0.5).position).toEqual({ x: origin.x, y: origin.floorY, z: origin.z });
  expect(atPhase(0.5).pose).toMatchObject({ scale: 0.65, crouch: 0, stride: 0 });
});

it('보행은 트레이 바닥을 따라 연속 이동하고 다리를 번갈아 내딛는다', () => {
  const a = atPhase(0.5 + 1.65 / 12), b = atPhase(0.5 + 1.65 / 4);
  expect(a.pose.stride).toBeCloseTo(1);
  expect(b.pose.stride).toBeCloseTo(-1);
  expect(b.position.x).toBeLessThan(a.position.x);
  expect(b.position.z).toBeGreaterThan(a.position.z);
  for (let t = 0.5; t < 2.15; t += 0.05) {
    const { position } = atPhase(t);
    const progress = (position.z - origin.z) / (destination.z - origin.z);
    expect(position.y).toBeCloseTo(origin.floorY + (destination.y - origin.floorY) * progress);
  }
});

it('도착한 뒤 상대편으로 돌아서고 모션 감소는 걸음과 몸짓을 생략한다', () => {
  expect(frame(WALKOUT_SECONDS).position).toEqual(destination);
  expect(frame(WALKOUT_SECONDS).yaw).toBeCloseTo(0.85);
  const reduced = frame(0, { reduced: true, speaking: true });
  expect(reduced.position).toEqual(destination);
  expect(reduced.pose).toMatchObject({ stride: 0, stepLift: 0, head: 0, speaking: false });
});


it('아담한 모드에서는 캡슐 속 크기 그대로 몸을 펴고 걷되 기본 모드에는 영향을 주지 않는다', () => {
  for (const elapsed of [0, 0.2, 0.5, 1, WALKOUT_SECONDS]) {
    const compact = frame(elapsed, { standingScale: PACKED_SCALE });
    expect(compact.pose.scale).toBe(PACKED_SCALE);
    expect(compact.position).toEqual(frame(elapsed).position);
    expect(compact.pose.stride).toEqual(frame(elapsed).pose.stride);
  }
  expect(frame(WALKOUT_SECONDS, { standingScale: PACKED_SCALE }).pose.crouch).toBe(0);
  expect(frame(WALKOUT_SECONDS).pose.scale).toBe(0.65);
});
