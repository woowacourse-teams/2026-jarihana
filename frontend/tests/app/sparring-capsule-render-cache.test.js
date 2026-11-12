import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
import { CAPACITY } from '../../public/sparring-arena/src/physics.js';
import { AVATAR_BASIC_APPEARANCE } from '../../public/sparring-arena/src/avatar-appearance.js';

let mockPhysics, mockBatch;
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: () => mockBatch }));
jest.mock('../../public/sparring-arena/src/physics.js', () => ({
  ...jest.requireActual('../../public/sparring-arena/src/physics.js'),
  createCapsulePhysics: () => mockPhysics,
}));

const votes = { total: 2, a: 1, b: 1, ratio: 0.5 };
const posts = [
  { id: 'mint', name: '크루', side: 'a', memberType: 'CREW' },
  { id: 'coral', name: '코치', side: 'b', memberType: 'COACH' },
];

beforeEach(() => {
  mockBatch = { draw: jest.fn(), hide: jest.fn(), pick: jest.fn(() => 0) };
  mockPhysics = {
    entries: Array.from({ length: CAPACITY }, (_, index) => ({
      body: { position: { x: index, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
      post: null, fresh: false, revealed: true, landedAt: null,
    })),
    settle: jest.fn(), step: jest.fn(), stats: jest.fn(() => ({})),
    launch: jest.fn(post => Object.assign(mockPhysics.entries[0], { post, visualSide: post.side })),
    takeCollision: jest.fn(), shockwave: jest.fn(),
  };
});

function populated(onReady = jest.fn()) {
  const capsules = createCapsules({}, jest.fn(), onReady);
  capsules.updateState(posts.map(post => ({ ...post })), votes);
  expect(mockBatch.draw).toHaveBeenCalledTimes(CAPACITY);
  mockBatch.draw.mockClear();
  return capsules;
}

it('같은 위치·회전·표현 상태는 다시 그리지 않고 실제로 움직인 캡슐만 갱신한다', () => {
  const capsules = populated();
  capsules.step(1 / 60);
  capsules.step(1 / 60);
  expect(mockPhysics.step).toHaveBeenCalledTimes(2);
  expect(mockBatch.draw).not.toHaveBeenCalled();
  mockPhysics.entries[17].body.position.x += 0.1;
  mockPhysics.entries[89].body.quaternion.z = 0.2;
  capsules.step(1 / 60);
  expect(mockBatch.draw.mock.calls.map(([index]) => index)).toEqual([17, 89]);
  mockBatch.draw.mockClear();
  capsules.step(1 / 60);
  expect(mockBatch.draw).not.toHaveBeenCalled();
});

it('정지·모션 감소 중에도 편·캐릭터·크기 변경을 다음 그리기에 반영한다', () => {
  const capsules = populated();
  capsules.setPaused(true);
  const entry = mockPhysics.entries[0];
  entry.post = { ...entry.post };
  const changes = [
    () => { entry.post.id = 'replacement'; },
    () => { entry.post.name = '나'; },
    () => { entry.post.authorId = 42; },
    () => { entry.post.memberType = entry.post.memberType === 'CREW' ? 'COACH' : 'CREW'; },
    () => { entry.post.side = entry.post.side === 'a' ? 'b' : 'a'; },
    () => { entry.visualSide = entry.visualSide === 'a' ? 'b' : 'a'; },
    () => { entry.fresh = true; },
    () => { entry.revealed = false; },
    () => { entry.shellScale = 0.9; },
    () => { entry.characterYaw = 0.1; },
  ];
  for (const change of changes) {
    mockBatch.draw.mockClear();
    change(); capsules.step(1 / 60, true);
    expect(mockBatch.draw).toHaveBeenCalledTimes(1);
    expect(mockBatch.draw.mock.calls[0][0]).toBe(0);
  }
  expect(mockPhysics.step).not.toHaveBeenCalled();
});

it('착지한 새 캡슐을 갱신하면서 도착 콜백은 한 번만 호출한다', () => {
  const ready = jest.fn(), capsules = populated(ready);
  const entry = mockPhysics.entries[0];
  entry.post = { ...entry.post, name: '나' };
  Object.assign(entry, { fresh: true, revealed: false, landedAt: null });
  capsules.step(1 / 60);
  expect(ready).not.toHaveBeenCalled();
  mockBatch.draw.mockClear(); entry.landedAt = 1;
  capsules.step(1 / 60);
  expect(mockBatch.draw).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledWith(entry.post);
  mockBatch.draw.mockClear(); capsules.step(1 / 60);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(mockBatch.draw).not.toHaveBeenCalled();
});

it.each(['phase', 'characterPose', 'parts'])('동적 %s 표현은 캐시하지 않고 정적인 상태로 돌아올 때도 다시 그린다', key => {
  const capsules = populated(), entry = mockPhysics.entries[0];
  entry[key] = key === 'phase' ? 'rolling' : {};
  capsules.step(1 / 60); capsules.step(1 / 60);
  expect(mockBatch.draw).toHaveBeenCalledTimes(2);
  delete entry[key]; capsules.step(1 / 60);
  expect(mockBatch.draw).toHaveBeenCalledTimes(3);
  capsules.step(1 / 60);
  expect(mockBatch.draw).toHaveBeenCalledTimes(3);
});

it('빈 통은 한 번만 숨기고 투표가 생기면 전체 인스턴스를 다시 표시한다', () => {
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  const empty = { total: 0, a: 0, b: 0, ratio: 0.5 };
  capsules.updateState([], empty); capsules.step(1 / 60);
  expect(mockBatch.hide).toHaveBeenCalledTimes(CAPACITY);
  capsules.updateState(posts, votes);
  expect(mockBatch.draw).toHaveBeenCalledTimes(CAPACITY);
  capsules.updateState([], empty); capsules.updateState([], empty);
  expect(mockBatch.hide).toHaveBeenCalledTimes(CAPACITY * 2);
  mockBatch.draw.mockClear(); capsules.updateState(posts, votes);
  expect(mockBatch.draw).toHaveBeenCalledTimes(CAPACITY);
});

it('선택·꺼내기 제어 상태는 물리 진단 집계 없이 읽는다', () => {
  const capsules = createCapsules({}, jest.fn(), jest.fn());
  expect(capsules.controlState()).toEqual({ drawReady: false, queuedId: null, freshReady: false });
  capsules.updateState(posts, votes);
  expect(capsules.controlState()).toEqual({ drawReady: true, queuedId: null, freshReady: false });
  expect(capsules.pick({}, {}, {})).toBe(true);
  const chosen = mockPhysics.entries[0].post;
  expect(capsules.controlState()).toEqual({ drawReady: true, queuedId: chosen.id, freshReady: false });
  expect(capsules.takeForDraw()).toEqual({ post: chosen, fresh: false });
  expect(capsules.controlState()).toEqual({ drawReady: true, queuedId: null, freshReady: false });
  expect(mockPhysics.stats).not.toHaveBeenCalled();
});

it('편별 파이프 공급 목록은 메시지 갱신 때 바뀌고 대화 없는 편도 투표 캡슐을 공급한다', () => {
  const capsules = populated();
  expect(capsules.replayPipe()).toBe('a');
  expect(mockPhysics.launch.mock.lastCall[0].id).toBe('mint');
  expect(capsules.replayPipe()).toBe('b');
  expect(mockPhysics.launch.mock.lastCall[0].id).toBe('coral');
  capsules.updateState([{ ...posts[0], id: 'new-mint' }], votes);
  expect(capsules.replayPipe()).toBe('a');
  expect(mockPhysics.launch.mock.lastCall[0].id).toBe('new-mint');
  expect(capsules.replayPipe()).toBe('b');
  expect(mockPhysics.launch.mock.lastCall[0]).toMatchObject({ id: 'vote-b', side: 'b' });
});

it('양쪽 파이프가 한 후보 목록을 순환하고 통과 파이프를 합쳐 최대 24개만 그린다', () => {
  const capsules = populated();
  const candidates = Array.from({ length: CAPACITY }, () => ({ ...AVATAR_BASIC_APPEARANCE }));
  const displayed = new Map();
  mockBatch.draw.mockImplementation((index, _entry, _size, _opening, _burst, appearance) => {
    displayed.set(index, appearance);
  });
  const activeAvatars = () => [...displayed.values()].filter(Boolean);
  capsules.updateState(posts, votes, undefined, candidates);
  expect(activeAvatars()).toEqual(candidates.slice(0, 24));

  let recycled = 0;
  mockPhysics.launch.mockImplementation(post => Object.assign(mockPhysics.entries[recycled++ % CAPACITY], {
    post, visualSide: post.side,
  }));
  for (let i = 0; i < CAPACITY; i++) {
    expect(capsules.replayPipe()).toBe(i % 2 === 0 ? 'a' : 'b');
    capsules.step(0);
    expect(displayed.get(i)).toBe(candidates[(24 + i) % CAPACITY]);
    expect(activeAvatars()).toHaveLength(24);
  }
});

it('새 투표자 후보는 기존 캡슐의 색과 외형을 바꾸지 않고 다음 순환에 합류한다', () => {
  const capsules = populated();
  const existing = { ...AVATAR_BASIC_APPEARANCE, hair: 'curly' };
  const newcomer = { ...AVATAR_BASIC_APPEARANCE, hair: 'long' };
  const candidates = [existing];
  capsules.updateState(posts, votes, undefined, candidates);
  mockBatch.draw.mockClear();
  capsules.updateState(posts, votes, undefined, [existing, newcomer]);
  expect(mockBatch.draw).not.toHaveBeenCalled();
  for (const [side, appearance] of [['a', existing], ['b', newcomer]]) {
    expect(capsules.replayPipe()).toBe(side);
    capsules.step(0);
    expect(mockBatch.draw.mock.calls.findLast(([index]) => index === 0)[5]).toBe(appearance);
  }
});

it('장식 외형이 있어도 보낸 캡슐과 미끄럼틀에 넘길 글은 실제 작성자 외형을 사용한다', () => {
  const capsules = populated();
  const appearance = { ...AVATAR_BASIC_APPEARANCE, hair: 'parted' };
  const voter = { ...AVATAR_BASIC_APPEARANCE, hair: 'bob' };
  const actual = { ...posts[0], appearance };
  capsules.updateState([actual], votes, undefined, [voter]);
  mockPhysics.launch.mockImplementationOnce(post => Object.assign(mockPhysics.entries[0], {
    post, visualSide: post.side, fresh: true, revealed: false, landedAt: null,
  }));
  mockBatch.draw.mockClear();
  capsules.launch(actual);
  expect(mockBatch.draw.mock.calls.find(([index]) => index === 0)[5]).toBe(appearance);
  expect(capsules.pick({}, {}, {})).toBe(true);
  expect(capsules.takeForDraw()).toEqual({ post: actual, fresh: false });
});
