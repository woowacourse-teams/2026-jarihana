import { CHEER_STYLES, createCheerAssignments, historyCheerPose } from '../../public/sparring-arena/src/history-cheer.js';
import { historyWalkPose } from '../../public/sparring-arena/src/history-walk.js';

const frame = historyWalkPose({ origin: { x: 0, y: 0, z: 0 }, destination: { x: -3, y: 0, z: 9 }, elapsed: 3, side: 'a' });
const assignment = style => ({ style, phase: 0.7, tempo: 1 });

it('여덟 인물에 모든 응원 동작을 섞고 각각 다른 박자와 속도를 배정한다', () => {
  const assigned = createCheerAssignments(8);
  expect(new Set(assigned.map(item => item.style))).toEqual(new Set(CHEER_STYLES));
  expect(new Set(assigned.map(item => item.phase)).size).toBe(8);
  expect(assigned.every(item => item.tempo >= 0.85 && item.tempo <= 1.15)).toBe(true);
});

it.each(CHEER_STYLES)('%s 동작은 유한한 자세이며 크기와 바닥 위치를 유지하고 원래 자세로 복귀한다', style => {
  for (let time = 0; time < 10; time += 0.1) {
    const next = historyCheerPose(frame, assignment(style), time, 1, 'a');
    expect(Object.values(next.pose).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
    expect(next.position.y).toBe(frame.position.y);
    expect(next.position.x).toBeLessThan(frame.position.x);
    expect(next.pose.scale).toBe(frame.pose.scale);
    expect(next.pose.lift).toBeGreaterThanOrEqual(0);
    expect(next.pose.lift).toBeLessThanOrEqual(0.42 * frame.pose.scale);
  }
  expect(historyCheerPose(frame, assignment(style), 5, 0, 'a')).toBe(frame);
  expect(historyCheerPose(frame, assignment(style), 5, 1, 'a', true)).toBe(frame);
});

it('의자 들어 올리기와 런지 손가락질은 팔과 손 모양을 구분한다', () => {
  const chair = historyCheerPose(frame, assignment('chair'), 1, 1, 'a').pose;
  const point = historyCheerPose(frame, assignment('point'), 1, 1, 'a').pose;
  expect(chair.chairLift).toBe(1);
  expect(chair.leftArm).toBeLessThan(-2.5);
  expect(point.chairLift).toBe(0);
  expect(point.lunge).toBeGreaterThan(0);
  expect(point.forwardLean).toBeGreaterThan(0.25);
  expect(point.rightGrip).toBe(1);
  expect(point.rightPoint).toBe(1);
});
