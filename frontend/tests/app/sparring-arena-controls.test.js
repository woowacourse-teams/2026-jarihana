import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';
import { createCharacterDuel } from '../../public/sparring-arena/src/character-duel.js';
import { revealComposer } from '../../public/sparring-arena/src/composer.js';

it('편을 고르지 않았을 때 캐릭터 말풍선을 누르면 투표 안내를 보여준다', async () => {
  const first = { id: '1', side: 'a', authorId: 'crew', name: '크루', text: '기다리면 금방이야', createdAt: 1 };
  const second = { id: '2', side: 'b', authorId: 'coach', name: '코치', text: '점심시간이 더 소중해', createdAt: 2 };
  const state = { actorId: null, mySide: null, topic: { id: 'topic', title: '점심', a: '맛', b: '시간' },
    posts: [first, second], postCount: 2, connection: 'connected', balance: { total: 2, a: 1, b: 1, ratio: 0.5 }, more: { all: false, mine: false } };
  const store = { snapshot: () => state, subscribe: jest.fn(), reportHeight: jest.fn(), vote: jest.fn() };
  const base = path.join(__dirname, '../../public/sparring-arena');
  const html = readFileSync(path.join(base, 'index.html'), 'utf8');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const originalResizeObserver = global.ResizeObserver, originalScrollIntoView = Element.prototype.scrollIntoView;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {} }) });
  global.ResizeObserver = class { observe() {} disconnect() {} };
  Element.prototype.scrollIntoView = jest.fn();
  let cast;
  const createArena = (container, onSelect, onReveal, onReply) => {
    cast = createHistoryConversation(container.parentElement, onReply, onReveal, { draw() {}, hide() {}, project: point => point });
    cast.setLayout({ left: { x: 100, y: 200 }, right: { x: 300, y: 200 }, worldLeft: { x: -4.4, y: -6, z: 10 }, worldRight: { x: 4.4, y: -6, z: 10 }, width: 400 });
    return { updateState() {}, dispose() {} };
  };
  try {
    const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', 'revealComposer', source)(jest.fn(), jest.fn(), createArena, async () => store, revealComposer);
    cast.emerge(first, { x: 0, y: -6, z: 9 }, true);
    const bubble = document.querySelector('.history-conversation-speech[data-side="a"]');
    bubble.click();
    expect(store.vote).not.toHaveBeenCalled();
    expect(document.querySelector('#post-text')).toHaveTextContent(first.text);
    expect(document.querySelector('#seat-instruction')).toHaveTextContent('받아치려면 먼저 내 편을 골라주세요');
    expect(document.querySelector('#reply-target')).not.toBeVisible();
    expect(bubble).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_reply_start');
    expect(bubble).not.toHaveAttribute('aria-pressed');
    expect(document.querySelector('.vote-option')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_vote');
  } finally {
    cast?.dispose(); document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', originalMatchMedia); global.ResizeObserver = originalResizeObserver; Element.prototype.scrollIntoView = originalScrollIntoView;
  }
});

it('지난 대화와 대치 말풍선은 각각 누른 실제 의견을 받아치기 대상으로 고른다', async () => {
  const first = { id: '1', side: 'a', authorId: 'crew', name: '가온', text: '먼저 한 의견', createdAt: 1 };
  const second = { id: '2', side: 'b', authorId: 'coach', name: '하나', text: '반대편 의견', createdAt: 2, replyToId: '1', replyTo: first };
  const state = { actorId: 'me', mySide: 'a', topic: { id: 'topic', title: '점심', a: '맛', b: '시간' },
    posts: [second], postCount: 1, connection: 'live', balance: { total: 1, a: 1, b: 0, ratio: 1 }, more: { all: false, mine: false } };
  const store = { snapshot: () => state, subscribe: jest.fn(), reportHeight: jest.fn(), reveal: jest.fn(), post: jest.fn(async () => second) };
  const base = path.join(__dirname, '../../public/sparring-arena');
  document.body.innerHTML = readFileSync(path.join(base, 'index.html'), 'utf8').match(/<body>([\s\S]*)<\/body>/)[1];
  const media = Object.getOwnPropertyDescriptor(window, 'matchMedia'), observer = global.ResizeObserver, scroll = Element.prototype.scrollIntoView;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {} }) });
  global.ResizeObserver = class { observe() {} disconnect() {} }; Element.prototype.scrollIntoView = jest.fn();
  let history, duel;
  const createArena = (container, onSelect, onReveal, onReply) => {
    const stage = container.parentElement;
    history = createHistoryConversation(stage, onReply, onReveal, { draw() {}, hide() {}, project: point => point });
    history.setLayout({ left: { x: 100, y: 200 }, right: { x: 300, y: 200 }, worldLeft: { x: -4, y: -6, z: 10 }, worldRight: { x: 4, y: -6, z: 10 }, width: 400 });
    duel = createCharacterDuel(stage, onReply, onReveal);
    return { updateState() {}, launch() {}, dispose() {} };
  };
  try {
    const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', 'revealComposer', source)(jest.fn(), jest.fn(), createArena, async () => store, revealComposer);
    history.emerge(second, { x: 0, y: -6, z: 9 }, true);
    const historyBubble = document.querySelector('.history-conversation-speech[data-side="b"]');
    historyBubble.click();
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(second.text);
    expect(document.querySelector('#reply-target')).toHaveTextContent('받아치기 선택됨');
    expect(historyBubble).toHaveAttribute('data-reply-selected', 'true');
    expect(document.querySelector('#message')).toHaveFocus();
    expect(document.querySelector('#send-label')).toHaveTextContent('받아치기');
    duel.updateState([second]);
    duel.prepare(second, true, true).forEach(({ role }) => duel.emerge(role, { x: 100, y: 200 }, true));
    const duelBubble = document.querySelector('.left .duel-speech');
    duelBubble.click();
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(first.text);
    expect(duelBubble).toHaveAttribute('data-reply-selected', 'true');
    expect(historyBubble).toHaveAttribute('data-reply-selected', 'false');
    document.querySelector('#message').value = '내 반박';
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(store.post).toHaveBeenCalledWith('topic', expect.objectContaining({ text: '내 반박', replyToId: first.id }));
    await Promise.resolve(); await Promise.resolve();
  } finally {
    history?.dispose(); duel?.dispose(); document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', media); global.ResizeObserver = observer; Element.prototype.scrollIntoView = scroll;
  }
});

async function setupVoting() {
  const state = { actorId: '1', mySide: null, topic: { id: '1', title: '점심', a: '맛', b: '시간' }, posts: [], postCount: 0,
    connection: 'live', balance: { total: 0, a: 0, b: 0, ratio: 0.5 }, more: { all: false, mine: false } };
  const store = { snapshot: () => state, subscribe: jest.fn(), reportHeight: jest.fn(), vote: jest.fn() };
  const base = path.join(__dirname, '../../public/sparring-arena');
  document.body.innerHTML = readFileSync(path.join(base, 'index.html'), 'utf8').match(/<body>([\s\S]*)<\/body>/)[1];
  const media = Object.getOwnPropertyDescriptor(window, 'matchMedia'), observer = global.ResizeObserver;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {} }) });
  global.ResizeObserver = class { observe() {} disconnect() {} };
  const arena = { updateState: jest.fn(), chooseSide: jest.fn(), launch: jest.fn(), dispose() {} };
  const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', 'revealComposer', source)(jest.fn(), jest.fn(), () => arena, async () => store, revealComposer);
  return { state, store, arena, cleanup() { document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', media); global.ResizeObserver = observer; } };
}

it.each(['vote-flag', 'pipe-meter', 'composer-avatar'])('%s에서 첫 편을 선택하면 저장 후 입력창과 파이프가 활성화된다', async (target) => {
  const { state, store, arena, cleanup } = await setupVoting();
  let finish;
  store.vote.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  try {
    const button = document.querySelector('.' + target + '[data-side="b"]'), input = document.querySelector('#message-b');
    expect(input).toBeDisabled();
    button.click();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('.vote-flag[data-side="b"]')).toHaveTextContent('선택 중');
    expect(input).toBeDisabled();
    state.mySide = 'b'; finish();
    await Promise.resolve(); await Promise.resolve();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(input).toBeEnabled();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-composer-side="b"]')).toHaveAttribute('data-expanded', 'true');
    if (target === 'composer-avatar') expect(input).toHaveFocus();
    expect(document.querySelector('#composer')).toHaveAttribute('data-side', 'b');
    expect(arena.chooseSide).toHaveBeenCalledWith('b');
    input.value = '한마디'; input.dispatchEvent(new Event('input'));
    expect(document.querySelector('#send-b')).toBeEnabled();
  } finally { cleanup(); }
});

it('입력창에서 편을 바꿔도 작성 중인 글과 기존 메시지의 편을 유지한다', async () => {
  const { state, store, cleanup } = await setupVoting();
  const oldPost = { id: 'old', side: 'a', authorId: '1', name: '나', text: '먼저 보낸 말', createdAt: 1 };
  state.mySide = 'a'; state.posts.push(oldPost); state.postCount = 1;
  store.subscribe.mock.calls[0][0]([]);
  let finish;
  store.vote.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  try {
    const input = document.querySelector('#message');
    const mint = document.querySelector('.composer-avatar[data-side="a"]');
    const coral = document.querySelector('.composer-avatar[data-side="b"]');
    expect(mint).toHaveAccessibleName('맛 · 캐릭터를 눌러 한마디 쓰기');
    expect(coral).toHaveAccessibleName('시간 · 캐릭터를 눌러 한마디 쓰기');
    mint.click();
    expect(mint).toHaveAttribute('aria-pressed', 'true');
    expect(coral).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_vote');
    input.focus(); input.value = '작성 중인 한마디'; input.dispatchEvent(new Event('input'));
    coral.click();
    expect(input).toHaveFocus(); expect(input).toHaveValue('작성 중인 한마디');
    expect(mint).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('#send')).toBeDisabled();
    expect(store.vote).toHaveBeenCalledWith('1', '1', '', 'b');
    state.mySide = 'b'; finish(); await Promise.resolve(); await Promise.resolve();
    expect(coral).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('#composer')).toHaveAttribute('data-side', 'b');
    expect(document.querySelector('#send-b')).toBeEnabled();
    expect(document.querySelector('#message-b')).toHaveFocus();
    expect(document.querySelector('#message-b')).toHaveValue('작성 중인 한마디');
    expect(oldPost.side).toBe('a');
  } finally { cleanup(); }
});

it('입력창에서 편 변경에 실패하면 기존 선택과 작성 중인 글을 유지한다', async () => {
  const { state, store, cleanup } = await setupVoting();
  state.mySide = 'a'; store.subscribe.mock.calls[0][0]([]);
  document.querySelector('.composer-avatar[data-side="a"]').click();
  store.vote.mockRejectedValueOnce(new Error('다시 시도해 주세요'));
  try {
    const input = document.querySelector('#message');
    input.focus(); input.value = '작성 중'; input.dispatchEvent(new Event('input'));
    document.querySelector('.composer-avatar[data-side="b"]').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.composer-avatar[data-side="a"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('#composer-note')).toHaveTextContent('다시 시도해 주세요');
    expect(input).toHaveFocus(); expect(input).toHaveValue('작성 중');
  } finally { cleanup(); }
});

it('투표 실패는 주장 옆에도 알리고 다시 선택할 수 있다', async () => {
  const { state, store, cleanup } = await setupVoting();
  store.vote.mockRejectedValueOnce(new Error('연결을 확인하고 다시 골라주세요.'));
  try {
    const button = document.querySelector('.vote-option[data-side="a"]');
    button.click(); await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('#seat-instruction')).toHaveTextContent('연결을 확인하고 다시 골라주세요.');
    expect(document.querySelector('#seat-instruction')).toHaveAttribute('role', 'status');
    expect(button).toBeEnabled();
    expect(document.querySelector('#message')).toBeDisabled();
    store.vote.mockImplementation(async () => { state.mySide = 'a'; });
    button.click(); await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('#seat-instruction')).toBeEmptyDOMElement();
    expect(document.querySelector('#message')).toBeEnabled();
  } finally { cleanup(); }
});

it.each(['complete', 'cancel'])('파이프 전달이 %s 되기 전에도 다음 입력과 편 선택을 막지 않는다', async completion => {
  const { state, store, arena, cleanup } = await setupVoting();
  const post = { id: '1', side: 'a', authorId: '1', name: '나', text: '보내는 말', createdAt: 1 };
  let finish, fail;
  const delivered = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  arena.launch.mockReturnValue(delivered);
  store.reveal = jest.fn();
  store.post = jest.fn(async () => { state.posts.push(post); state.postCount = 1; return post; });
  state.mySide = 'a'; store.subscribe.mock.calls[0][0]([]);
  document.querySelector('.composer-avatar[data-side="a"]').click();
  try {
    const input = document.querySelector('#message'), otherSide = document.querySelector('.vote-flag[data-side="b"]');
    input.value = post.text;
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(arena.launch).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), expect.any(Function));
    expect(input).toBeEnabled();
    expect(otherSide).toBeEnabled();
    if (completion === 'complete') finish(); else fail(new Error('canceled'));
    await Promise.resolve(); await Promise.resolve();
    expect(otherSide).toBeEnabled();
    expect(input).toBeEnabled();
  } finally { cleanup(); }
});

it.each([390, 1200])('%ipx에서 전송 중과 전송 후 입력창 포커스를 유지해 연속 작성한다', async width => {
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const { state, store, cleanup } = await setupVoting();
  const post = { id: '1', side: 'a', authorId: '1', name: '나', text: '첫 번째', createdAt: 1 };
  let complete;
  store.reveal = jest.fn();
  store.post = jest.fn(() => new Promise(resolve => { complete = () => { state.posts.push(post); resolve(post); }; }));
  state.mySide = 'a'; store.subscribe.mock.calls[0][0]([]);
  document.querySelector('.composer-avatar[data-side="a"]').click();
  try {
    const input = document.querySelector('#message');
    input.focus(); input.value = post.text; input.dispatchEvent(new Event('input'));
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(input).toHaveFocus();
    expect(input).not.toBeDisabled();
    expect(input).not.toHaveAttribute('readonly');
    expect(input).toHaveValue('');
    expect(document.querySelector('#send')).toBeDisabled();
    input.value = '두 번째'; input.dispatchEvent(new Event('input'));
    expect(document.querySelector('#send')).toBeEnabled();
    complete(); await Promise.resolve(); await Promise.resolve();
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute('readonly');
    expect(input).toHaveValue('두 번째');
    expect(document.querySelector('#send')).toBeEnabled();
    expect(store.reveal).not.toHaveBeenCalled();
  } finally { cleanup(); Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth }); }
});

it('전송 실패 시 입력 내용과 포커스를 유지하고 다시 시도할 수 있다', async () => {
  const { state, store, cleanup } = await setupVoting();
  store.post = jest.fn().mockRejectedValue(new Error('전송에 실패했어요'));
  state.mySide = 'a'; store.subscribe.mock.calls[0][0]([]);
  document.querySelector('.composer-avatar[data-side="a"]').click();
  try {
    const input = document.querySelector('#message');
    input.focus(); input.value = '다시 보낼 내용'; input.dispatchEvent(new Event('input'));
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(input).toHaveFocus();
    expect(input).toHaveValue('다시 보낼 내용');
    expect(input).not.toHaveAttribute('readonly');
    expect(document.querySelector('#send')).toBeEnabled();
    expect(document.querySelector('#composer-note')).toHaveTextContent('전송에 실패했어요');
  } finally { cleanup(); }
});

it('첫 요청과 발사 연출을 기다리지 않고 다음 글을 보내며 늦은 응답이 새 초안을 비우지 않는다', async () => {
  const { state, store, arena, cleanup } = await setupVoting();
  const requests = [];
  store.post = jest.fn((_room, payload) => new Promise(resolve => requests.push({ payload, resolve })));
  arena.launch.mockReturnValue(new Promise(() => {}));
  state.mySide = 'a'; store.subscribe.mock.calls[0][0]([]);
  document.querySelector('.composer-avatar[data-side="a"]').click();
  try {
    const input = document.querySelector('#message'), form = document.querySelector('#composer');
    input.focus();
    for (const text of ['첫 번째', '두 번째']) {
      input.value = text; input.dispatchEvent(new Event('input'));
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(input).toHaveFocus(); expect(input).toHaveValue('');
      expect(input).not.toHaveAttribute('readonly');
    }
    expect(requests.map(({ payload }) => payload.text)).toEqual(['첫 번째', '두 번째']);
    expect(new Set(requests.map(({ payload }) => payload.postId)).size).toBe(2);
    input.value = '세 번째 작성 중'; input.dispatchEvent(new Event('input'));
    for (const index of [1, 0]) {
      const post = { id: String(index + 1), side: 'a', authorId: '1', name: '나', text: requests[index].payload.text, createdAt: 1 };
      state.posts.push(post); requests[index].resolve(post);
      await Promise.resolve(); await Promise.resolve();
      expect(input).toHaveFocus(); expect(input).toHaveValue('세 번째 작성 중');
      expect(document.querySelector('#send')).toBeEnabled();
    }
    expect(arena.launch).toHaveBeenCalledTimes(2);
  } finally { cleanup(); }
});

it('늦게 실패한 글은 새 초안을 덮지 않고 동일한 요청 ID로 별도 재전송한다', async () => {
  const { state, store, cleanup } = await setupVoting();
  let rejectFirst;
  store.post = jest.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
    .mockImplementationOnce(async (_room, payload) => {
      const post = { id: '1', side: 'a', authorId: '1', name: '나', text: payload.text, createdAt: 1 };
      state.posts.push(post); return post;
    });
  state.mySide = 'a'; store.subscribe.mock.calls[0][0]([]);
  document.querySelector('.composer-avatar[data-side="a"]').click();
  try {
    const input = document.querySelector('#message'), form = document.querySelector('#composer');
    input.focus(); input.value = '실패할 글'; input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    const original = store.post.mock.calls[0][1];
    input.value = '다음 초안'; input.dispatchEvent(new Event('input'));
    rejectFirst(new Error('연결이 끊겼어요'));
    await Promise.resolve(); await Promise.resolve();
    expect(input).toHaveValue('다음 초안'); expect(input).toHaveFocus();
    expect(document.querySelector('#composer-note')).toHaveTextContent('실패할 글');
    document.querySelector('.composer-avatar[data-side="a"]').click();
    const retry = document.querySelector('.composer-retry');
    expect(retry).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_post_submit');
    retry.click(); await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.composer-avatar[data-side="a"]')).toHaveAttribute('aria-expanded', 'true');
    expect(store.post.mock.calls[1][1]).toEqual(original);
    expect(input).toHaveValue('다음 초안'); expect(input).toHaveFocus();
    expect(document.querySelector('.composer-retry')).not.toBeInTheDocument();
  } finally { cleanup(); }
});


it('연속 전송 각각의 받아칠 대상을 보존하고 저장 대기 중에는 편 변경만 막는다', async () => {
  const { state, store, cleanup } = await setupVoting();
  const parent = { id: 'parent', side: 'b', authorId: '2', name: '상대', text: '먼저 한마디', createdAt: 1 };
  state.posts.push(parent); state.mySide = 'a';
  const requests = [];
  store.post = jest.fn((_room, payload) => new Promise(resolve => requests.push({ payload, resolve })));
  store.subscribe.mock.calls[0][0]([]);
  try {
    document.querySelector('.history-item').click();
    const input = document.querySelector('#message'), form = document.querySelector('#composer');
    input.value = '답장'; input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    input.value = '새 한마디'; input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(requests.map(({ payload }) => payload.replyToId)).toEqual(['parent', null]);
    const otherSide = document.querySelector('.composer-avatar[data-side="b"]');
    expect(otherSide).toBeDisabled(); otherSide.click();
    expect(store.vote).not.toHaveBeenCalled();
    expect(input).toHaveFocus(); expect(input).toBeEnabled();
    for (const [index, request] of requests.entries()) {
      const sent = { id: String(index + 1), side: 'a', authorId: '1', name: '나', text: request.payload.text, createdAt: 2 };
      state.posts.push(sent); request.resolve(sent);
      await Promise.resolve(); await Promise.resolve();
      if (index === 0) expect(otherSide).toBeDisabled();
    }
    expect(otherSide).toBeEnabled();
  } finally { cleanup(); }
});


it('내 캐릭터를 누르면 투표 없이 말풍선을 열고 접으며 초안과 닫힌 상태를 유지한다', async () => {
  const { state, store, cleanup } = await setupVoting();
  state.mySide = 'b'; store.subscribe.mock.calls[0][0]([]);
  try {
    const avatar = document.querySelector('.composer-avatar[data-side="b"]');
    const drawer = document.querySelector('#composer-panel-b'), input = document.querySelector('#message-b');
    expect(document.querySelector('.composer-choice')).not.toBeInTheDocument();
    expect(avatar).toHaveTextContent('눌러서 한마디');
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    expect(drawer.inert).toBe(true);
    avatar.click();
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
    expect(avatar).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_composer_toggle');
    expect(drawer.inert).toBe(false);
    expect(input).toHaveFocus();
    input.value = '잠깐 접어둘 글'; input.dispatchEvent(new Event('input'));
    avatar.click();
    expect(drawer.inert).toBe(true);
    expect(avatar).toHaveFocus();
    store.subscribe.mock.calls[0][0]([]);
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    avatar.click();
    expect(input).toHaveFocus();
    expect(input).toHaveValue('잠깐 접어둘 글');
    expect(store.vote).not.toHaveBeenCalled();
  } finally { cleanup(); }
});

it('마감된 토론의 캐릭터는 입력창을 열거나 편을 바꾸지 않는다', async () => {
  const { state, store, cleanup } = await setupVoting();
  state.mySide = 'a'; state.topic.closesAt = new Date(Date.now() - 1000).toISOString();
  store.subscribe.mock.calls[0][0]([]);
  try {
    for (const avatar of document.querySelectorAll('.composer-avatar')) {
      expect(avatar).toBeDisabled(); expect(avatar).toHaveTextContent('마감된 토론');
      avatar.click(); expect(avatar).toHaveAttribute('aria-expanded', 'false');
    }
    expect(store.vote).not.toHaveBeenCalled();
  } finally { cleanup(); }
});
