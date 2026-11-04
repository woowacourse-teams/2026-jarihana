import { CHAIR_BATTLE_SECONDS, chairBattlePose } from '../../public/sparring-arena/src/chair-battle-motion.js';

const sample = (time, index = 0, options = {}) => chairBattlePose({ time, index, ...options });
const finiteNumbers = value => Object.values(value).every(item => typeof item === 'number' ? Number.isFinite(item)
  : !item || typeof item !== 'object' || finiteNumbers(item));

it('앉아서 시작해 의자를 잡고 찌르기, 내리치기, 던지기를 한 번씩 이어간다', () => {
  expect(sample(0)).toMatchObject({ phase: 'seated', seated: 1, chair: { mode: 'seat' } });
  expect(sample(0.9)).toMatchObject({ phase: 'grab', chair: { mode: 'held' } });
  expect(sample(1.65)).toMatchObject({ phase: 'thrust', attacker: 0, chair: { mode: 'held' } });
  expect(sample(2.55, 1)).toMatchObject({ phase: 'slam', attacker: 1, chair: { mode: 'held' } });
  expect(sample(4.2)).toMatchObject({ phase: 'throw', chair: { mode: 'flight' } });
  expect(sample(5.8)).toMatchObject({ phase: 'settled', seated: 0, chair: { mode: 'flight' } });
});

it('찌르는 의자가 도착할 때만 상대가 맞고 내리치기는 몸을 낮춰 피한다', () => {
  expect(sample(1.64, 1).impact).toBe(0);
  expect(sample(1.65, 1).impact).toBe(1);
  expect(sample(1.65, 0).impact).toBe(0);
  expect(sample(1.77, 0).x).toBeGreaterThan(0);
  expect(sample(1.77, 1).x).toBeGreaterThan(0);
  expect(sample(2.9, 0).seated).toBeGreaterThan(0);
  expect(sample(2.9, 0).impact).toBe(0);
  expect(sample(2.55, 1).leftArm).toBeLessThan(-2.8);
  expect(sample(2.9, 1).leftArm).toBeGreaterThan(-1.1);
});

it('두 의자는 시차를 두고 포물선으로 날아가고 각 상대에게 도달했을 때 반응한다', () => {
  expect(sample(3.8, 0).chair.mode).toBe('flight');
  expect(sample(3.8, 1).chair.mode).toBe('held');
  const launch = sample(3.75, 0).chair;
  const midway = sample(4.125, 0).chair;
  const hit = sample(4.5, 0).chair;
  expect(midway.x).toBeGreaterThan(launch.x);
  expect(midway.x).toBeLessThan(hit.x);
  expect(midway.y).toBeLessThan(Math.min(launch.y, hit.y));
  expect(sample(4.49, 1).impact).toBe(0);
  expect(sample(4.5, 1).impact).toBe(1);
  expect(sample(4.5, 0).impact).toBe(0);
  expect(sample(4.75, 0).impact).toBe(1);
  expect(sample(5.1, 0).impact).toBe(0);
});

it('좌우와 발언 순서를 바꾸면 같은 동작이 거울처럼 반전된다', () => {
  for (let time = 0; time <= CHAIR_BATTLE_SECONDS; time += 0.075) {
    const left = sample(time, 0, { speaker: 1 });
    const right = sample(time, 1, { speaker: 0 });
    expect(right.phase).toBe(left.phase);
    expect(right.x).toBeCloseTo(-left.x);
    expect(right.y).toBeCloseTo(left.y);
    expect(right.lean).toBeCloseTo(-left.lean);
    expect(right.yaw).toBeCloseTo(-left.yaw);
    expect(right.seated).toBeCloseTo(left.seated);
    expect(right.chair.x).toBeCloseTo(-left.chair.x);
    expect(right.chair.y).toBeCloseTo(left.chair.y);
    expect(right.chair.roll).toBeCloseTo(-left.chair.roll);
    expect(right.impact).toBeCloseTo(left.impact);
  }
});

it.each([0, 1])('던진 의자는 떨어진 자리에 남고 인물은 다시 앉지 않는다: %s', index => {
  const options = { size: 180, distance: 200 };
  const beforeSettle = sample(5.3 - 0.00001, index, options);
  const settled = sample(5.3, index, options);
  const direction = index === 0 ? 1 : -1;
  expect(settled).toMatchObject({ phase: 'settled', attacker: null, y: 0, seated: 0,
    impact: 0, chair: { mode: 'flight', pitch: 0 } });
  expect(settled.x).toBeCloseTo(0);
  expect(direction * settled.chair.x).toBeGreaterThan(options.distance);
  expect(Math.sin(settled.chair.roll)).toBeCloseTo(direction);
  for (const key of ['x', 'y', 'roll']) expect(beforeSettle.chair[key]).toBeCloseTo(settled.chair[key], 2);
  for (const time of [5.8, 6.4, CHAIR_BATTLE_SECONDS, 20, 1000]) {
    expect(sample(time, index, options)).toEqual(settled);
  }
});

it.each([{ reduced: true }, { opposed: false }])('모션 감소와 같은 편 대화는 싸우지 않고 앉은 자세로 표시한다: %j', options => {
  for (const index of [0, 1]) for (const time of [0, 0.9, 1.65, 2.9, 4.5, 5.8, 8]) {
    expect(sample(time, index, options)).toMatchObject({ phase: 'settled', attacker: null, x: 0, y: 0,
      seated: 1, impact: 0, chair: { mode: 'seat', pitch: 0, roll: 0 } });
  }
});

it.each([[100, 132], [200, 180], [400, 166]])('거리 %s와 크기 %s에서 두 몸이 겹치지 않고 모든 자세값이 유한하다', (distance, size) => {
  for (let time = 0; time <= CHAIR_BATTLE_SECONDS; time += 0.025) {
    const left = sample(time, 0, { distance, size });
    const right = sample(time, 1, { distance, size });
    expect(finiteNumbers(left)).toBe(true);
    expect(finiteNumbers(right)).toBe(true);
    expect(distance + right.x - left.x).toBeGreaterThanOrEqual(Math.min(distance, size * 0.4));
  }
});

it('순서가 뒤섞인 샘플링도 같은 시각의 자세를 바꾸지 않는다', () => {
  const before = sample(4.15, 1);
  for (const time of [10, 0, 6.2, 2.8, 1.6]) sample(time, 0);
  expect(sample(4.15, 1)).toEqual(before);
});
