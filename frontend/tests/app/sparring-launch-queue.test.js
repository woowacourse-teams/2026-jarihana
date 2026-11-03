import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
import { createCapsulePhysics } from '../../public/sparring-arena/src/physics.js';

jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({
  createCapsuleBatch: () => ({ draw() {}, hide() {} })
}));
jest.mock('../../public/sparring-arena/src/physics.js', () => ({
  CAPACITY: 2, RADIUS: 1, FRESH_CAPSULE_SCALE: 1, createCapsulePhysics: jest.fn()
}));

it('캡슐 자리가 부족하면 추가분을 버리지 않고 자리가 생길 때 순서대로 발사한다', () => {
  let available = 2;
  const launched = [];
  createCapsulePhysics.mockReturnValue({
    entries: [], settle() {}, step() {}, stats: () => ({}),
    launch(post) {
      if (!available) return null;
      available--;
      launched.push(post.id);
      return { post };
    }
  });
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  const posts = Array.from({ length: 1000 }, (_, i) => ({ id: String(i + 1), side: 'a' }));
  capsules.updateState(posts.slice(-30), { total: 2, a: 1, b: 1, ratio: 0.5 });
  for (const post of posts) capsules.launch(post);
  expect(launched).toEqual(['1', '2']);
  expect(capsules.stats().pendingLaunches).toBe(998);
  for (let i = 0; i < 499; i++) {
    available = 2;
    capsules.step(0.05);
  }
  expect(launched).toEqual(posts.map(post => post.id));
  expect(capsules.stats().pendingLaunches).toBe(0);
  expect(capsules.stats().pendingReplays).toBe(1000);
});


it('발사 대기 중 움직임 줄이기로 바뀌어도 대기 메시지를 처리한다', () => {
  const launched = [];
  createCapsulePhysics.mockReturnValue({
    entries: [], settle() {}, step() {}, stats: () => ({}),
    launch(post, { skipProtected }) {
      if (skipProtected) return null;
      launched.push(post.id);
      return { post };
    }
  });
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  capsules.launch({ id: '1', side: 'a' });
  expect(capsules.stats().pendingLaunches).toBe(1);
  capsules.step(0.05, true);
  expect(launched).toEqual(['1']);
  expect(capsules.stats().pendingLaunches).toBe(0);
});

it('내 메시지는 다음 빈자리에서 먼저 발사하고 나머지 메시지의 순서를 보존한다', () => {
  let available = 0;
  const launched = [];
  createCapsulePhysics.mockReturnValue({
    entries: [], settle() {}, step() {}, stats: () => ({}),
    launch(post) {
      if (!available) return null;
      available--;
      launched.push(post.id);
      return { post };
    }
  });
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  for (let i = 0; i < 1000; i++) capsules.launch({ id: String(i), side: 'a' });
  capsules.launch({ id: 'mine', side: 'a', mine: true });
  available = 1;
  capsules.step(0.05);
  expect(launched).toEqual(['mine']);
  available = 1000;
  capsules.step(0.05);
  expect(launched.slice(1)).toEqual(Array.from({ length: 1000 }, (_, i) => String(i)));
  expect(capsules.stats().pendingLaunches).toBe(0);
});
