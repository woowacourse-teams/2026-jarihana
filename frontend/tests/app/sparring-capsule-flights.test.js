import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: () => ({ draw() {}, hide() {}, pick: () => 0 }) }));
const post = { id: 'one', side: 'a', name: '나', text: '새 한마디' };
it('새 한마디의 파이프 말풍선을 추적하고 수동 선택 큐와 분리한다', () => {
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const capsules = createCapsules({}, jest.fn(), jest.fn());
    capsules.updateState([post], { a: 1, b: 1, total: 2, ratio: 0.5 });
    capsules.launch(post, { reduced: true });
    expect(capsules.stats().queuedId).toBeNull();
    expect(capsules.presentation().tracking.map(entry => entry.post.id)).toEqual(['one']);
    capsules.setPaused(true);
    clock.mockReturnValue(4501);
    expect(capsules.presentation().tracking).toHaveLength(0);
  } finally { clock.mockRestore(); }
});

it.each(['나', '다른 참여자'])('지난 대화가 많아도 %s의 새 한마디는 발사 연출 뒤 다음 리플레이에 나온다', name => {
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const capsules = createCapsules({}, jest.fn(), jest.fn());
    const old = Array.from({ length: 100 }, (_, i) => ({ ...post, id: 'old-' + i }));
    const live = { ...post, id: 'live', name };
    const balance = { a: 1, b: 1, total: 2, ratio: 0.5 };
    capsules.updateState(old, balance);
    expect(capsules.takeHistorical().post).toEqual(old[0]);
    capsules.updateState([...old, live], balance);
    capsules.launch(live);
    expect(capsules.takeHistorical().post).toEqual(old[1]);
    clock.mockReturnValue(4501);
    expect(capsules.takeHistorical()).toEqual({ post: live, fresh: false });
    capsules.updateState([...old, live], balance);
    expect(capsules.takeHistorical().post).toEqual(old[2]);
    const remaining = Array.from({ length: 98 }, () => capsules.takeHistorical().post.id);
    expect(remaining.filter(id => id === live.id)).toHaveLength(1);
  } finally { clock.mockRestore(); }
});

it('연속으로 보낸 한마디도 각각 발사 연출이 끝나야 순서대로 재생한다', () => {
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const capsules = createCapsules({}, jest.fn(), jest.fn());
    const second = { ...post, id: 'second', side: 'b' };
    capsules.updateState([post, second], { a: 1, b: 1, total: 2, ratio: 0.5 });
    capsules.launch(post);
    clock.mockReturnValue(1000);
    capsules.launch(second);
    expect(capsules.takeHistorical()).toBeNull();
    clock.mockReturnValue(4501);
    expect(capsules.takeHistorical()).toEqual({ post, fresh: false });
    expect(capsules.takeHistorical()?.post.id).not.toBe(second.id);
    clock.mockReturnValue(5501);
    expect(capsules.takeHistorical()).toEqual({ post: second, fresh: false });
  } finally { clock.mockRestore(); }
});

it('대화가 없어도 투표한 양쪽 파이프에서 캡슐을 발사하고 가짜 대화는 만들지 않는다', () => {
  const onSelect = jest.fn(), onReady = jest.fn();
  const capsules = createCapsules({}, onSelect, onReady);
  capsules.updateState([], { a: 4, b: 5, total: 9, ratio: 4 / 9 });
  const sides = Array.from({ length: 12 }, () => capsules.replayPipe());
  expect(sides).toContain('a');
  expect(sides).toContain('b');
  expect(capsules.stats().pipeReplays).toBe(12);
  expect(capsules.takeHistorical()).toBeNull();
  expect(capsules.presentation().tracking).toEqual([]);
  expect(capsules.pick({}, {}, {})).toBe(false);
  capsules.step(0.05);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
});

it('한쪽에만 대화가 있어도 양쪽 투표 캡슐을 발사하고 실제 대화만 재생한다', () => {
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  capsules.updateState([post], { a: 4, b: 5, total: 9, ratio: 4 / 9 });
  const sides = Array.from({ length: 12 }, () => capsules.replayPipe());
  expect(sides).toContain('a');
  expect(sides).toContain('b');
  expect(capsules.takeHistorical()).toEqual({ post, fresh: false });
});

it.each(['a', 'b'])('투표가 한쪽뿐이면 대화가 없어도 %s 파이프에서만 나온다', side => {
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  capsules.updateState([], { a: side === 'a' ? 2 : 0, b: side === 'b' ? 2 : 0, total: 2, ratio: side === 'a' ? 1 : 0 });
  expect(Array.from({ length: 12 }, () => capsules.replayPipe())).toEqual(Array(12).fill(side));
});

it('투표가 없으면 발사하지 않고 첫 투표가 도착하면 대화 없이도 발사를 시작한다', () => {
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  capsules.updateState([], { a: 0, b: 0, total: 0, ratio: 0.5 });
  expect(capsules.replayPipe()).toBeNull();
  expect(capsules.stats().visibleCapsules).toBe(0);
  capsules.updateState([], { a: 1, b: 0, total: 1, ratio: 1 });
  expect(capsules.replayPipe()).toBe('a');
  expect(capsules.stats().visibleCapsules).toBeGreaterThan(0);
  capsules.updateState([post], { a: 0, b: 0, total: 0, ratio: 0.5 });
  expect(capsules.replayPipe()).toBeNull();
});
