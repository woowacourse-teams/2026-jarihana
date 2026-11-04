import { createFrameClock } from '../../public/sparring-arena/src/frame-clock.js';

it.each([60, 90, 120, 144, 165, 240])('%iHz에서 주사율을 따르되 최대 120fps로 그리고 실제 경과 시간으로 움직인다', hz => {
  const clock = createFrameClock();
  clock.reset(0);
  const deltas = [];
  for (let frame = 0; frame < hz * 10; frame++) {
    const delta = clock.take(frame * 1000 / hz);
    if (delta) deltas.push(delta);
  }
  expect(deltas).toHaveLength(Math.min(hz, 120) * 10);
  expect(deltas.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(10, 1);
});

it.each([60, 120])('%iHz 콜백이 조금 일찍 오거나 늦어져도 프레임 간격을 누적해 불필요하게 절반으로 떨어지지 않는다', hz => {
  const clock = createFrameClock();
  clock.reset(0);
  let rendered = 0;
  for (let frame = 0; frame < 600; frame++) {
    if (clock.take(frame * 1000 / hz + (frame % 2 ? -0.2 : 0.2))) rendered++;
  }
  expect(rendered).toBe(600);
});

it('늦은 프레임을 몰아서 따라잡지 않고 복귀할 때 정지 시간을 물리에 전달하지 않는다', () => {
  const clock = createFrameClock();
  clock.reset(0);
  clock.take(0);
  expect(clock.take(4000)).toBe(0.05);
  expect(clock.take(4001)).toBe(0);
  clock.reset(8000);
  expect(clock.take(8000)).toBeCloseTo(1 / 120);
  expect(clock.take(8000)).toBe(0);
});
