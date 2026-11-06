import { createReplayQueue } from '../../public/sparring-arena/src/replay-queue.js';

const posts = (start, length) => Array.from({ length }, (_, index) => ({ id: String(start + index), text: `글 ${start + index}` }));
const ids = (queue, count) => Array.from({ length: count }, () => queue.take()?.post.id);

it('지정한 새 글만 먼저 꺼내고 아직 도착하지 않았거나 없는 ID는 다른 순서를 소비하지 않는다', () => {
  const queue = createReplayQueue();
  const [first, mine, last] = posts(101, 3);
  queue.update([], { page: 1, posts: posts(1, 3) });
  queue.enqueue(first, 0, true); queue.enqueue(mine, Infinity, true); queue.enqueue(last, 0, true);
  expect(queue.take(true, mine.id)).toBeNull();
  expect(queue.take(false, 'missing')).toBeNull();
  queue.enqueue(mine, 0, true);
  expect(queue.take(true, mine.id)).toEqual({ post: mine, fresh: true });
  queue.enqueue(mine, 0, true);
  expect(queue.take(true, mine.id)).toBeNull();
  expect(ids(queue, 5)).toEqual([first.id, '1', last.id, '2', '3']);
});

it('최근 글 두 개와 과거 글 한 개를 섞고 최근 글이 없으면 남은 과거를 이어간다', () => {
  const queue = createReplayQueue();
  queue.update([]);
  queue.update(posts(101, 4), { page: 1, posts: posts(1, 5) });
  expect(ids(queue, 9)).toEqual(['101', '102', '1', '103', '104', '2', '3', '4', '5']);
  expect(queue.take()).toBeNull();
});

it('과거만 재생하다 새 글이 오면 최근 2:과거 1로 돌아가며 과거 위치를 보존한다', () => {
  const queue = createReplayQueue();
  queue.update([], { page: 1, posts: posts(1, 6) });
  expect(ids(queue, 2)).toEqual(['1', '2']);
  queue.update(posts(101, 3), { page: 1, posts: posts(1, 6) });
  expect(ids(queue, 6)).toEqual(['101', '102', '3', '103', '4', '5']);
});

it('최근 캐시 교체와 새 글이 계속 와도 과거 차례와 진행 위치를 지킨다', () => {
  const queue = createReplayQueue();
  queue.update([]);
  queue.update(posts(100, 2), { page: 1, posts: posts(1, 30) });
  const actual = [];
  for (let index = 0; index < 12; index++) {
    queue.update(posts(100 + index, 2), { page: 1, posts: posts(1, 30) });
    actual.push(queue.take().post.id);
  }
  expect(actual.filter(id => Number(id) < 100)).toEqual(['1', '2', '3', '4']);
});

it('과거가 두 개 남으면 다음 페이지를 한 번만 요청하고 앞 페이지의 나머지를 먼저 재생한다', () => {
  const request = jest.fn();
  const queue = createReplayQueue(request);
  queue.update([], { page: 0, posts: [] });
  queue.update([], { page: 0, posts: [] });
  expect(request.mock.calls).toEqual([[0]]);
  queue.update([], { page: 1, posts: posts(31, 30) });
  expect(ids(queue, 28)).toEqual(posts(31, 28).map(post => post.id));
  expect(request.mock.calls).toEqual([[0], [1]]);
  queue.update([], { page: 2, posts: posts(1, 30) });
  expect(queue.stats().historyPending).toBe(32);
  expect(ids(queue, 3)).toEqual(['59', '60', '1']);
  queue.update([], { page: 1, posts: posts(31, 30) });
  expect(queue.take().post.id).toBe('2');
});

it('입장 시 최근 30개도 새 글로 분류하지 않고 편별 최신순 과거 목록에서만 재생한다', () => {
  const queue = createReplayQueue(), initial = posts(60, 30);
  queue.update(initial, { page: 0, posts: [] });
  expect(queue.take()).toBeNull();
  const archive = [initial.at(-1), { id: '11', side: 'b' }, initial.at(-2), { id: '10', side: 'b' }];
  queue.update(initial, { page: 1, posts: archive });
  expect(queue.stats().recentPending).toBe(0);
  expect(ids(queue, 4)).toEqual(['89', '11', '88', '10']);
  expect(queue.take()).toBeNull();
});

it('늦은 과거 응답을 기다리는 동안 최근 글을 재생하고 응답이 오면 과거 차례를 먼저 준다', () => {
  const queue = createReplayQueue();
  queue.update([]);
  queue.update(posts(101, 6), { page: 0, posts: [] });
  expect(ids(queue, 4)).toEqual(['101', '102', '103', '104']);
  queue.update(posts(101, 6), { page: 1, posts: posts(1, 3) });
  expect(ids(queue, 4)).toEqual(['1', '105', '106', '2']);
});

it('일반 글과 받아치기가 함께 최근 차례를 사용하고 전송 중에는 과거를 보여준다', () => {
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const queue = createReplayQueue(), [first, second, third] = posts(101, 3);
    queue.update([]);
    queue.update([first, second, third], { page: 1, posts: posts(1, 6) });
    queue.enqueue(first, 4500);
    queue.enqueue(second, Infinity, true);
    queue.enqueue(third, 4500);
    expect(ids(queue, 2)).toEqual(['1', '2']);
    clock.mockReturnValue(4501);
    queue.enqueue(second, 0, true);
    expect(queue.take()).toEqual({ post: first, fresh: false });
    expect(queue.take()).toEqual({ post: second, fresh: true });
    expect(queue.take().post.id).toBe('3');
    expect(queue.take()).toEqual({ post: third, fresh: false });
    queue.enqueue(second, 0, true);
    expect(queue.take().post.id).toBe('4');
  } finally { clock.mockRestore(); }
});

it('재연결로 최근 목록이 겹쳐도 이미 재생한 글을 다시 최근 대기열에 넣지 않는다', () => {
  const queue = createReplayQueue();
  queue.update([]);
  queue.update(posts(101, 3), { page: 1, posts: posts(1, 4) });
  expect(ids(queue, 3)).toEqual(['101', '102', '1']);
  queue.update(posts(102, 3), { page: 1, posts: posts(1, 4) });
  expect(ids(queue, 3)).toEqual(['103', '104', '2']);
});

it('숨김 복귀는 밀린 충돌을 일반 리플레이로 바꾸고 모션 감소는 명시적 받아치기만 꺼낸다', () => {
  const queue = createReplayQueue(), [reply] = posts(101, 1);
  queue.update([], { page: 1, posts: posts(1, 4) });
  queue.enqueue(reply, 0, true);
  expect(queue.take(true)).toEqual({ post: reply, fresh: true });
  expect(queue.take(true)).toBeNull();
  queue.enqueue({ id: '102' }, Infinity, true);
  queue.settle();
  expect(queue.freshReady()).toBe(false);
  expect(queue.take()).toEqual({ post: { id: '102' }, fresh: false });
});

it('새 글은 한 번만 우선 재생하고 다음 과거 순환에 포함될 때 다시 재생한다', () => {
  const queue = createReplayQueue();
  queue.update(posts(1, 2), { page: 1, posts: posts(1, 2).reverse() });
  queue.update(posts(1, 3));
  expect(ids(queue, 3)).toEqual(['3', '2', '1']);
  queue.update(posts(1, 3));
  expect(queue.take()).toBeNull();
  queue.update(posts(1, 3), { page: 2, posts: posts(1, 3).reverse() });
  expect(ids(queue, 3)).toEqual(['3', '2', '1']);
});

it('다음 순환과 겹치는 전송 중 새 글 때문에 나머지 과거 대화가 멈추지 않는다', () => {
  const queue = createReplayQueue(), live = posts(101, 1)[0];
  queue.update([]);
  queue.enqueue(live, Infinity);
  queue.update([live], { page: 1, posts: [live, ...posts(1, 4).reverse()] });
  expect(ids(queue, 2)).toEqual(['4', '3']);
  queue.enqueue(live, 0);
  expect(ids(queue, 3)).toEqual(['101', '2', '1']);
  expect(queue.take()).toBeNull();
  queue.update([live], { page: 2, posts: [live] });
  expect(queue.take().post.id).toBe('101');
});

it('전송 중 새 글만 있는 짧은 토론에서는 과거 재조회가 무한 반복되지 않는다', () => {
  const request = jest.fn(), queue = createReplayQueue(request), live = posts(101, 1)[0];
  queue.update([], { page: 0, posts: [] });
  queue.enqueue(live, Infinity);
  queue.update([live], { page: 1, posts: [live] });
  for (let i = 0; i < 20; i++) expect(queue.take()).toBeNull();
  expect(request.mock.calls).toEqual([[0]]);
  queue.enqueue(live, 0);
  expect(queue.take().post.id).toBe('101');
  expect(request.mock.calls).toEqual([[0], [1]]);
});
