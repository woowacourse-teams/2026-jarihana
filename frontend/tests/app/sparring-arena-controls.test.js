import { createRequestId } from '../../public/sparring-arena/src/request-id.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';
import { createCharacterDuel } from '../../public/sparring-arena/src/character-duel.js';
import { revealComposer } from '../../public/sparring-arena/src/composer.js';

it('편을 고르기 전에 누른 말풍선도 받아치기 대상으로 유지하고 편 선택 후 전송한다', async () => {
  const first = { id: '1', side: 'a', authorId: 'crew', name: '크루', text: '기다리면 금방이야', createdAt: 1 };
  const second = { id: '2', side: 'b', authorId: 'coach', name: '코치', text: '점심시간이 더 소중해', createdAt: 2 };
  const state = { actorId: null, mySide: null, topic: { id: 'topic', title: '점심', a: '맛', b: '시간' },
    posts: [first, second], postCount: 2, connection: 'connected', balance: { total: 2, a: 1, b: 1, ratio: 0.5 } };
  const store = { snapshot: () => state, subscribe: jest.fn(), reportHeight: jest.fn(), vote: jest.fn(async (_room, _actor, _name, side) => { state.mySide = side; }), post: jest.fn(async () => second) };
  const base = path.join(__dirname, '../../public/sparring-arena');
  const html = readFileSync(path.join(base, 'index.html'), 'utf8');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const originalResizeObserver = global.ResizeObserver, originalScrollIntoView = Element.prototype.scrollIntoView;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {} }) });
  global.ResizeObserver = class { observe() {} disconnect() {} };
  Element.prototype.scrollIntoView = jest.fn();
  let cast;
  store.reportScene = jest.fn();
  const createArena = (container, onSelect, onReveal, onReply) => {
    cast = createHistoryConversation(container.parentElement, onReply, onReveal, { draw() {}, hide() {}, project: point => point });
    cast.setLayout({ left: { x: 100, y: 200 }, right: { x: 300, y: 200 }, worldLeft: { x: -4.4, y: -6, z: 10 }, worldRight: { x: 4.4, y: -6, z: 10 }, width: 400 });
    return { updateState() {}, chooseSide() {}, launch() {}, dispose() {} };
  };
  try {
    const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('createRequestId', 'setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', 'revealComposer', source)(createRequestId, jest.fn(), jest.fn(), (...args) => ({ ...createArena(...args), ready: Promise.resolve() }), async () => store, revealComposer);
    cast.emerge(first, { x: 0, y: -6, z: 9 }, true);
    const bubble = document.querySelector('.history-conversation-speech[data-side="a"]');
    bubble.click();
    expect(store.vote).not.toHaveBeenCalled();
    expect(document.querySelector('#post-text')).toHaveTextContent(first.text);
    expect(document.querySelector('#composer-note')).toHaveTextContent('받아치려면 아래 캐릭터를 눌러 내 편을 골라주세요.');
    expect(document.querySelector('#reply-target')).not.toBeVisible();
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(first.text);
    expect(bubble).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_reply_start');
    expect(bubble).not.toHaveAttribute('aria-pressed');
    expect(document.querySelector('.vote-option')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_vote');
    document.querySelector('.composer-avatar[data-side="b"]').click();
    await Promise.resolve(); await Promise.resolve();
    const input = document.querySelector('#message-b');
    expect(input).toHaveFocus();
    expect(document.querySelector('#reply-target')).toBeVisible();
    expect(input.parentElement).toContainElement(document.querySelector('#reply-target'));
    expect(document.querySelector('#reply-target-author')).toHaveTextContent('크루에게 받아치기');
    expect(document.querySelector('#composer-note')).not.toBeVisible();
    document.querySelector('.composer-avatar[data-side="a"]').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('#message').parentElement).toContainElement(document.querySelector('#reply-target'));
    document.querySelector('.composer-avatar[data-side="b"]').click();
    await Promise.resolve(); await Promise.resolve();
    expect(input.parentElement).toContainElement(document.querySelector('#reply-target'));
    input.value = '내 반박'; input.dispatchEvent(new Event('input'));
    document.querySelector('#send-b').click();
    expect(store.post).toHaveBeenCalledWith('topic', expect.objectContaining({ text: '내 반박', replyToId: first.id }));
    await Promise.resolve(); await Promise.resolve();
  } finally {
    cast?.dispose(); document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', originalMatchMedia); global.ResizeObserver = originalResizeObserver; Element.prototype.scrollIntoView = originalScrollIntoView;
  }
});

it('지난 대화와 대치 말풍선은 각각 누른 실제 의견을 받아치기 대상으로 고른다', async () => {
  const first = { id: '1', side: 'a', authorId: 'crew', name: '가온', text: '먼저 한 의견', createdAt: 1 };
  const second = { id: '2', side: 'b', authorId: 'coach', name: '하나', text: '반대편 의견', createdAt: 2, replyToId: '1', replyTo: first };
  const state = { actorId: 'me', mySide: 'a', topic: { id: 'topic', title: '점심', a: '맛', b: '시간' },
    posts: [second], postCount: 1, connection: 'live', balance: { total: 1, a: 1, b: 0, ratio: 1 } };
  const store = { snapshot: () => state, subscribe: jest.fn(), reportHeight: jest.fn(), reportScene: jest.fn(), reveal: jest.fn(), post: jest.fn(async () => second) };
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
    return { ready: Promise.resolve(), updateState() {}, launch() {}, dispose() {} };
  };
  try {
    const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('createRequestId', 'setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', 'revealComposer', source)(createRequestId, jest.fn(), jest.fn(), createArena, async () => store, revealComposer);
    history.emerge(second, { x: 0, y: -6, z: 9 }, true);
    const historyBubble = document.querySelector('.history-conversation-speech[data-side="b"]');
    historyBubble.click();
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(second.text);
    expect(document.querySelector('#reply-target')).toHaveTextContent('하나에게 받아치기');
    expect(document.querySelector('#message').parentElement).toContainElement(document.querySelector('#reply-target'));
    expect(historyBubble).toHaveAttribute('data-reply-selected', 'true');
    expect(document.querySelector('#message')).toHaveFocus();
    expect(document.querySelector('#send-label')).toHaveTextContent('받아치기');
    document.querySelector('#cancel-reply').click();
    expect(document.querySelector('#reply-target')).not.toBeVisible();
    expect(document.querySelector('#message')).toHaveFocus();
    historyBubble.click();
    duel.updateState([second]);
    duel.prepare(second, true, true).forEach(({ role }) => duel.emerge(role, { x: 100, y: 200 }, true));
    const duelBubble = document.querySelector('.left .duel-speech');
    duelBubble.click();
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(first.text);
    expect(duelBubble).toHaveAttribute('data-reply-selected', 'true');
    document.querySelector('#message').value = '내 반박';
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(store.post).toHaveBeenCalledWith('topic', expect.objectContaining({ text: '내 반박', replyToId: first.id }));
    await Promise.resolve(); await Promise.resolve();
  } finally {
    history?.dispose(); duel?.dispose(); document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', media); global.ResizeObserver = observer; Element.prototype.scrollIntoView = scroll;
  }
});

async function setupVoting(initialSide = null) {
  const state = { actorId: '1', mySide: initialSide, topic: { id: '1', title: '점심', a: '맛', b: '시간' }, posts: [], postCount: 0,
    connection: 'live', balance: { total: 0, a: 0, b: 0, ratio: 0.5 } };
  const store = { snapshot: () => state, subscribe: jest.fn(), reportHeight: jest.fn(), reportScene: jest.fn(), vote: jest.fn() };
  const base = path.join(__dirname, '../../public/sparring-arena');
  document.body.innerHTML = readFileSync(path.join(base, 'index.html'), 'utf8').match(/<body>([\s\S]*)<\/body>/)[1];
  const media = Object.getOwnPropertyDescriptor(window, 'matchMedia'), observer = global.ResizeObserver;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {} }) });
  global.ResizeObserver = class { observe() {} disconnect() {} };
  const arena = { ready: Promise.resolve(), updateState: jest.fn(), chooseSide: jest.fn(), launch: jest.fn(), setBrawl: jest.fn(), setSpeechOverlap: jest.fn(), setCharacterLimits: jest.fn(), dispose() {} };
  const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const createArena = jest.fn(() => arena);
  const listen = jest.spyOn(window, 'addEventListener');
  await new AsyncFunction('createRequestId', 'setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', 'revealComposer', source)(createRequestId, jest.fn(), jest.fn(), createArena, async () => store, revealComposer);
  const receive = listen.mock.calls.find(([kind]) => kind === 'message')[1];
  listen.mockRestore();
  return { state, store, arena, receive, reply: id => createArena.mock.calls[0][3](id), cleanup() { document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', media); global.ResizeObserver = observer; } };
}

it.each([['brawl', 'setBrawl'], ['speech-overlap', 'setSpeechOverlap']])('%s 임시 모드는 같은 출처 부모의 boolean 메시지만 받아 전환한다', async (kind, setter) => {
  const { arena, receive, cleanup } = await setupVoting();
  try {
    for (const value of [true, false]) receive(new MessageEvent('message', { source: window.parent, origin: location.origin,
      data: { channel: 'jarihana-sparring', kind, value } }));
    expect(arena[setter].mock.calls).toEqual([[true], [false]]);
    for (const invalid of [{ value: 'true' }, { origin: 'https://example.com', value: true }, { source: null, value: true }]) {
      receive(new MessageEvent('message', { source: window.parent, origin: location.origin, ...invalid,
        data: { channel: 'jarihana-sparring', kind, value: invalid.value } }));
    }
    expect(arena[setter]).toHaveBeenCalledTimes(2);
  } finally { cleanup(); }
});

it('팀별 인원은 같은 출처 부모의 1~8 정수 또는 기본값만 전달한다', async () => {
  const { arena, receive, cleanup } = await setupVoting();
  const send = (value, overrides = {}) => receive(new MessageEvent('message', {
    source: window.parent, origin: location.origin,
    data: { channel: 'jarihana-sparring', kind: 'character-limits', value }, ...overrides,
  }));
  try {
    for (const value of [{ a: 1, b: 8 }, { a: null, b: 3 }, { a: null, b: null }]) send(value);
    expect(arena.setCharacterLimits).toHaveBeenCalledTimes(3);
    for (const value of [null, {}, { a: 2 }, { a: 0, b: 3 }, { a: 9, b: 3 }, { a: '2', b: 3 }, { a: 1.5, b: 3 }]) send(value);
    send({ a: 2, b: 3 }, { origin: 'https://example.com' });
    send({ a: 2, b: 3 }, { source: null });
    send({ a: 2, b: 3 }, { data: { channel: 'other', kind: 'character-limits', value: { a: 2, b: 3 } } });
    expect(arena.setCharacterLimits).toHaveBeenCalledTimes(3);
  } finally { cleanup(); }
});

it.each([['a', true], ['b', true], ['a', false], ['b', false]])('입장 시 %s 편 입력창을 열고 이후 수동 접기를 유지한다 (초기 선택: %s)', async (side, initial) => {
  const { state, store, receive, cleanup } = await setupVoting(initial ? side : null);
  try {
    if (!initial) { state.mySide = side; store.subscribe.mock.calls[0][0]([]); }
    const avatar = document.querySelector(`.composer-avatar[data-side="${side}"]`);
    const input = document.querySelector(`[data-input-side="${side}"]`);
    const drawer = document.querySelector(`#composer-panel-${side}`);
    expect(drawer.inert).toBe(true);
    receive(new MessageEvent('message', { source: window.parent, origin: location.origin,
      data: { channel: 'jarihana-sparring', kind: 'composer-open', side } }));
    expect(drawer.inert).toBe(false);
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector(`#composer-panel-${side === 'a' ? 'b' : 'a'}`).inert).toBe(true);
    expect(input).not.toHaveFocus();
    expect(store.vote).not.toHaveBeenCalled();
    input.value = '입장 후 작성 중'; input.dispatchEvent(new Event('input'));
    avatar.click();
    store.subscribe.mock.calls[0][0]([]);
    expect(drawer.inert).toBe(true);
    avatar.click();
    expect(input).toHaveValue('입장 후 작성 중');
    document.querySelector('#scene').click();
    store.subscribe.mock.calls[0][0]([]);
    expect(drawer.inert).toBe(true);
    expect(input).toHaveValue('입장 후 작성 중');
  } finally { cleanup(); }
});

it('입력창 열기는 같은 출처의 부모가 저장된 편으로 요청한 경우에만 허용한다', async () => {
  const { state, receive, cleanup } = await setupVoting('a');
  const data = { channel: 'jarihana-sparring', kind: 'composer-open', side: 'a' };
  try {
    for (const overrides of [
      { source: null }, { origin: 'https://other.example' },
      { data: { ...data, channel: 'other' } }, { data: { ...data, side: 'b' } },
      { data: { ...data, side: null } }
    ]) {
      receive(new MessageEvent('message', { source: window.parent, origin: location.origin, data, ...overrides }));
      expect(document.querySelector('#composer-panel-a').inert).toBe(true);
      expect(document.querySelector('#composer-panel-b').inert).toBe(true);
    }
    state.topic.closesAt = new Date(Date.now() - 1000).toISOString();
    receive(new MessageEvent('message', { source: window.parent, origin: location.origin, data }));
    expect(document.querySelector('#composer-panel-a').inert).toBe(true);
  } finally { cleanup(); }
});

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
    expect(document.querySelector('#seat-instruction')).toBeEmptyDOMElement();
    expect(document.querySelector('#stage-status')).toHaveTextContent('코랄 편 선택을 저장하고 있어요…');
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
    expect(document.querySelector('#seat-instruction')).toBeEmptyDOMElement();
    expect(document.querySelector('#stage-status')).toHaveTextContent('코랄 편으로 투표했어요');
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
    expect(mint).toHaveAccessibleName('맛 · 입력창 열기');
    expect(coral).toHaveAccessibleName('시간 · 입력창 열기');
    mint.click();
    expect(mint).toHaveAttribute('aria-pressed', 'true');
    expect(coral).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_vote');
    input.focus(); input.value = '작성 중인 한마디'; input.dispatchEvent(new Event('input'));
    coral.click();
    expect(input).toHaveFocus(); expect(input).toHaveValue('작성 중인 한마디');
    expect(mint).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('#send')).toBeDisabled();
    expect(store.vote).toHaveBeenCalledWith('1', '1', '', 'b');
    expect(document.querySelector('#seat-instruction')).toBeEmptyDOMElement();
    expect(document.querySelector('#stage-status')).toHaveTextContent('코랄 편 선택을 저장하고 있어요…');
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
    let finish;
    store.vote.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    button.click();
    expect(document.querySelector('#seat-instruction')).toBeEmptyDOMElement();
    expect(document.querySelector('#stage-status')).toHaveTextContent('민트 편 선택을 저장하고 있어요…');
    expect(button).toHaveAttribute('aria-busy', 'true');
    state.mySide = 'a'; finish(); await Promise.resolve(); await Promise.resolve();
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
  const { state, store, reply, cleanup } = await setupVoting();
  const parent = { id: 'parent', side: 'b', authorId: '2', name: '상대', text: '먼저 한마디', createdAt: 1 };
  state.posts.push(parent); state.mySide = 'a';
  const requests = [];
  store.post = jest.fn((_room, payload) => new Promise(resolve => requests.push({ payload, resolve })));
  store.subscribe.mock.calls[0][0]([]);
  try {
    reply(parent.id);
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
    expect(avatar).toHaveTextContent('내 생각은…');
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    expect(drawer.inert).toBe(true);
    avatar.querySelector('.composer-hint').click();
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

it.each(['a', 'b'])('%s 입력창 밖을 클릭하면 접히고 초안과 받아치기 대상은 남는다', async side => {
  const { state, store, reply, cleanup } = await setupVoting();
  state.mySide = side;
  const post = { id: 'outside-reply', side: 'a', authorId: 'other', name: '크루', text: '받아칠 의견', createdAt: 1 };
  state.posts.push(post); store.subscribe.mock.calls[0][0]([]);
  try {
    reply(post.id);
    const avatar = document.querySelector(`.composer-avatar[data-side="${side}"]`);
    const input = document.querySelector(`[data-input-side="${side}"]`);
    input.value = '작성 중인 답변'; input.dispatchEvent(new Event('input'));
    input.click();
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
    document.querySelector('#scene').click();
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveFocus();
    expect(avatar).not.toHaveFocus();
    store.subscribe.mock.calls[0][0]([]);
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    avatar.click();
    expect(input).toHaveValue('작성 중인 답변');
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(post.text);
    reply(post.id);
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveFocus();
  } finally { cleanup(); }
});

it.each(['a', 'b'])('%s 캐릭터로 말풍선을 접어도 초안과 받아치기 대상을 보존한다', async side => {
  const { state, store, reply, cleanup } = await setupVoting();
  state.mySide = side;
  const post = { id: '1', side: side === 'a' ? 'b' : 'a', authorId: 'other', name: '다른 사람', text: '받아칠 의견', createdAt: 1 };
  state.posts.push(post); store.subscribe.mock.calls[0][0]([]);
  store.post = jest.fn(async () => post);
  try {
    reply(post.id);
    const device = document.querySelector(`[data-composer-side="${side}"]`);
    const avatar = device.querySelector('.composer-avatar'), input = device.querySelector('textarea');
    input.value = '접었다 이어서 쓸 답변'; input.dispatchEvent(new Event('input'));
    expect(avatar).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_composer_toggle');
    expect(input.parentElement).toContainElement(document.querySelector('#reply-target'));
    avatar.click();
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    expect(avatar).toHaveFocus();
    expect(device.querySelector('.composer-drawer').inert).toBe(true);
    expect(store.post).not.toHaveBeenCalled();
    store.subscribe.mock.calls[0][0]([]);
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    avatar.click();
    expect(input).toHaveFocus();
    expect(input).toHaveValue('접었다 이어서 쓸 답변');
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(post.text);
    device.querySelector('[type=submit]').click();
    expect(store.post).toHaveBeenCalledWith('1', expect.objectContaining({ text: '접었다 이어서 쓸 답변', replyToId: post.id }));
    await Promise.resolve(); await Promise.resolve();
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

it('같은 편에도 받아칠 수 있고 편을 변경한 뒤에도 원문과 초안을 유지한다', async () => {
  const { state, store, reply, cleanup } = await setupVoting();
  const post = { id: 'opinion', side: 'b', authorId: '2', name: '상대', text: '의견', createdAt: 1 };
  state.posts.push(post); state.mySide = 'b';
  store.post = jest.fn(async (_room, data) => ({ ...post, id: 'reply', text: data.text }));
  store.subscribe.mock.calls[0][0]([]);
  try {
    reply(post.id);
    expect(document.querySelector('#reply-target')).toBeVisible();
    const input = document.querySelector('#message-b');
    input.value = '작성 중인 답변'; input.dispatchEvent(new Event('input'));
    state.mySide = 'a'; store.subscribe.mock.calls[0][0]([]);
    expect(document.querySelector('#message')).toHaveValue('작성 중인 답변');
    state.mySide = 'b'; store.subscribe.mock.calls[0][0]([]);
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(store.post).toHaveBeenCalledWith('1', expect.objectContaining({ text: '작성 중인 답변', replyToId: post.id }));
    await Promise.resolve(); await Promise.resolve();
  } finally { cleanup(); }
});

it.each([[1200, 'a', 'b'], [1200, 'b', 'a'], [1200, 'a', 'a'], [390, 'a', 'b'], [390, 'b', 'a'], [390, 'b', 'b']])('%ipx에서 내 편 %s와 원문 편 %s를 구분하고 취소해도 초안을 유지한다', async (width, side, targetSide) => {
  const previousWidth = window.innerWidth;
  window.innerWidth = width;
  const { state, store, reply, cleanup } = await setupVoting();
  try {
    const post = { id: 'source', side: targetSide, authorId: '2', name: '원문 작성자', text: '받아칠 원래 의견', createdAt: 1 };
    state.posts.push(post); state.mySide = side;
    store.subscribe.mock.calls[0][0]([]);
    reply(post.id);
    const target = document.querySelector('#reply-target');
    const input = document.querySelector(width <= 700 || side === 'a' ? '#message' : '#message-b');
    expect(target).toHaveAttribute('data-side', targetSide);
    expect(target).toHaveAccessibleName(`${targetSide === 'a' ? '민트' : '코랄'} 편의 받아칠 의견`);
    expect(target).toHaveAttribute('data-ph-private');
    expect(input).toHaveAccessibleDescription('원문 작성자에게 받아치기 받아칠 원래 의견');
    expect(document.querySelector('#composer')).toHaveAttribute('data-side', side);
    input.value = '이어 쓰던 답변'; input.dispatchEvent(new Event('input'));
    expect(input).toHaveFocus();
    document.querySelector('#cancel-reply').click();
    expect(target).not.toBeVisible();
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).toHaveValue('이어 쓰던 답변');
    expect(input).toHaveFocus();
  } finally { cleanup(); window.innerWidth = previousWidth; }
});

it('받아치기 전송 실패 뒤에도 원문 편의 말풍선과 입력란 설명을 복원한다', async () => {
  const { state, store, reply, cleanup } = await setupVoting();
  try {
    state.mySide = 'a';
    state.posts.push({ id: 'source', side: 'b', authorId: '2', name: '코랄친구', text: '원래 의견', createdAt: 1 });
    store.post = jest.fn().mockRejectedValue(new Error('전송 실패'));
    store.subscribe.mock.calls[0][0]([]);
    reply('source');
    const input = document.querySelector('#message');
    input.value = '내 답변'; input.dispatchEvent(new Event('input'));
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('#reply-target')).toBeVisible();
    expect(document.querySelector('#reply-target')).toHaveAttribute('data-side', 'b');
    expect(input).toHaveValue('내 답변');
    expect(input).toHaveAccessibleDescription('코랄친구에게 받아치기 원래 의견');
  } finally { cleanup(); }
});


it('모바일은 편을 바꿔도 같은 입력창과 초안을 유지하고 오른쪽 편으로 연속 전송한다', async () => {
  const width = window.innerWidth;
  window.innerWidth = 390;
  const { state, store, cleanup } = await setupVoting();
  store.vote.mockImplementation(async (_room, _actor, _name, side) => { state.mySide = side; });
  store.post = jest.fn(async (_room, data) => {
    const post = { id: String(state.posts.length + 1), side: state.mySide, authorId: '1', name: '나', text: data.text, createdAt: 1 };
    state.posts.push(post); return post;
  });
  try {
    const input = document.querySelector('#message');
    expect(input).toBeEnabled();
    input.focus(); input.value = '편을 고르기 전 초안'; input.dispatchEvent(new Event('input'));
    expect(document.querySelector('#send')).toBeDisabled();
    for (const side of ['a', 'b']) {
      document.querySelector(`.composer-avatar[data-side="${side}"]`).click();
      await Promise.resolve(); await Promise.resolve();
      expect(input).toHaveFocus();
      expect(input).toHaveValue('편을 고르기 전 초안');
      expect(document.querySelector('#send')).toBeEnabled();
      expect(document.querySelector('#message-b')).toBeDisabled();
      expect(document.querySelector('[data-composer-side="a"]')).toHaveAttribute('data-expanded', 'true');
      expect(document.querySelector('[data-composer-side="b"]')).toHaveAttribute('data-expanded', 'false');
    }
    document.querySelector('.composer-avatar[data-side="b"]').click();
    expect(input).toHaveFocus();
    expect(document.querySelector('#composer-panel-a').inert).toBe(false);
    document.querySelector('#send').click();
    await Promise.resolve(); await Promise.resolve();
    expect(store.post).toHaveBeenCalledWith('1', expect.objectContaining({ text: '편을 고르기 전 초안' }));
    expect(state.posts[0].side).toBe('b');
    expect(input).toHaveValue(''); expect(input).toHaveFocus();
    input.value = '다음 메시지'; input.dispatchEvent(new Event('input'));
    expect(input).toHaveFocus(); expect(document.querySelector('#send')).toBeEnabled();
  } finally { cleanup(); window.innerWidth = width; }
});

it('모바일에서 받아치기를 선택하면 입력창 이름과 안내가 받아치기로 바뀐다', async () => {
  const width = window.innerWidth;
  window.innerWidth = 390;
  const { state, store, reply, cleanup } = await setupVoting();
  try {
    state.mySide = 'b';
    state.posts.push({ id: 'reply-target', side: 'a', authorId: '2', name: '크루', text: '받아칠 말', createdAt: 1 });
    store.subscribe.mock.calls[0][0]([]);
    reply('reply-target');
    expect(document.querySelector('#composer-label')).toHaveTextContent('시간 · 받아치기');
    expect(document.querySelector('#message')).toHaveAttribute('placeholder', '이 의견에 한마디 받아쳐볼까요?');
    document.querySelector('#cancel-reply').click();
    expect(document.querySelector('#composer-label')).toHaveTextContent('시간 · 한마디');
  } finally { cleanup(); window.innerWidth = width; }
});

it('리플레이 최근 30개에서 제외된 메시지도 받은 발사 데이터로 모두 발사한다', async () => {
  const { state, store, arena, cleanup } = await setupVoting();
  try {
    const livePosts = Array.from({ length: 1000 }, (_, index) => ({
      id: String(index + 1), side: 'a', authorId: '2', name: '상대', text: `메시지 ${index + 1}`, createdAt: index + 1
    }));
    state.posts = livePosts.slice(-30);
    state.postCount = 1000;
    store.subscribe.mock.calls[0][0](livePosts.map(post => post.id), livePosts);
    expect(arena.launch.mock.calls.map(([post]) => post.id)).toEqual(livePosts.map(post => post.id));
    expect(arena.updateState.mock.calls.at(-1)[0]).toHaveLength(30);
  } finally { cleanup(); }
});

it('1000건이 수신되어도 내 메시지의 받아치기 대상을 도착 후 8초까지 유지한다', async () => {
  jest.useFakeTimers();
  const { state, store, arena, reply, cleanup } = await setupVoting();
  try {
    const post = { id: 'mine', authorId: '1', name: '나', side: 'a', text: '내가 보낸 말', createdAt: 1 };
    state.mySide = 'a';
    store.post = jest.fn().mockResolvedValue(post);
    arena.launch.mockResolvedValue();
    const receive = store.subscribe.mock.calls[0][0];
    receive([]);
    document.querySelector('#message').value = post.text;
    document.querySelector('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(store.post).toHaveBeenCalled();
    const incoming = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i + 2), authorId: '2', name: '다른 사람', side: 'b', text: '새 말 ' + i, createdAt: i + 2
    }));
    state.posts = incoming.slice(-30);
    receive(incoming.map(item => item.id), incoming);
    jest.advanceTimersByTime(20000);
    expect(arena.updateState.mock.calls.at(-1)[0]).toHaveLength(30);
    reply(post.id);
    expect(document.querySelector('#reply-target')).not.toHaveAttribute('hidden');
    expect(document.querySelector('#reply-target-text')).toHaveTextContent(post.text);
    document.querySelector('#cancel-reply').click();
    document.querySelector('#scene').dispatchEvent(new CustomEvent('capsuleready', { detail: { id: 'mine' } }));
    jest.advanceTimersByTime(7999);
    reply(post.id);
    expect(document.querySelector('#reply-target')).not.toHaveAttribute('hidden');
    document.querySelector('#cancel-reply').click();
    jest.advanceTimersByTime(1);
    reply(post.id);
    expect(document.querySelector('#reply-target')).toHaveAttribute('hidden');
  } finally {
    window.dispatchEvent(new Event('pagehide'));
    cleanup();
    jest.useRealTimers();
  }
});
