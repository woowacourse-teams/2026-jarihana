import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';

it('캐릭터 말풍선 클릭은 전문만 선택하고 투표나 로그인 요청을 만들지 않는다', async () => {
  const first = { id: '1', side: 'a', authorId: 'crew', name: '크루', text: '기다리면 금방이야', createdAt: 1 };
  const second = { id: '2', side: 'b', authorId: 'coach', name: '코치', text: '점심시간이 더 소중해', createdAt: 2 };
  const state = { actorId: null, mySide: null, topic: { id: 'topic', title: '점심', a: '맛', b: '시간' },
    posts: [first, second], postCount: 2, connection: 'connected', balance: { total: 2, a: 1, b: 1, ratio: 0.5 }, more: { all: false, mine: false } };
  const store = { snapshot: () => state, subscribe: jest.fn(), reportHeight: jest.fn(), vote: jest.fn() };
  const base = path.join(__dirname, '../../public/sparring-arena');
  const html = readFileSync(path.join(base, 'index.html'), 'utf8');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const originalResizeObserver = global.ResizeObserver;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {} }) });
  global.ResizeObserver = class { observe() {} disconnect() {} };
  let cast;
  const createArena = (container, onSelect, onReveal) => {
    cast = createHistoryConversation(container.parentElement, onSelect, onReveal, { draw() {}, hide() {}, project: point => point });
    cast.setLayout({ left: { x: 100, y: 200 }, right: { x: 300, y: 200 }, worldLeft: { x: -4.4, y: -6, z: 10 }, worldRight: { x: 4.4, y: -6, z: 10 }, width: 400 });
    return { updateState() {}, dispose() {} };
  };
  try {
    const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', source)(jest.fn(), jest.fn(), createArena, async () => store);
    cast.emerge(first, { x: 0, y: -6, z: 9 }, true);
    const bubble = document.querySelector('.history-conversation-speech[data-side="a"]');
    bubble.click();
    expect(store.vote).not.toHaveBeenCalled();
    expect(document.querySelector('#post-text')).toHaveTextContent(first.text);
    expect(bubble).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_history_character_select');
    expect(bubble).not.toHaveAttribute('aria-pressed');
    expect(document.querySelector('.vote-option')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_vote');
  } finally {
    cast?.dispose(); document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', originalMatchMedia); global.ResizeObserver = originalResizeObserver;
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
  const arena = { updateState: jest.fn(), chooseSide: jest.fn(), dispose() {} };
  const source = readFileSync(path.join(base, 'src/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('setupComposer', 'animateCapsuleSend', 'createArena', 'connectRoom', source)(jest.fn(), jest.fn(), () => arena, async () => store);
  return { state, store, arena, cleanup() { document.body.replaceChildren(); Object.defineProperty(window, 'matchMedia', media); global.ResizeObserver = observer; } };
}

it.each(['vote-flag', 'pipe-meter'])('%s에서 첫 편을 선택하면 저장 후 입력창과 파이프가 활성화된다', async (target) => {
  const { state, store, arena, cleanup } = await setupVoting();
  let finish;
  store.vote.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  try {
    const button = document.querySelector('.' + target + '[data-side="b"]'), input = document.querySelector('#message');
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
    expect(document.querySelector('#composer')).toHaveAttribute('data-side', 'b');
    expect(arena.chooseSide).toHaveBeenCalledWith('b');
    input.value = '한마디'; input.dispatchEvent(new Event('input'));
    expect(document.querySelector('#send')).toBeEnabled();
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
    expect(document.querySelector('#seat-instruction')).toHaveTextContent('민트 편으로 참여 중');
    expect(document.querySelector('#message')).toBeEnabled();
  } finally { cleanup(); }
});
