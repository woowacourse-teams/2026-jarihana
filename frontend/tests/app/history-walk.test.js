import { historyWalkPose, historyExitPose, EXIT_SECONDS, PACKED_SCALE, WALKOUT_SECONDS } from '../../public/sparring-arena/src/history-walk.js';

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

it.each(['a', 'b'])('퇴장 시작은 %s편의 보이던 위치와 크기를 유지하고 바깥쪽을 향해 돈다', side => {
  const origin = frame(WALKOUT_SECONDS, { side });
  const direction = side === 'a' ? -1 : 1;
  const destination = { ...origin.position, x: origin.position.x + direction * 12 };
  const start = historyExitPose({ origin, destination, elapsed: 0 });
  const turned = historyExitPose({ origin, destination, elapsed: 0.2 });
  expect(start.position).toEqual(origin.position);
  expect(start.yaw).toBe(origin.yaw);
  expect(start.pose.scale).toBe(origin.pose.scale);
  expect(turned.position).toEqual(origin.position);
  expect(Math.sin(turned.yaw)).toBeCloseTo(direction);
});

it('퇴장 보행은 다리를 번갈아 움직이며 축소하지 않고 화면 밖 목적지까지 이어진다', () => {
  const origin = frame(WALKOUT_SECONDS);
  const destination = { ...origin.position, x: -20 };
  const poses = Array.from({ length: 29 }, (_, index) => historyExitPose({ origin, destination, elapsed: index * 0.05 }));
  expect(poses.every(pose => pose.pose.scale === origin.pose.scale && pose.pose.shrink === 1)).toBe(true);
  expect(poses.some(pose => pose.pose.stride > 0.8)).toBe(true);
  expect(poses.some(pose => pose.pose.stride < -0.8)).toBe(true);
  expect(poses.every(pose => pose.position.y === origin.position.y && pose.position.z === origin.position.z)).toBe(true);
  expect(historyExitPose({ origin, destination, elapsed: EXIT_SECONDS }).position).toEqual(destination);
});

it('의자를 들고 걸어 나온 뒤 돌아서는 동안 앉고, 퇴장할 때 다시 일어난다', () => {
  expect(atPhase(1).pose).toMatchObject({ seated: 0, chairCarry: true });
  const sitting = atPhase(2.225);
  expect(sitting.pose.seated).toBeCloseTo(0.5);
  const seated = frame(WALKOUT_SECONDS);
  expect(seated.pose).toMatchObject({ seated: 1, chairCarry: true });
  const exit = elapsed => historyExitPose({ origin: seated, destination, elapsed });
  expect(exit(0).pose.seated).toBe(1);
  expect(exit(0.1).pose.seated).toBeCloseTo(0.5);
  expect(exit(0.2).pose).toMatchObject({ seated: 0, chairCarry: true });
  expect(frame(0, { reduced: true }).pose).toMatchObject({ seated: 1, chairCarry: true });
});
