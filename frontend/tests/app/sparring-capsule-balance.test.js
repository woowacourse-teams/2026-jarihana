import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
import { CAPACITY, createCapsulePhysics, nozzlePose } from '../../public/sparring-arena/src/physics.js';

const mockDraw = jest.fn();
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({
  createCapsuleBatch: () => ({ draw: mockDraw, hide() {}, pick: () => null }),
}));

const votes = ratio => ({ a: ratio * 100, b: (1 - ratio) * 100, total: 100, ratio });
const create = ratio => {
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  capsules.updateState([], votes(ratio));
  return capsules;
};

beforeEach(() => mockDraw.mockClear());

it('투표가 바뀌어도 기존 캡슐과 방금 발사한 메시지의 색·위치·내용을 바꾸지 않는다', () => {
  const capsules = create(0.5);
  const post = { id: 'fresh', side: 'b', name: '나', text: '내 의견' };
  capsules.launch(post);
  const snapshot = () => mockDraw.mock.calls.slice(-CAPACITY).map(([, entry]) => ({
    side: entry.visualSide, post: entry.post, born: entry.born, position: entry.body.position.toArray(),
  }));
  const before = snapshot();
  capsules.updateState([post], votes(0.95));
  expect(capsules.stats().mintShare).toBe(0.95);
  expect(snapshot()).toEqual(before);
  expect(capsules.presentation().tracking[0]).toMatchObject({ post, visualSide: 'b' });
});

it.each([0.05, 0.95])('공급을 실제 %s 비율로 나누고 한 교체 주기 후 통이 그 비율에 도달한다', ratio => {
  const capsules = create(0.5);
  capsules.updateState([], votes(ratio));
  expect(capsules.stats().mintCapsules).toBe(CAPACITY / 2);
  const sides = [];
  for (let i = 0; i < CAPACITY; i++) {
    const before = capsules.stats().mintCapsules;
    sides.push(capsules.replayPipe());
    expect(Math.abs(capsules.stats().mintCapsules - before)).toBeLessThanOrEqual(1);
  }
  expect(sides.filter(side => side === 'a')).toHaveLength(CAPACITY * ratio);
  expect(sides.filter(side => side === 'b')).toHaveLength(CAPACITY - CAPACITY * ratio);
  expect(capsules.stats().mintCapsules).toBe(CAPACITY * ratio);
  expect(capsules.stats().coralCapsules).toBe(CAPACITY - CAPACITY * ratio);
  expect(capsules.stats().visibleCapsules).toBe(CAPACITY);
  expect(capsules.takeHistorical()).toBeNull();
});

it.each([0, 1])('현재 통에 없는 편도 투표 비율이 %s로 바뀌면 공급되어 하나씩 교체된다', ratio => {
  const capsules = create(1 - ratio);
  capsules.updateState([], votes(ratio));
  const side = ratio ? 'a' : 'b';
  expect(capsules.replayPipe()).toBe(side);
  expect(capsules.stats().mintCapsules).toBe(ratio ? 1 : CAPACITY - 1);
  for (let i = 1; i < CAPACITY; i++) expect(capsules.replayPipe()).toBe(side);
  expect(capsules.stats().mintCapsules).toBe(CAPACITY * ratio);
});

it('새 메시지 보호 시간을 지키고 색과 관계없이 가장 오래된 캡슐을 노즐에서 교체한다', () => {
  const physics = createCapsulePhysics({ capacity: 3 });
  const [protectedEntry, oldest, lowest] = physics.entries;
  Object.assign(protectedEntry, { born: -20, protectedUntil: 16, visualSide: 'a' });
  Object.assign(oldest, { born: -10, visualSide: 'b' });
  Object.assign(lowest, { born: -5, visualSide: 'a' });
  oldest.body.position.y = 0;
  lowest.body.position.y = -3;
  const post = { id: 'replacement', side: 'a', name: '', text: '' };
  expect(physics.launch(post, { skipProtected: true })).toBe(oldest);
  expect(oldest.visualSide).toBe('a');
  expect(oldest.body.position.toArray()).toEqual(nozzlePose('a').mouth);
  expect(protectedEntry.born).toBe(-20);
  expect(lowest.born).toBe(-5);
  physics.launch(post, { skipProtected: true });
  expect(physics.launch(post, { skipProtected: true })).toBeNull();
});
