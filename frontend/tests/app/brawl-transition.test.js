import { smoothBrawlFrame } from '../../public/sparring-arena/src/brawl-transition.js';

const ready = { position: { x: 0, y: 0, z: 0 }, yaw: 0, pose: { rightArm: 0, rightElbow: -1, scale: .65 } };
const strike = { position: { x: 3, y: 0, z: 2 }, yaw: 1, pose: { rightArm: -2.8, rightElbow: 0, scale: .7, chairVisible: true, time: 5 } };

it('공격과 회피가 바뀌어도 관절만 이어 움직이고 실제 위치·크기·도구 상태는 즉시 반영한다', () => {
  const next = smoothBrawlFrame(ready, strike, 1 / 60);
  expect(next.pose.rightArm).toBeLessThan(ready.pose.rightArm);
  expect(next.pose.rightArm).toBeGreaterThan(-.6);
  expect(next.pose.rightElbow).toBeLessThan(0);
  expect(next.position).toEqual(strike.position);
  expect(next.pose).toMatchObject({ scale: .7, chairVisible: true, time: 5 });
  expect(ready.pose.rightArm).toBe(0);
  expect(strike.pose.rightArm).toBe(-2.8);
});

it('30·60·120프레임에서 같은 시간이 지나면 같은 자세에 도달한다', () => {
  const results = [30, 60, 120].map(rate => {
    let frame = ready;
    for (let step = 0; step < rate / 2; step++) frame = smoothBrawlFrame(frame, strike, 1 / rate);
    return frame;
  });
  for (const result of results) {
    expect(result.pose.rightArm).toBeCloseTo(results[0].pose.rightArm, 10);
    expect(result.yaw).toBeCloseTo(results[0].yaw, 10);
    expect(Math.abs(result.pose.rightArm - strike.pose.rightArm)).toBeLessThan(.01);
  }
});

it('동일 시각의 재배치는 모션을 더 진행시키지 않고 첫 등장·동작 줄이기는 즉시 적용한다', () => {
  expect(smoothBrawlFrame(ready, strike, 0).pose.rightArm).toBe(ready.pose.rightArm);
  expect(smoothBrawlFrame(null, strike, 0)).toBe(strike);
  expect(smoothBrawlFrame(ready, strike, .01, true)).toBe(strike);
});

it('회전 각도의 경계를 넘을 때 한 바퀴 돌지 않고 가까운 방향으로 회전한다', () => {
  const previous = { ...ready, yaw: Math.PI - .02 }, target = { ...strike, yaw: -Math.PI + .02 };
  const next = smoothBrawlFrame(previous, target, 1 / 60);
  expect(next.yaw).toBeGreaterThan(previous.yaw);
  expect(next.yaw - previous.yaw).toBeLessThan(.02);
});
