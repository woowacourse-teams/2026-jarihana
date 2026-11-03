import { createReplayQueue } from '../../public/sparring-arena/src/replay-queue.js';

const posts = (start, length) => Array.from({ length }, (_, index) => ({ id: String(start + index), text: `글 ${start + index}` }));
const ids = (queue, count) => Array.from({ length: count }, () => queue.take()?.post.id);

it('최근 글 두 개와 과거 글 한 개를 섞고 최근 글이 없으면 남은 과거를 이어간다', () => {
  const queue = createReplayQueue();
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

it('첫 최근 목록과 겹치는 짧은 토론의 다음 순환은 첫 재생이 끝날 때까지 보존한다', () => {
  const request = jest.fn(), queue = createReplayQueue(request), items = posts(1, 30);
  queue.update(items, { page: 1, posts: items });
  expect(ids(queue, 30)).toEqual(items.map(post => post.id));
  expect(request).not.toHaveBeenCalled();
  expect(ids(queue, 3)).toEqual(['1', '2', '3']);
});

it('늦은 과거 응답을 기다리는 동안 최근 글을 재생하고 응답이 오면 과거 차례를 먼저 준다', () => {
  const queue = createReplayQueue();
  queue.update(posts(101, 6), { page: 0, posts: [] });
  expect(ids(queue, 4)).toEqual(['101', '102', '103', '104']);
  queue.update(posts(101, 6), { page: 1, posts: posts(1, 3) });
  expect(ids(queue, 4)).toEqual(['1', '105', '106', '2']);
});

it('일반 글과 받아치기가 함께 최근 차례를 사용하고 전송 중에는 과거를 보여준다', () => {
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const queue = createReplayQueue(), [first, second, third] = posts(101, 3);
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
